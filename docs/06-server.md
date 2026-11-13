# Verification server

A small HTTP service that hands out match seeds and verifies results by replaying them
with the same simulation code the client runs. Design rationale is in
[Anti-cheat](05-anti-cheat.md); this document is the operating manual.

## Shape

- **One file to deploy.** `npm run build:server` bundles the server and the shared
  simulation into `dist-server/server.js` (~50 kB). It needs Node 22.13+ and nothing else:
  no `node_modules`, no native add-ons.
- **One file of data.** SQLite through Node's built-in driver, in WAL mode. Backup is
  copying the file.
- **Zero runtime dependencies.** `node:http`, `node:sqlite`, `node:crypto`.
- **Optional for players.** With no server configured or reachable, the game plays
  identically and results stay on the device.

```
server/
├─ main.ts        # node:http adapter, env config, logging, shutdown
├─ app.ts         # route table and handlers (plain objects in/out — tested without a socket)
├─ verify.ts      # log validation + replay using src/core
├─ identity.ts    # player id from public key, signature check
├─ ratelimit.ts   # per-address fixed-window limiter
└─ store.ts       # Store interface + SQLite implementation
```

## Run

With Docker, `docker compose up --build` starts the server together with the game; nginx
serves the client and proxies `/api/` to the server, so both share one origin and no CORS
setup is needed. The database lives in the `data` volume. The server image is the
bundled file on `node:26-alpine`, running as a non-root user with a health check.

Without Docker:

```sh
npm run server                      # build + start on :8787
# or
npm run build:server
PORT=8787 DB_PATH=/var/lib/legend-td/data.sqlite node dist-server/server.js
```

Point the client at it at build time:

```sh
VITE_API_URL=https://api.example.com npm run build
```

For local development copy `.env.example` to `.env.local`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Listen port |
| `DB_PATH` | `./legend-td.sqlite` | Database file |
| `CORS_ORIGIN` | `*` | Allowed origin; set to the game's URL in production |
| `TRUST_PROXY` | off | `1` to take the client address from `X-Forwarded-For` (only behind a proxy you control) |
| `LOG` | on | `0` silences the per-request log line |

Run it behind a TLS-terminating reverse proxy. Logs are one JSON object per line on
stdout. `SIGTERM` closes the listener and the database cleanly.

## API

All bodies are JSON. Errors are `{ "error": "<code>" }`.

### `GET /v1/health`
`{ "ok": true, "contentVersion": "0.1.0" }`

### `POST /v1/attempts`
Start a match. The server chooses the seed.

```json
{ "publicKey": "<base64url raw P-256 point>", "levelId": "open_field", "faction": "fire" }
```
→ `{ "attemptId": "...", "seed": 123456789, "playerId": "...", "contentVersion": "0.1.0" }`

### `POST /v1/results`
Submit the match's inputs. `payload` is a JSON **string**; `signature` is ECDSA
P-256/SHA-256 over exactly those bytes, so no canonical JSON form is needed.

```json
{ "payload": "{\"attemptId\":\"...\",\"tick\":5120,\"log\":[{\"tick\":1,\"cmd\":{...}}]}", "signature": "<base64url>" }
```
→ `{ "outcome": "won", "stars": 3, "ticks": 5120 }` — computed by the server. The client
never states an outcome.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `bad_request`, `bad_log` | Malformed body or log |
| 401 | `bad_signature` | Not signed by the key that started the attempt |
| 404 | `unknown_attempt` | |
| 409 | `already_submitted`, `content_changed` | One result per seed; game data changed since the attempt began |
| 410 | `attempt_expired` | Older than 3 hours |
| 413 | `too_large` | Body over 384 kB |
| 422 | `too_fast`, `unfinished` | Arrived sooner than the match could be played; log does not reach an ending |
| 429 | `rate_limited` | 30 writes or 120 reads per minute per address |

### `GET /v1/players/:playerId/progress`
`{ "playerId": "...", "progress": [{ "faction": "fire", "levelId": "open_field", "stars": 3 }] }`
— best verified stars per level.

## CPU cost

Measured with `npx -y vite-node tests/bench.ts`: replaying a match costs roughly
**3 ms per minute of game time** on one core (a 5½-minute match: ~17 ms), plus under a
millisecond for the signature check. Everything else is a primary-key lookup.

What keeps the cost bounded:

- **Cheapest checks first.** Shape → attempt lookup → expiry → time check → signature →
  log validation → replay. A bad request stops before the simulation runs.
- **Time gate.** A result for N ticks is refused unless at least N ticks' worth of real
  time (at the 3× top speed) has passed since the seed was issued. Nobody can make the server
  simulate a minute of game without waiting half a minute first.
- **One result per attempt**, rate-limited attempts, and hard caps: 60 game-minutes,
  6000 commands, 384 kB body.
- Prepared statements; no per-request allocation beyond the parsed body.

Replays run on the event loop. That is the right trade at this cost; if matches get
much longer or traffic much higher, `replay()` is a pure function and can move to a
worker pool without touching the routes.

## Extending

- **New endpoint:** add a handler and one line in the `routes` table in `server/app.ts`.
  Handlers take and return plain objects, so they are tested by calling them
  (`tests/server.test.ts`).
- **New storage:** implement the `Store` interface (five methods). Routes do not know
  SQLite exists.
- **Planned additions that fit this shape:** WebRTC signaling relay for P2P room codes,
  signed P2P match results, a signed unlock token for multiplayer, leaderboards.

## Current limits

- **Single process.** The rate limiter is in memory and SQLite is a local file. To run
  several instances, move both behind shared services via the same interfaces.
- **`node:sqlite` is marked experimental in Node 22** and prints a warning at start. On
  Node 26, which the images use, it starts without one.
- **Level unlocks in the client still read local progress.** The server records verified
  stars and the menu marks them with ✓, but nothing is gated on them yet — that arrives
  with the multiplayer unlock.
- **Not deployed.** No hosting is set up; the published client runs offline-only until
  `VITE_API_URL` is set as a repository variable for the deploy workflow.
- Bots that play legal moves, and unlimited thinking time while paused, are not
  prevented (see [Anti-cheat](05-anti-cheat.md#limits-worth-stating-plainly)).

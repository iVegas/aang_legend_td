# Anti-cheat

Cheat prevention is a project priority. This document sets out what can and cannot be
defended, and the design that follows from it.

## Starting point

The game runs entirely on the player's device, and anything on the device can be
modified: memory, saved progress, the code itself. No amount of client-side obfuscation
changes that; it only raises the effort slightly. So the rule is:

> **Never trust a result the client reports. Trust only what can be recomputed.**

The architecture already makes recomputation cheap. A match is fully determined by
`{ contentVersion, levelId, faction, seed, commands[] }`, and the simulation is pure
TypeScript with no browser dependencies. A server can replay any claimed match in
milliseconds and see for itself what happened.

## What is in place today

- **The simulation validates every command** (funds, cell rules, path sealing, tower
  ownership by faction). A tampered UI cannot make an illegal move; the command is
  dropped.
- **Determinism is tested in CI:** identical seed and commands give identical per-tick
  state hashes, and a match can be rebuilt from its command log alone.
- **Saves are command logs, not state dumps.** Resuming re-simulates, so a save cannot
  contain an impossible state (extra supplies, free towers) — only moves that were legal.

- **Replay verification is implemented** ([Server](06-server.md)): the server issues the
  seed, the client submits its signed command log, and the server replays it to derive
  outcome and stars. Verified stars are stored per anonymous device key.

What is *not* protected yet: the level unlocks the client shows still come from local
storage and can be edited. Nothing shared depends on them today; the multiplayer unlock
will be gated on server-verified progress instead.

## Threats and answers

| Threat | Answer |
| --- | --- |
| Editing memory or storage for supplies, HP, stars | Server re-simulates the replay; the claimed result is ignored |
| Forging a replay | A replay is only a list of legal moves — forging one that wins *is* winning |
| Picking a lucky seed, or retrying one offline | Server issues the seed when the attempt starts and accepts one result per seed |
| Slow-motion or paused "perfect" play, bots | Compare tick count with wall-clock time between seed issue and submission; flag implausible command timing. Mitigation, not prevention |
| Modified client in P2P (stats, speed) | Lockstep: the cheater's simulation diverges and the hash check catches it |
| Lying about a P2P result | Both peers sign the final state hash; on disagreement the server replays the shared command log |
| Deliberate stalling or disconnecting when losing | Timeout forfeits the match; the server counts disconnects per identity |
| Reading hidden information (maphack) | Cannot be prevented between two peers. P2P modes use open information; simultaneous secret choices use commit–reveal |
| Skipping the campaign to enter P2P | Unlock becomes a server-signed token granted after verified campaign replays |

## Design

### Replay verification service

A small service that imports `src/core` and `src/content` directly (built; see
[Server](06-server.md)):

1. `POST /attempt` → server returns a random seed and an attempt id.
2. Client plays; the command log accumulates (it already does).
3. `POST /result` with the attempt id and command log → server replays it, derives the
   outcome and stars itself, and records them.

Because the client submits *inputs*, not *outcomes*, there is nothing to forge. The
content version is part of the attempt, so old replays are checked against the data
they were played on.

Offline play stays fully available; offline results are simply local-only and do not
count toward anything shared.

### Identity

An anonymous key pair generated on the device (WebCrypto, non-extractable private key)
signs submissions. It is enough to attach results, unlock tokens and disconnect counts
to one player without accounts or personal data. Accounts can be layered on later if
progress needs to move between devices.

### P2P results

- During the handshake peers exchange public keys and agree on seed, level and content
  version.
- At the end each peer signs `{ matchId, finalTick, finalHash, winner }`.
- Two matching signatures → accepted as is, no replay needed.
- Mismatch or one missing signature → the server replays the command log, which both
  peers hold in full, and decides.

### Limits worth stating plainly

- **Automation cannot be eliminated.** A bot that plays legal moves well is, to the
  server, a good player. Timing heuristics and rate limits deter the casual case only.
- **Collusion** (two friends trading wins) is a ranking-design problem — rating systems
  and match limits — not something verification solves.
- **Client-side secrets do not exist.** Anything shipped to the browser, including any
  key or check, is readable. All enforcement lives in the simulation rules and on the
  server.

## Consequences for the roadmap

- Determinism stays a hard requirement for every future system, including AI
  controllers (they must draw randomness from the state RNG).
- Any change to rules or numbers bumps `contentVersion`.
- The verification backend exists for single-player results. P2P result signing, the
  multiplayer unlock token and the signaling relay are added to it in M7.

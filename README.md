# Aang Legend TD

A mobile-first PWA tower defense game set in the world of the four nations.
Pick a faction, wall off the map, and hold your base against the other three.

> **Status:** Defense mode is playable (roadmap M0–M2): four selectable nations, four levels,
> placeholder art. Attack, Two-way and P2P modes are designed but not built.

## Run it

```sh
npm install
npm run dev        # local dev server
npm test           # simulation tests, including determinism and replay
npm run build      # production PWA in dist/
npm run server     # verification server on :8787 (optional; see docs/06-server.md)
```

`npm run lint` and `npm run typecheck` are what CI runs alongside the tests.

## Docs

| Doc | What it covers |
| --- | --- |
| [Game design](docs/01-game-design.md) | Core loop, map and grid, pathfinding rules, factions, towers, units, economy |
| [Architecture](docs/02-architecture.md) | Tech stack, module layout, deterministic simulation, rendering, PWA, testing |
| [Game modes](docs/03-game-modes.md) | Defense, Attack (reversed), Two-way, and unlockable P2P multiplayer |
| [Anti-cheat](docs/05-anti-cheat.md) | Threat model and how replays make results verifiable |
| [Server](docs/06-server.md) | Verification server: running it, API, CPU cost, extending |
| [Roadmap and initial tasks](docs/04-roadmap.md) | Milestones, first task list, open questions |

## The game in one paragraph

The map is a portrait grid of squares. Enemy units spawn along the top edge and take the
shortest path to your base at the bottom edge. You spend resources on walls (to shape the
path) and three faction-specific tower types (to do the damage). Later modes flip the
table: you command the attackers, then do both at once, and finally play a friend
peer-to-peer.

## Setting

The game borrows the *world* of *Avatar: The Last Airbender* — the four nations, their
bending styles, architecture and creatures — because a setting people already know is the
hook. It does not use the show's named characters or retell its story. This is an
unofficial fan project and the setting belongs to its rights holders; lore-specific names
and art are kept in content packs (see
[Architecture](docs/02-architecture.md#content-packs)), separate from the engine.

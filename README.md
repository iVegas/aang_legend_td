# Aang Legend TD

A mobile-first PWA tower defense game set in the world of the four nations.
Pick a faction, wall off the map, and hold your base against the other three.

> **Status:** planning. No game code yet — this repo currently holds the design and architecture docs.

## Docs

| Doc | What it covers |
| --- | --- |
| [Game design](docs/01-game-design.md) | Core loop, map and grid, pathfinding rules, factions, towers, units, economy |
| [Architecture](docs/02-architecture.md) | Tech stack, module layout, deterministic simulation, rendering, PWA, testing |
| [Game modes](docs/03-game-modes.md) | Defense, Attack (reversed), Two-way, and unlockable P2P multiplayer |
| [Roadmap and initial tasks](docs/04-roadmap.md) | Milestones, first task list, open questions |

## The game in one paragraph

The map is a portrait grid of squares. Enemy units spawn along the top edge and take the
shortest path to your base at the bottom edge. You spend resources on walls (to shape the
path) and three faction-specific tower types (to do the damage). Later modes flip the
table: you command the attackers, then do both at once, and finally play a friend
peer-to-peer.

## Note on the setting

The setting is based on *Avatar: The Last Airbender*, which is owned by its rights holders.
This is an unofficial, non-commercial fan project. All lore-specific names and art live in
swappable content packs (see [Architecture](docs/02-architecture.md#content-packs)) so the
game can be reskinned without touching the engine.

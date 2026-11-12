# Roadmap and initial tasks

Milestones are ordered so that each one ends with something playable on a phone.

## Milestones

| # | Milestone | Outcome |
| --- | --- | --- |
| M0 | Project skeleton | Installable empty PWA deployed from CI |
| M1 | Walking skeleton | Grid on screen, units path from top to bottom around walls |
| M2 | Defense MVP | One faction vs one enemy faction, 3 towers, waves, win/lose |
| M3 | Four factions | All walls, towers and units; faction select; Defense campaigns |
| M4 | Destructible structures | Structure HP, siege and anti-tower units, repair |
| M5 | Attack mode | Attacker HUD, defender AI, Attack campaigns |
| M6 | Two-way mode | Two boards, income economy, combined AI |
| M7 | P2P multiplayer | Lockstep over WebRTC, asymmetric duel, then two-way duel |

## Initial tasks

### M0 — Project skeleton

- [ ] Scaffold Vite + TypeScript (strict), ESLint, Prettier.
- [ ] Add Vitest; add a lint rule or test forbidding browser/Pixi imports inside `src/core`.
- [ ] Add `vite-plugin-pwa`: manifest (standalone, portrait), icons, service worker with
      update prompt.
- [ ] App shell: full-screen canvas + DOM overlay, safe-area insets, `touch-action: none`.
- [ ] GitHub Actions: lint, typecheck, test, build; deploy preview to a static host.
- [ ] Verify install-to-home-screen and offline launch on Android Chrome and iOS Safari.

### M1 — Walking skeleton

- [ ] `core/fixed.ts`, `core/rng.ts` (seeded PRNG), `core/hash.ts`.
- [ ] `GameState`, grid model, cell types; level loader for a hard-coded 9×15 level.
- [ ] BFS distance field + seal check, with property tests.
- [ ] Command type, command queue, validation for `placeStructure` / `sellStructure`.
- [ ] Fixed-timestep loop (20 Hz) with render interpolation and background-tab clamp.
- [ ] Movement system: units follow the distance field, re-route on grid change.
- [ ] `WaveScriptController` emitting `spawnUnit` commands from a script.
- [ ] PixiJS renderer: grid, placeholder sprites for wall and unit, responsive cell sizing.
- [ ] Input: tap to place wall, drag to paint walls, rejection feedback.
- [ ] Determinism test: recorded command log replays to the same hash.

### M2 — Defense MVP

- [ ] Content schema (`FactionDef`, `TowerDef`, `UnitDef`, `WaveDef`, `LevelDef`).
- [ ] Targeting system (first / last / strongest / closest) and combat system.
- [ ] Attack types: single, splash; status effects: slow.
- [ ] Projectiles, deaths, bounties, base HP, win/lose.
- [ ] Economy: supplies, costs, sell refund, wave bonus, early-call bonus.
- [ ] HUD: build bar, supplies, base HP, wave counter, speed/pause, tower radial menu.
- [ ] One faction's three towers and one enemy faction's units, placeholder art.
- [ ] Three levels + a tutorial; autosave at wave boundaries; resume on relaunch.
- [ ] Sound effects and mute; auto-pause on background.
- [ ] Playtest on real phones; tune grid size and tap targets.

### M3 and later

Broken down when M2 is playable — the M2 playtest will change the plan. Known large
items: remaining attack types (chain, cone, pulse, knockback, pull), flying units,
faction art atlases, campaign map and stars, structure HP, AI controllers, the second
board for Two-way, `net/` lockstep and signaling.

## Open questions

Decisions needed from the project owner; the docs assume the default in bold.

1. **Grid size.** **9×15 fixed, scaled to the screen** vs another fixed size vs
   device-dependent cell count (not recommended — see
   [Game design](01-game-design.md#grid)).
2. **Do towers block the path?** **Yes, towers and walls both occupy cells** vs towers
   only buildable on top of walls (makes walls more important, mazes cheaper).
3. **Wave pacing.** **Build phase between waves with an early-call button** vs
   continuous spawning.
4. **Flying units.** **Included (Air Nomads)** — they bypass the maze, which is a big
   balance lever. Drop them if the maze should always matter.
5. **Enemy mix in Defense.** **Mixed waves from all three other factions** vs one enemy
   faction per level.
6. **Attack-mode resource.** **Regenerating energy** vs fixed budget vs card deck.
7. **Two-way layout.** **Two mirrored boards** vs one tall shared board.
8. **P2P faction gating.** Any faction once unlocked vs only factions completed on both
   sides.
9. **Art direction.** Pixel art, flat vector, or hand-painted? Decides atlas sizes and
   the download budget.
10. **IP.** The setting is someone else's property. Stay strictly non-commercial fan
    project, or plan an original reskin before any public release? The content-pack
    split keeps both options open.

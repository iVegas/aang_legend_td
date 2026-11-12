# Roadmap and initial tasks

Milestones are ordered so that each one ends with something playable on a phone.

## Milestones

| # | Milestone | Outcome |
| --- | --- | --- |
| M0 | Project skeleton | Installable empty PWA deployed from CI |
| M1 | Walking skeleton | Grid on screen, units path from top to bottom around walls |
| M2 | Defense MVP | Towers, waves, economy, win/lose, save/resume |
| M3 | Four factions | Real art; remaining mechanics; full Defense campaigns |
| M4 | Destructible structures | Structure HP, siege and anti-tower units, repair |
| M5 | Attack mode | Attacker HUD, defender AI, Attack campaigns |
| M6 | Two-way mode | Two boards, income economy, combined AI |
| M7 | P2P multiplayer | Lockstep over WebRTC, asymmetric duel, then two-way duel |
| M8 | Verified results | Replay-verification service ✅ (built early); signed unlocks and P2P match results still to do |

**M0–M2 are implemented.** All four nations are already selectable with their three
towers and four units, ahead of the M3 plan, because the content is data-driven.

## Done in M0–M2

- Vite + strict TypeScript, ESLint, Vitest; CI runs lint, typecheck, tests and build.
- PWA: manifest, icons, service worker with an update prompt, offline play.
- Deterministic core: fixed-point maths, seeded RNG, state hash, command validation,
  BFS distance field with seal check, 20 Hz fixed timestep with render interpolation.
- Combat: single, splash, pulse and chain attacks; slow, stun, burn and knockback;
  armour, flying units, three targeting modes, three tower tiers.
- Economy: costs, 70 % sell refund, bounties, wave bonus, early-call bonus.
- Four levels (one 7×11 tutorial, three 9×15), stars, per-nation level unlocks.
- Touch input: tap/drag walls, drag-to-aim towers, rejection feedback with reasons.
- Autosave at wave boundaries and on backgrounding; resume replays the command log.
- Synthesised sound effects with mute, auto-pause when hidden, screen wake lock.
- Tests: pathfinding properties, command rules, determinism, replay-from-log, and a
  reference bot that plays every level with every nation.

## Done: verification server

- Seed issue, signed result submission, server-side replay, verified progress per
  anonymous device key; client integration with offline fallback and retry queue.
- Docker Compose setup for running game, server and checks without host installs.
- Still to do: host it, gate unlocks on verified progress, P2P result signing,
  signaling relay.

## Not done yet from the M0–M2 list

- [ ] Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) so the deploy
      workflow can publish.
- [ ] Install and offline check on real Android Chrome and iOS Safari devices.
- [ ] Human playtest and balance pass. Numbers were only tuned against the reference
      bot, which beats the first two levels and struggles on the two obstacle levels.
- [ ] Commit the Playwright smoke test and run it in CI.
- [ ] Prettier.

## Next: M3

- [ ] Art direction decision, then faction sprite atlases replacing placeholder shapes.
- [ ] Cone attack (Flame Jet), pull (Cyclone), wall side-effects (ice slow, iron burn).
- [ ] 10 levels per campaign; larger boards with pan/zoom.
- [ ] Campaign map, star-gated tower tiers.
- [ ] Music; haptics pass; settings screen.

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
10. ~~IP.~~ **Decided:** use the known world (nations, bending, creatures) for reach,
    with no named characters or plot from the source. Follow-up: the working title
    contains a main character's name, which sits oddly with that rule — the in-game
    title currently reads "Legend TD".
11. **Verification backend.** Built ([Server](06-server.md)). Open: where to host it,
    and whether anonymous device identity is enough or accounts are wanted (progress
    does not currently follow a player to a new device).

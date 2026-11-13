# Game design

Everything numeric in this document is a starting point for playtesting, not a final value.

## Setting

The world of the four nations, used as a backdrop: nations, bending styles, architecture
and creatures (badgermoles, komodo rhinos, sky bison, winged lemurs…). **No named
characters from the source material and no retelling of its plot** — units are generic
soldiers, benders and beasts. Recognisable world, original cast.

## Core loop (Defense mode)

1. **Choose a faction.** It decides your wall style, your three towers, and which three
   factions will attack you.
2. **Build.** Spend resources on walls and towers on your half of the screen — which is all
   of it; the whole grid is yours to build on except the spawn and base rows.
3. **Survive the wave.** Attackers spawn at the top, walk the shortest path to your base at
   the bottom, and damage it when they arrive.
4. **Earn and upgrade.** Kills and wave completion pay out. Between waves you extend the
   maze, upgrade towers, or repair.
5. **Win** by surviving the level's final wave, **lose** when base HP reaches zero.

## Map

### Grid

- Portrait grid of square cells, **9 columns × 15 rows** as the default.
- **Row 0 (top)** is the enemy spawn row. **Row 14 (bottom)** is the player's base row.
  Neither is buildable. The 13 rows between are the build area.
- The grid's *logical* size is fixed per level; only the *cell size in pixels* adapts to
  the screen: `cell = floor(min(availableWidth / cols, availableHeight / rows))`.

Why fixed cells, scaled pixels, rather than "as many cells as fit the screen": the cell
count decides path length, tower coverage and difficulty. If it varied by device, a level
would be easier on a tall phone than a short one, balance would be impossible, and two
players could never share a board in multiplayer. 9×15 is close to a 9:16 phone screen
with room left for a HUD strip, and at 360 px wide gives 40 px cells — just large enough
to tap reliably.

Levels may define other sizes (e.g. 7×11 for tutorials, 11×19 with pan/zoom for late
campaign), as long as every player of that level gets the same grid.

### Cell types

| Type | Walkable | Buildable | Notes |
| --- | --- | --- | --- |
| Ground | yes | yes | Default |
| Spawn | yes | no | Top row; each column can be a spawn point |
| Base | yes | no | Bottom row; reaching any base cell damages the base |
| Obstacle | no | no | Level-authored terrain (rock, water, lava) |
| Wall | no | — | Player-built, cheap, shapes the path |
| Tower | no | — | Player-built, attacks units in range |

### Pathfinding rules

- Units move between orthogonally adjacent cells (no diagonals, so no squeezing between
  two diagonal walls).
- Units always follow the **shortest path** from their current cell to the nearest base
  cell.
- A build action that would leave **no path** from any spawn cell (or from any living
  unit) to the base is **rejected** — the player can lengthen the route, never seal it.
- When the grid changes, all ground units re-route immediately.
- Flying units (see Air Nomads) ignore walls and towers and fly straight down their column.

Implementation is one breadth-first search outward from the base cells per grid change,
producing a distance field every unit reads from. See
[Architecture](02-architecture.md#pathfinding).

## Economy

- One currency for v1 (working name: **supplies**).
- Sources: starting amount per level, per-kill bounty, end-of-wave bonus.
- Sinks: walls (cheap), towers (expensive), tower upgrades (3 tiers), selling refunds a
  fraction.
- Early-call bonus: starting the next wave before the timer expires pays extra.

## Factions

Four factions. The player picks one; the other three supply the attackers. Each faction
has a wall style, three defense towers and four attack units. The attack units are what
the *enemy* fields against you in Defense mode and what *you* field in Attack mode.

Each faction has a mechanical identity so that the choice changes how the game plays, not
just how it looks.

### Water Tribes — control and sustain

- **Walls:** ice blocks. Medium durability; units walking adjacent to them are slightly
  slowed.
- **Towers**
  1. *Water Whip* — fast single-target attacks, short range. The bread-and-butter tower.
  2. *Frost Spire* — low damage, strong slow; upgraded tiers briefly freeze.
  3. *Tidal Basin* — periodic wave that damages and pushes units back a cell.
- **Attack units**
  1. *Tribal Warrior* — balanced foot soldier.
  2. *Waterbender* — ranged; heals nearby allies over time.
  3. *Wolf Rider* — fast, lightly armoured.
  4. *Ice Ram* — slow siege unit that damages structures it passes.

### Earth Kingdom — durability and burst

- **Walls:** stone slabs. Highest durability, most expensive.
- **Towers**
  1. *Rock Slinger* — long range, slow, heavy single-target hits.
  2. *Tremor Pillar* — area stun around the tower on a long cooldown.
  3. *Spike Trench* — very short range, very high damage; rewards tight mazes.
- **Attack units**
  1. *Kingdom Soldier* — slow, heavily armoured.
  2. *Earthbender* — ranged; hurls boulders at towers.
  3. *Ostrich-Horse Cavalry* — fast flanker.
  4. *Badgermole* — siege unit; can break through one wall instead of walking around it.

### Fire Nation — area damage and aggression

- **Walls:** riveted iron plates. Medium durability; burn units that attack them.
- **Towers**
  1. *Flame Jet* — short-range cone, damage over time.
  2. *Fireball Catapult* — long-range splash; minimum range blind spot.
  3. *Lightning Spire* — chains between nearby units; expensive.
- **Attack units**
  1. *Fire Soldier* — cheap, numerous.
  2. *Firebender* — ranged; sets towers alight, reducing their fire rate.
  3. *Komodo Rhino* — fast and tanky, expensive.
  4. *Siege Tank* — slow, armoured, shoots structures.

### Air Nomads — displacement and evasion

- **Walls:** wind-carved stone screens. Cheapest and weakest; quick to rebuild.
- **Towers**
  1. *Gust Tower* — knocks units backwards along their path; little damage.
  2. *Cyclone* — pulls units toward its centre and holds them, setting up other towers.
  3. *Chime Spire* — the only Air tower with real damage; bonus against flying.
- **Attack units**
  1. *Acolyte Runner* — very fast, very fragile.
  2. *Glider Monk* — **flying**, ignores the maze.
  3. *Lemur Swarm* — many tiny units; overwhelms single-target towers.
  4. *Sky Bison* — **flying** tank, slow.

### Counter-play sketch

| Attacker trait | Countered by |
| --- | --- |
| Swarms | Splash and chain (Catapult, Lightning Spire, Tidal Basin) |
| Heavy armour | Burst single-target (Rock Slinger, Spike Trench) |
| Fast runners | Slows and holds (Frost Spire, Cyclone, Tremor Pillar) |
| Flying | Range and anti-air (Chime Spire, Rock Slinger, Water Whip) |
| Siege | Kill priority targeting, wall repair, layered walls |

Every faction's three towers should cover at least three of these five rows, so no
matchup is unwinnable.

## Structures and damage

Implemented in two phases; both are in the game.

- **Phase 1:** maze-and-shoot. Units differ in health, speed, armour, flight and numbers.
- **Phase 2:** structures have health and attackers fight back.

### Structure health

- Walls have a fixed health by nation (Stone Slab highest, Wind Screen lowest and
  cheapest). Towers have a base health that grows 40 % per tier.
- A structure at zero health is removed and every unit re-routes at once.
- **Repair** restores full health for 60 % of the invested supplies, pro-rated by the
  missing share. **Sell** value is scaled by remaining health, so selling a dying tower
  is not a free refund.
- Upgrading adds the new tier's extra health but does not heal existing damage.

### Wall effects

| Nation | Wall | Effect |
| --- | --- | --- |
| Water | Ice Block | Ground units next to it are slowed 20 % |
| Earth | Stone Slab | Twice the health of the others |
| Fire | Iron Plate | Burns any unit that damages it |
| Air | Wind Screen | Cheapest; quick to replace |

### Unit abilities

| Unit | Ability |
| --- | --- |
| Waterbender | Heals nearby allies |
| Ice Ram | Tramples: damages every structure it walks beside |
| Earthbender | Hurls boulders at towers in range |
| Badgermole | Breaches: goes through walls and towers on its straightest route |
| Firebender | Shoots towers and jams them — 50 % slower fire rate for 3 s |
| Siege Tank | Shells any structure in range |

Air Nomad units have no structure attacks; their threat is speed, numbers and flight.
Units use abilities while walking — only the Badgermole stops, and only while something
blocks it.

A breaching unit follows its own cost field in which a structure counts as six extra
cells: it takes a short detour if one exists and smashes through otherwise. That makes
"one long wall with a far gap" unsafe against it, which is the intended counter to pure
maze-building.

Still approximated: the Flame Jet's cone is a short-range splash and the Cyclone slows
rather than pulls.

## Controls (touch-first)

The board takes the whole screen above a single bottom bar, so everything is in thumb
reach and nothing is permanently covered.

- **Tap a free cell** to open a contextual menu at that cell with the wall and the three
  towers. Tap an option to build. An option that cannot be built here (not enough
  supplies, would seal the path, enemy in the way) is dimmed and says why when tapped.
- **Press and hold an option** to read its description and stats and preview its range
  on the board; releasing does not build.
- **Tap a wall** for the same menu with towers only — choosing one converts the wall in
  place for the tower's price, and what the wall cost stays invested — plus Repair and
  Sell for the wall itself.
- **Tap a tower** for Target (first / strongest / closest), Upgrade, Repair and Sell.
  Buttons keep the same size and position whatever is selected.
- **Double-tap** a damaged structure to repair it at once.
- Tap the same free cell again, or anywhere outside the build area, to dismiss the menu.
- **Bottom bar:** base health and supplies on the left; the wave indicator in the
  centre, which is also the start button (with countdown and early-start bonus); speed
  and pause on the right. Speed cycles 1× → 2× → a five-second 3× burst that drops back
  to 2×.
- **Pause** opens a menu: Resume, Settings, Restart level, Exit to home.

## Screens

- **Splash** for three seconds at launch.
- **Home:** the selected nation (tap to change), Continue when a match is saved, Play /
  Select level, Multiplayer once it is unlocked, Settings.
- **Settings:** sound, and vibration on devices that support it. Reachable from Home and
  from the pause menu.

## Progression

- A campaign per faction: ~10 levels each, facing mixed waves from the other three.
- Stars per level (base HP remaining) unlock tower upgrade tiers.
- Finishing a faction's Defense campaign unlocks that faction's Attack campaign.
  See [Game modes](03-game-modes.md) for the full unlock chain.

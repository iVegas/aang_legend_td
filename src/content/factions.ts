import type { FactionDef, FactionId, TowerDef, UnitDef } from './types';

/** Cells → fixed-point distance. */
const c = (cells: number) => Math.round(cells * 1024);
/** Cells per second → fixed-point distance per tick. */
const cps = (cellsPerSecond: number) => Math.round((cellsPerSecond * 1024) / 20);
/** Seconds → ticks. */
const s = (seconds: number) => Math.round(seconds * 20);

export const factions: Record<FactionId, FactionDef> = {
  water: {
    id: 'water',
    name: 'Water Tribes',
    tagline: 'Control and sustain',
    color: 0x4aa3df,
    wall: { name: 'Ice Block', cost: 5, color: 0xa9dcf5, hp: 120, slowAuraPct: 20 },
    towers: ['water_whip', 'frost_spire', 'tidal_basin'],
    units: { grunt: 'tribal_warrior', fast: 'wolf_rider', elite: 'waterbender', tank: 'ice_ram' },
  },
  earth: {
    id: 'earth',
    name: 'Earth Kingdom',
    tagline: 'Durability and burst',
    color: 0x6fa24a,
    wall: { name: 'Stone Slab', cost: 6, color: 0x9a8f78, hp: 240 },
    towers: ['rock_slinger', 'tremor_pillar', 'spike_trench'],
    units: { grunt: 'kingdom_soldier', fast: 'ostrich_cavalry', elite: 'earthbender', tank: 'badgermole' },
  },
  fire: {
    id: 'fire',
    name: 'Fire Nation',
    tagline: 'Area damage and aggression',
    color: 0xd9523a,
    wall: { name: 'Iron Plate', cost: 5, color: 0x6b5a5a, hp: 140, thorns: { dmg: 4, ticks: s(2) } },
    towers: ['flame_jet', 'fireball_catapult', 'lightning_spire'],
    units: { grunt: 'fire_soldier', fast: 'komodo_rhino', elite: 'firebender', tank: 'siege_tank' },
  },
  air: {
    id: 'air',
    name: 'Air Nomads',
    tagline: 'Displacement and evasion',
    color: 0xe8b84a,
    wall: { name: 'Wind Screen', cost: 3, color: 0xe9dfc0, hp: 70 },
    towers: ['gust_tower', 'cyclone', 'chime_spire'],
    units: { grunt: 'lemur_swarm', fast: 'acolyte_runner', elite: 'glider_monk', tank: 'sky_bison' },
  },
};

const towerList: TowerDef[] = [
  // ── Water ──────────────────────────────────────────────────────────────
  {
    id: 'water_whip', faction: 'water', name: 'Water Whip', blurb: 'Fast single-target strikes',
    attack: 'single', projectileSpeed: c(0.6), hitsFlying: true, hp: 160, color: 0x4aa3df,
    tiers: [
      { cost: 30, range: c(2.2), cooldown: s(0.5), damage: 9 },
      { cost: 35, range: c(2.4), cooldown: s(0.45), damage: 16 },
      { cost: 60, range: c(2.6), cooldown: s(0.35), damage: 26 },
    ],
  },
  {
    id: 'frost_spire', faction: 'water', name: 'Frost Spire', blurb: 'Slows; top tier freezes',
    attack: 'single', projectileSpeed: c(0.5), hitsFlying: true, hp: 180, color: 0xbfe9ff,
    tiers: [
      { cost: 40, range: c(2.5), cooldown: s(1.0), damage: 5, effects: [{ type: 'slow', pct: 40, ticks: s(2) }] },
      { cost: 45, range: c(2.8), cooldown: s(0.9), damage: 9, effects: [{ type: 'slow', pct: 50, ticks: s(2.5) }] },
      { cost: 70, range: c(3.0), cooldown: s(0.8), damage: 14, effects: [{ type: 'slow', pct: 55, ticks: s(3) }, { type: 'stun', ticks: s(0.6) }] },
    ],
  },
  {
    id: 'tidal_basin', faction: 'water', name: 'Tidal Basin', blurb: 'Wave pulse that pushes back',
    attack: 'pulse', projectileSpeed: 0, hitsFlying: false, hp: 220, color: 0x2f6fb5,
    tiers: [
      { cost: 60, range: c(1.6), cooldown: s(3.5), damage: 18, effects: [{ type: 'knockback', ticks: s(0.7) }] },
      { cost: 60, range: c(1.8), cooldown: s(3.2), damage: 32, effects: [{ type: 'knockback', ticks: s(0.8) }] },
      { cost: 90, range: c(2.0), cooldown: s(2.8), damage: 52, effects: [{ type: 'knockback', ticks: s(1.0) }] },
    ],
  },
  // ── Earth ──────────────────────────────────────────────────────────────
  {
    id: 'rock_slinger', faction: 'earth', name: 'Rock Slinger', blurb: 'Long range, heavy hits',
    attack: 'single', projectileSpeed: c(0.45), hitsFlying: true, hp: 190, color: 0x8c7a56,
    tiers: [
      { cost: 40, range: c(3.6), cooldown: s(1.6), damage: 34 },
      { cost: 45, range: c(4.0), cooldown: s(1.5), damage: 60 },
      { cost: 75, range: c(4.4), cooldown: s(1.3), damage: 100 },
    ],
  },
  {
    id: 'tremor_pillar', faction: 'earth', name: 'Tremor Pillar', blurb: 'Stuns everything nearby',
    attack: 'pulse', projectileSpeed: 0, hitsFlying: false, hp: 220, color: 0x6fa24a,
    tiers: [
      { cost: 55, range: c(1.6), cooldown: s(4.5), damage: 8, effects: [{ type: 'stun', ticks: s(1.0) }] },
      { cost: 55, range: c(1.8), cooldown: s(4.2), damage: 16, effects: [{ type: 'stun', ticks: s(1.3) }] },
      { cost: 85, range: c(2.1), cooldown: s(3.8), damage: 28, effects: [{ type: 'stun', ticks: s(1.6) }] },
    ],
  },
  {
    id: 'spike_trench', faction: 'earth', name: 'Spike Trench', blurb: 'Tiny range, brutal damage',
    attack: 'pulse', projectileSpeed: 0, hitsFlying: false, hp: 260, color: 0x4d5d3a,
    tiers: [
      { cost: 35, range: c(1.15), cooldown: s(0.8), damage: 16 },
      { cost: 40, range: c(1.2), cooldown: s(0.7), damage: 28 },
      { cost: 65, range: c(1.3), cooldown: s(0.6), damage: 44 },
    ],
  },
  // ── Fire ───────────────────────────────────────────────────────────────
  {
    id: 'flame_jet', faction: 'fire', name: 'Flame Jet', blurb: 'Short range, sets groups alight',
    attack: 'splash', projectileSpeed: c(0.7), hitsFlying: true, hp: 180, color: 0xf08a3c,
    tiers: [
      { cost: 35, range: c(1.7), cooldown: s(0.6), damage: 4, radius: c(0.7), effects: [{ type: 'burn', dmg: 2, ticks: s(2) }] },
      { cost: 40, range: c(1.8), cooldown: s(0.55), damage: 7, radius: c(0.8), effects: [{ type: 'burn', dmg: 4, ticks: s(2) }] },
      { cost: 65, range: c(2.0), cooldown: s(0.5), damage: 11, radius: c(0.9), effects: [{ type: 'burn', dmg: 6, ticks: s(2.5) }] },
    ],
  },
  {
    id: 'fireball_catapult', faction: 'fire', name: 'Fireball Catapult', blurb: 'Long-range splash; blind up close',
    attack: 'splash', projectileSpeed: c(0.35), minRange: c(1.5), hitsFlying: false, hp: 200, color: 0xd9523a,
    tiers: [
      { cost: 55, range: c(4.2), cooldown: s(2.4), damage: 26, radius: c(1.0) },
      { cost: 55, range: c(4.6), cooldown: s(2.2), damage: 46, radius: c(1.1) },
      { cost: 90, range: c(5.0), cooldown: s(2.0), damage: 76, radius: c(1.3) },
    ],
  },
  {
    id: 'lightning_spire', faction: 'fire', name: 'Lightning Spire', blurb: 'Arcs between enemies',
    attack: 'chain', projectileSpeed: 0, hitsFlying: true, hp: 230, color: 0xb9c4ff,
    tiers: [
      { cost: 70, range: c(2.8), cooldown: s(1.4), damage: 22, radius: c(1.6), jumps: 2 },
      { cost: 70, range: c(3.0), cooldown: s(1.3), damage: 36, radius: c(1.8), jumps: 3 },
      { cost: 110, range: c(3.2), cooldown: s(1.1), damage: 54, radius: c(2.0), jumps: 4 },
    ],
  },
  // ── Air ────────────────────────────────────────────────────────────────
  {
    id: 'gust_tower', faction: 'air', name: 'Gust Tower', blurb: 'Blows enemies back down the path',
    attack: 'pulse', projectileSpeed: 0, hitsFlying: true, hp: 190, color: 0xf4e6b0,
    tiers: [
      { cost: 45, range: c(1.7), cooldown: s(3.0), damage: 6, effects: [{ type: 'knockback', ticks: s(0.9) }] },
      { cost: 45, range: c(1.9), cooldown: s(2.7), damage: 12, effects: [{ type: 'knockback', ticks: s(1.1) }] },
      { cost: 70, range: c(2.2), cooldown: s(2.4), damage: 20, effects: [{ type: 'knockback', ticks: s(1.3) }] },
    ],
  },
  {
    id: 'cyclone', faction: 'air', name: 'Cyclone', blurb: 'Holds enemies in a heavy slow',
    attack: 'pulse', projectileSpeed: 0, hitsFlying: true, hp: 200, color: 0xcfd8dc,
    tiers: [
      { cost: 50, range: c(1.8), cooldown: s(1.0), damage: 3, effects: [{ type: 'slow', pct: 55, ticks: s(1.2) }] },
      { cost: 50, range: c(2.0), cooldown: s(1.0), damage: 6, effects: [{ type: 'slow', pct: 65, ticks: s(1.2) }] },
      { cost: 80, range: c(2.3), cooldown: s(1.0), damage: 10, effects: [{ type: 'slow', pct: 75, ticks: s(1.2) }] },
    ],
  },
  {
    id: 'chime_spire', faction: 'air', name: 'Chime Spire', blurb: 'Steady damage; shreds flyers',
    attack: 'single', projectileSpeed: c(0.7), hitsFlying: true, hp: 170, vsFlyingPct: 200, color: 0xe8b84a,
    tiers: [
      { cost: 35, range: c(2.8), cooldown: s(0.7), damage: 13 },
      { cost: 40, range: c(3.0), cooldown: s(0.65), damage: 23 },
      { cost: 65, range: c(3.3), cooldown: s(0.55), damage: 37 },
    ],
  },
];

const unitList: UnitDef[] = [
  // Water
  { id: 'tribal_warrior', faction: 'water', role: 'grunt', name: 'Tribal Warrior', hp: 55, speed: cps(1.0), armor: 0, bounty: 5, damage: 1, flying: false, swarm: 1 },
  { id: 'wolf_rider', faction: 'water', role: 'fast', name: 'Wolf Rider', hp: 40, speed: cps(1.9), armor: 0, bounty: 6, damage: 1, flying: false, swarm: 1 },
  { id: 'waterbender', faction: 'water', role: 'elite', name: 'Waterbender', hp: 120, speed: cps(0.9), armor: 1, bounty: 10, damage: 2, flying: false, swarm: 1, ability: { type: 'heal', range: c(1.6), cooldown: s(1), amount: 8 } },
  { id: 'ice_ram', faction: 'water', role: 'tank', name: 'Ice Ram', hp: 420, speed: cps(0.55), armor: 3, bounty: 22, damage: 4, flying: false, swarm: 1, ability: { type: 'trample', cooldown: s(1), damage: 12 } },
  // Earth
  { id: 'kingdom_soldier', faction: 'earth', role: 'grunt', name: 'Kingdom Soldier', hp: 70, speed: cps(0.8), armor: 2, bounty: 6, damage: 1, flying: false, swarm: 1 },
  { id: 'ostrich_cavalry', faction: 'earth', role: 'fast', name: 'Ostrich-Horse Cavalry', hp: 50, speed: cps(1.8), armor: 1, bounty: 7, damage: 1, flying: false, swarm: 1 },
  { id: 'earthbender', faction: 'earth', role: 'elite', name: 'Earthbender', hp: 150, speed: cps(0.8), armor: 3, bounty: 11, damage: 2, flying: false, swarm: 1, ability: { type: 'ranged', range: c(2.5), cooldown: s(1.6), damage: 10, targets: 'towers' } },
  { id: 'badgermole', faction: 'earth', role: 'tank', name: 'Badgermole', hp: 520, speed: cps(0.5), armor: 5, bounty: 25, damage: 5, flying: false, swarm: 1, ability: { type: 'breach', cooldown: s(1), damage: 35 } },
  // Fire
  { id: 'fire_soldier', faction: 'fire', role: 'grunt', name: 'Fire Soldier', hp: 45, speed: cps(1.1), armor: 0, bounty: 4, damage: 1, flying: false, swarm: 1 },
  { id: 'komodo_rhino', faction: 'fire', role: 'fast', name: 'Komodo Rhino', hp: 110, speed: cps(1.6), armor: 2, bounty: 10, damage: 2, flying: false, swarm: 1 },
  { id: 'firebender', faction: 'fire', role: 'elite', name: 'Firebender', hp: 110, speed: cps(1.0), armor: 1, bounty: 10, damage: 2, flying: false, swarm: 1, ability: { type: 'ranged', range: c(2.5), cooldown: s(1.6), damage: 6, targets: 'towers', jamPct: 50, jamTicks: s(3) } },
  { id: 'siege_tank', faction: 'fire', role: 'tank', name: 'Siege Tank', hp: 460, speed: cps(0.5), armor: 6, bounty: 25, damage: 5, flying: false, swarm: 1, ability: { type: 'ranged', range: c(3), cooldown: s(2), damage: 20, targets: 'structures' } },
  // Air
  { id: 'lemur_swarm', faction: 'air', role: 'grunt', name: 'Winged Lemur', hp: 16, speed: cps(1.4), armor: 0, bounty: 2, damage: 1, flying: false, swarm: 3 },
  { id: 'acolyte_runner', faction: 'air', role: 'fast', name: 'Acolyte Runner', hp: 28, speed: cps(2.3), armor: 0, bounty: 5, damage: 1, flying: false, swarm: 1 },
  { id: 'glider_monk', faction: 'air', role: 'elite', name: 'Glider Monk', hp: 60, speed: cps(1.2), armor: 0, bounty: 10, damage: 2, flying: true, swarm: 1 },
  { id: 'sky_bison', faction: 'air', role: 'tank', name: 'Sky Bison', hp: 300, speed: cps(0.6), armor: 2, bounty: 24, damage: 4, flying: true, swarm: 1 },
];

export const towers: Record<string, TowerDef> = Object.fromEntries(towerList.map((t) => [t.id, t]));
export const units: Record<string, UnitDef> = Object.fromEntries(unitList.map((u) => [u.id, u]));

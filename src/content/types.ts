// Data definitions for everything lore- and balance-related.
// The engine knows mechanics; names, colours and numbers live here.

export type FactionId = 'water' | 'earth' | 'fire' | 'air';
export type UnitRole = 'grunt' | 'fast' | 'elite' | 'tank';
export type AttackType = 'single' | 'splash' | 'pulse' | 'chain';
export type TargetingMode = 'first' | 'strongest' | 'closest';

/** Distances are fixed-point: 1024 = one cell. Durations are simulation ticks (20 per second). */
export type StatusEffectDef =
  | { type: 'slow'; pct: number; ticks: number }
  | { type: 'stun'; ticks: number }
  | { type: 'burn'; dmg: number; ticks: number }
  | { type: 'knockback'; ticks: number };

/** What a unit does besides walking. Distances fixed-point, durations in ticks. */
export type UnitAbilityDef =
  /** Shoots structures while walking; optionally slows the fire rate of what it hits. */
  | { type: 'ranged'; range: number; cooldown: number; damage: number; targets: 'towers' | 'structures'; jamPct?: number; jamTicks?: number }
  /** Damages every structure orthogonally adjacent to it as it passes. */
  | { type: 'trample'; cooldown: number; damage: number }
  /** Walks through walls and towers by destroying whatever blocks its straightest route. */
  | { type: 'breach'; cooldown: number; damage: number }
  /** Restores health to nearby allies. */
  | { type: 'heal'; range: number; cooldown: number; amount: number };

export interface TowerTierDef {
  /** Build cost for tier 0, upgrade cost for later tiers. */
  cost: number;
  range: number;
  cooldown: number;
  damage: number;
  /** Splash radius (splash) or jump range (chain). */
  radius?: number;
  /** Extra targets hit after the first (chain). */
  jumps?: number;
  effects?: StatusEffectDef[];
}

export interface TowerDef {
  id: string;
  faction: FactionId;
  name: string;
  blurb: string;
  attack: AttackType;
  /** Fixed-point distance per tick; unused by pulse and chain. */
  projectileSpeed: number;
  minRange?: number;
  hitsFlying: boolean;
  /** Health at tier 0; each tier adds 40 %. */
  hp: number;
  /** Damage multiplier against flying units, in percent. */
  vsFlyingPct?: number;
  color: number;
  tiers: [TowerTierDef, TowerTierDef, TowerTierDef];
}

export interface WallDef {
  name: string;
  cost: number;
  color: number;
  hp: number;
  /** Slows ground units standing next to the wall, in percent. */
  slowAuraPct?: number;
  /** Burn applied to any unit that damages the wall. */
  thorns?: { dmg: number; ticks: number };
}

export interface UnitDef {
  id: string;
  faction: FactionId;
  role: UnitRole;
  name: string;
  hp: number;
  /** Fixed-point distance per tick. */
  speed: number;
  armor: number;
  bounty: number;
  /** Damage dealt to the base on arrival. */
  damage: number;
  flying: boolean;
  /** How many bodies one wave entry spawns. */
  swarm: number;
  ability?: UnitAbilityDef;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  tagline: string;
  color: number;
  wall: WallDef;
  towers: [string, string, string];
  units: Record<UnitRole, string>;
}

export interface WaveGroupDef {
  /** Index into the three enemy factions of the match (0..2). */
  enemy: number;
  role: UnitRole;
  count: number;
  /** Ticks between spawns within the group. */
  interval: number;
  /** Ticks after wave start before the group begins. */
  delay: number;
  /** Health multiplier in percent. */
  hpPct?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** One string per row: '.' ground, '#' obstacle. Row 0 is spawn, last row is base. */
  layout: string[];
  startSupplies: number;
  baseHp: number;
  /** Ticks of build time between waves. */
  buildTicks: number;
  waveBonus: number;
  /** Level-wide enemy health multiplier in percent. */
  enemyHpPct: number;
  hint?: string;
  waves: WaveGroupDef[][];
}

export interface ContentPack {
  version: string;
  factions: Record<FactionId, FactionDef>;
  towers: Record<string, TowerDef>;
  units: Record<string, UnitDef>;
  levels: LevelDef[];
}

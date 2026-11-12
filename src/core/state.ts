import type { ContentPack, FactionId, LevelDef, TargetingMode } from '../content/types';
import { computeBreachField, computeDistanceField } from './pathfinding';

export const Cell = { Ground: 0, Spawn: 1, Base: 2, Obstacle: 3 } as const;

export const WALL = 'wall';

export interface Structure {
  id: number;
  /** WALL or a tower id. */
  kind: string;
  cell: number;
  tier: number;
  cooldown: number;
  targeting: TargetingMode;
  /** Total supplies invested; sell value and repair cost derive from it. */
  spent: number;
  hp: number;
  maxHp: number;
  /** While > 0 the tower fires `jamPct` percent slower. */
  jamTicks: number;
  jamPct: number;
}

export interface Unit {
  id: number;
  kind: string;
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. */
  px: number;
  py: number;
  /** Cell the unit is leaving (or standing on) and the cell it is heading to. */
  cell: number;
  next: number;
  hp: number;
  maxHp: number;
  flying: boolean;
  slowPct: number;
  slowTicks: number;
  stunTicks: number;
  stunImmune: number;
  burnDmg: number;
  burnTicks: number;
  pushTicks: number;
  pushImmune: number;
  /** Ticks until the unit's ability is ready again. */
  abilityCd: number;
  /** Reached the base; removed without bounty. */
  leaked: boolean;
}

export interface Projectile {
  id: number;
  tower: string;
  tier: number;
  x: number;
  y: number;
  px: number;
  py: number;
  target: number;
  tx: number;
  ty: number;
}

export interface QueuedSpawn {
  tick: number;
  kind: string;
  cell: number;
  hpPct: number;
}

export interface WaveState {
  /** Number of waves started so far. */
  index: number;
  active: boolean;
  /** Ticks until the next wave starts by itself; -1 waits for the player. */
  timer: number;
  queue: QueuedSpawn[];
}

export interface PlayerState {
  faction: FactionId;
  supplies: number;
  baseHp: number;
  baseMaxHp: number;
  kills: number;
}

export type Outcome = 'playing' | 'won' | 'lost';

export type SimEvent =
  | { type: 'placed'; cell: number }
  | { type: 'sold'; cell: number }
  | { type: 'upgraded'; cell: number }
  | { type: 'repaired'; cell: number }
  | { type: 'destroyed'; cell: number }
  | { type: 'unitShot'; x: number; y: number; cell: number; color: number }
  | { type: 'heal'; x: number; y: number; range: number }
  | { type: 'shot'; cell: number }
  | { type: 'hit'; x: number; y: number; radius: number; color: number }
  | { type: 'pulse'; cell: number; range: number; color: number }
  | { type: 'chain'; points: number[] }
  | { type: 'died'; x: number; y: number }
  | { type: 'leak'; x: number; y: number }
  | { type: 'waveStart'; index: number }
  | { type: 'waveCleared'; index: number }
  | { type: 'outcome'; outcome: Outcome };

export interface GameState {
  content: ContentPack;
  level: LevelDef;
  enemies: FactionId[];
  tick: number;
  rng: number;
  nextId: number;
  cols: number;
  rows: number;
  /** Terrain per cell (Cell.*). */
  cells: Uint8Array;
  /** Structure id per cell, 0 when empty. */
  structAt: Int32Array;
  /** 1 where the structure on a cell is a wall. */
  wallAt: Uint8Array;
  /** Distance to the base per cell for ground units. */
  dist: Uint16Array;
  /** Travel cost to the base for units that break through structures instead of walking around. */
  breachDist: Uint16Array;
  /** Bumped whenever a structure is added or removed. */
  gridVersion: number;
  spawnCells: number[];
  baseCells: number[];
  structures: Structure[];
  units: Unit[];
  projectiles: Projectile[];
  player: PlayerState;
  wave: WaveState;
  outcome: Outcome;
  /** Events produced by the latest tick; not part of the hashed state. */
  events: SimEvent[];
}

export function blockedMask(state: GameState, extraBlocked = -1): Uint8Array {
  const n = state.cells.length;
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    blocked[i] = state.cells[i] === Cell.Obstacle || state.structAt[i] !== 0 || i === extraBlocked ? 1 : 0;
  }
  return blocked;
}

export function recomputePaths(state: GameState): void {
  computeDistanceField(state.cols, state.rows, blockedMask(state), state.baseCells, state.dist);
  computeBreachField(state.cols, state.rows, state.cells, state.structAt, state.baseCells, state.breachDist);
}

/** Takes a structure off the board (sold or destroyed) and re-routes everyone. */
export function removeStructure(state: GameState, s: Structure): void {
  state.structAt[s.cell] = 0;
  state.wallAt[s.cell] = 0;
  state.structures.splice(state.structures.indexOf(s), 1);
  state.gridVersion++;
  recomputePaths(state);
}

export function createState(content: ContentPack, levelId: string, faction: FactionId, seed: number): GameState {
  const level = content.levels.find((l) => l.id === levelId);
  if (!level) throw new Error(`Unknown level ${levelId}`);
  const { cols, rows } = level;
  if (level.layout.length !== rows || level.layout.some((r) => r.length !== cols)) {
    throw new Error(`Level ${levelId} layout does not match ${cols}x${rows}`);
  }
  const cells = new Uint8Array(cols * rows);
  const spawnCells: number[] = [];
  const baseCells: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (level.layout[y][x] === '#') cells[i] = Cell.Obstacle;
      else if (y === 0) {
        cells[i] = Cell.Spawn;
        spawnCells.push(i);
      } else if (y === rows - 1) {
        cells[i] = Cell.Base;
        baseCells.push(i);
      } else cells[i] = Cell.Ground;
    }
  }
  const order: FactionId[] = ['water', 'earth', 'fire', 'air'];
  const state: GameState = {
    content,
    level,
    enemies: order.filter((f) => f !== faction),
    tick: 0,
    rng: seed >>> 0,
    nextId: 1,
    cols,
    rows,
    cells,
    structAt: new Int32Array(cols * rows),
    wallAt: new Uint8Array(cols * rows),
    dist: new Uint16Array(cols * rows),
    breachDist: new Uint16Array(cols * rows),
    gridVersion: 0,
    spawnCells,
    baseCells,
    structures: [],
    units: [],
    projectiles: [],
    player: { faction, supplies: level.startSupplies, baseHp: level.baseHp, baseMaxHp: level.baseHp, kills: 0 },
    wave: { index: 0, active: false, timer: -1, queue: [] },
    outcome: 'playing',
    events: [],
  };
  recomputePaths(state);
  return state;
}

export function structureAt(state: GameState, cell: number): Structure | undefined {
  const id = state.structAt[cell];
  if (!id) return undefined;
  return state.structures.find((s) => s.id === id);
}

/** Remove entries failing `keep` without allocating a new array. */
export function compact<T>(arr: T[], keep: (item: T) => boolean): void {
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const item = arr[r];
    if (keep(item)) arr[w++] = item;
  }
  arr.length = w;
}

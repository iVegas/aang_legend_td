import type { TargetingMode } from '../content/types';
import { computeDistanceField, INF } from './pathfinding';
import { blockedMask, Cell, recomputePaths, structureAt, WALL, type GameState } from './state';
import { startWave } from './systems/waves';

// Every outside influence on a match is one of these. A match is fully described by
// { content version, level, faction, seed, commands with their ticks }.
export type Command =
  | { type: 'placeStructure'; kind: string; cell: number }
  | { type: 'sellStructure'; cell: number }
  | { type: 'upgradeTower'; cell: number }
  | { type: 'setTargeting'; cell: number; mode: TargetingMode }
  | { type: 'startWave' };

export type PlaceError = 'over' | 'bounds' | 'unknown' | 'terrain' | 'occupied' | 'unit' | 'funds' | 'sealed';

export const SELL_REFUND_PCT = 70;
export const TARGETING_MODES: TargetingMode[] = ['first', 'strongest', 'closest'];

export function structureCost(state: GameState, kind: string): number | undefined {
  const faction = state.content.factions[state.player.faction];
  if (kind === WALL) return faction.wall.cost;
  if (!faction.towers.includes(kind)) return undefined;
  return state.content.towers[kind]?.tiers[0].cost;
}

/** Would blocking `cell` cut any spawn point or any walking unit off from the base? */
export function wouldSeal(state: GameState, cell: number): boolean {
  const dist = computeDistanceField(state.cols, state.rows, blockedMask(state, cell), state.baseCells);
  for (const s of state.spawnCells) if (dist[s] === INF) return true;
  for (const u of state.units) {
    if (u.flying) continue;
    if (dist[u.cell] === INF || dist[u.next] === INF) return true;
  }
  return false;
}

/** The single source of truth for build rules; the UI calls it for feedback, the sim to enforce. */
export function checkPlace(state: GameState, kind: string, cell: number): PlaceError | null {
  if (state.outcome !== 'playing') return 'over';
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.cells.length) return 'bounds';
  const cost = structureCost(state, kind);
  if (cost === undefined) return 'unknown';
  if (state.cells[cell] !== Cell.Ground) return 'terrain';
  if (state.structAt[cell] !== 0) return 'occupied';
  for (const u of state.units) {
    if (!u.flying && (u.cell === cell || u.next === cell)) return 'unit';
  }
  if (state.player.supplies < cost) return 'funds';
  if (wouldSeal(state, cell)) return 'sealed';
  return null;
}

export function upgradeCost(state: GameState, cell: number): number | undefined {
  const s = structureAt(state, cell);
  if (!s || s.kind === WALL) return undefined;
  return state.content.towers[s.kind].tiers[s.tier + 1]?.cost;
}

export function sellValue(state: GameState, cell: number): number {
  const s = structureAt(state, cell);
  return s ? Math.floor((s.spent * SELL_REFUND_PCT) / 100) : 0;
}

/** Applies a command if it is valid in the current state. Invalid commands are dropped. */
export function applyCommand(state: GameState, cmd: Command): boolean {
  if (state.outcome !== 'playing') return false;
  switch (cmd.type) {
    case 'placeStructure': {
      if (checkPlace(state, cmd.kind, cmd.cell) !== null) return false;
      const cost = structureCost(state, cmd.kind)!;
      const id = state.nextId++;
      state.structures.push({ id, kind: cmd.kind, cell: cmd.cell, tier: 0, cooldown: 0, targeting: 'first', spent: cost });
      state.structAt[cmd.cell] = id;
      state.player.supplies -= cost;
      state.gridVersion++;
      recomputePaths(state);
      state.events.push({ type: 'placed', cell: cmd.cell });
      return true;
    }
    case 'sellStructure': {
      const s = structureAt(state, cmd.cell);
      if (!s) return false;
      state.player.supplies += sellValue(state, cmd.cell);
      state.structAt[cmd.cell] = 0;
      state.structures.splice(state.structures.indexOf(s), 1);
      state.gridVersion++;
      recomputePaths(state);
      state.events.push({ type: 'sold', cell: cmd.cell });
      return true;
    }
    case 'upgradeTower': {
      const s = structureAt(state, cmd.cell);
      const cost = upgradeCost(state, cmd.cell);
      if (!s || cost === undefined || state.player.supplies < cost) return false;
      state.player.supplies -= cost;
      s.spent += cost;
      s.tier++;
      state.gridVersion++;
      state.events.push({ type: 'upgraded', cell: cmd.cell });
      return true;
    }
    case 'setTargeting': {
      const s = structureAt(state, cmd.cell);
      if (!s || s.kind === WALL || !TARGETING_MODES.includes(cmd.mode)) return false;
      s.targeting = cmd.mode;
      return true;
    }
    case 'startWave':
      return startWave(state);
    default:
      return false;
  }
}

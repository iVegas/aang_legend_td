import type { TargetingMode } from '../content/types';
import { computeDistanceField, INF } from './pathfinding';
import { blockedMask, Cell, recomputePaths, removeStructure, structureAt, WALL, type GameState } from './state';
import { startWave } from './systems/waves';

// Every outside influence on a match is one of these. A match is fully described by
// { content version, level, faction, seed, commands with their ticks }.
export type Command =
  | { type: 'placeStructure'; kind: string; cell: number }
  | { type: 'sellStructure'; cell: number }
  | { type: 'upgradeTower'; cell: number }
  | { type: 'repairStructure'; cell: number }
  | { type: 'setTargeting'; cell: number; mode: TargetingMode }
  | { type: 'startWave' };

export type PlaceError = 'over' | 'bounds' | 'unknown' | 'terrain' | 'occupied' | 'unit' | 'funds' | 'sealed';

export const SELL_REFUND_PCT = 70;
/** Restoring a structure from nothing costs this share of what was spent on it. */
export const REPAIR_COST_PCT = 60;
const TIER_HP_BONUS_PCT = 40;

export function structureMaxHp(state: GameState, kind: string, tier: number): number {
  if (kind === WALL) return state.content.factions[state.player.faction].wall.hp;
  return Math.floor((state.content.towers[kind].hp * (100 + TIER_HP_BONUS_PCT * tier)) / 100);
}

export function repairCost(state: GameState, cell: number): number {
  const s = structureAt(state, cell);
  if (!s || s.hp >= s.maxHp) return 0;
  return Math.max(1, Math.ceil(((s.maxHp - s.hp) * s.spent * REPAIR_COST_PCT) / (s.maxHp * 100)));
}
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
    if (dist[u.cell] === INF) return true;
    // A breaching unit may be heading into a structure; only where it stands matters.
    if (dist[u.next] === INF && state.structAt[u.next] === 0) return true;
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
  if (state.structAt[cell] !== 0) {
    // A tower may be built in place of a wall: the cell is already blocked, so no
    // path or unit checks apply.
    if (kind === WALL || !state.wallAt[cell]) return 'occupied';
    return state.player.supplies < cost ? 'funds' : null;
  }
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
  // Scaled by remaining health, so selling a dying tower is not a free refund.
  return s ? Math.floor((s.spent * SELL_REFUND_PCT * s.hp) / (100 * s.maxHp)) : 0;
}

/** Applies a command if it is valid in the current state. Invalid commands are dropped. */
export function applyCommand(state: GameState, cmd: Command): boolean {
  if (state.outcome !== 'playing') return false;
  switch (cmd.type) {
    case 'placeStructure': {
      if (checkPlace(state, cmd.kind, cmd.cell) !== null) return false;
      const cost = structureCost(state, cmd.kind)!;
      const wall = structureAt(state, cmd.cell);
      if (wall) {
        // Convert the wall in place; what was paid for it stays invested in the tower.
        wall.kind = cmd.kind;
        wall.spent += cost;
        wall.hp = wall.maxHp = structureMaxHp(state, cmd.kind, 0);
        state.wallAt[cmd.cell] = 0;
        state.player.supplies -= cost;
        state.gridVersion++;
        state.events.push({ type: 'placed', cell: cmd.cell });
        return true;
      }
      const id = state.nextId++;
      const hp = structureMaxHp(state, cmd.kind, 0);
      state.structures.push({
        id, kind: cmd.kind, cell: cmd.cell, tier: 0, cooldown: 0, targeting: 'first', spent: cost,
        hp, maxHp: hp, jamTicks: 0, jamPct: 0,
      });
      state.structAt[cmd.cell] = id;
      state.wallAt[cmd.cell] = cmd.kind === WALL ? 1 : 0;
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
      removeStructure(state, s);
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
      // The upgrade adds the new tier's extra health without healing existing damage.
      const maxHp = structureMaxHp(state, s.kind, s.tier);
      s.hp += maxHp - s.maxHp;
      s.maxHp = maxHp;
      state.gridVersion++;
      state.events.push({ type: 'upgraded', cell: cmd.cell });
      return true;
    }
    case 'repairStructure': {
      const s = structureAt(state, cmd.cell);
      const cost = repairCost(state, cmd.cell);
      if (!s || cost === 0 || state.player.supplies < cost) return false;
      state.player.supplies -= cost;
      s.hp = s.maxHp;
      state.gridVersion++;
      state.events.push({ type: 'repaired', cell: cmd.cell });
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

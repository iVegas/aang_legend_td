import { content, type FactionId } from '../src/content';
import { createState, starsFor, step, type Command, type Outcome } from '../src/core';

export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

export interface Verdict {
  outcome: Outcome;
  stars: number;
  ticks: number;
  baseHp: number;
}

/** Hard ceilings that keep one request's CPU cost bounded regardless of its content. */
export const LIMITS = {
  maxTicks: 60 * 60 * 20, // one hour of game time
  maxCommands: 6000,
  maxBodyBytes: 384 * 1024,
};

const FACTIONS: readonly string[] = ['water', 'earth', 'fire', 'air'];
const TARGETING: readonly string[] = ['first', 'strongest', 'closest'];

export const isFaction = (v: unknown): v is FactionId => typeof v === 'string' && FACTIONS.includes(v);
export const isLevel = (v: unknown): v is string => typeof v === 'string' && content.levels.some((l) => l.id === v);

const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e6;

/** Rebuilds a command from untrusted JSON, keeping only known fields of the right type. */
function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'placeStructure':
      return typeof c.kind === 'string' && c.kind.length <= 40 && isInt(c.cell) ? { type: 'placeStructure', kind: c.kind, cell: c.cell } : null;
    case 'sellStructure':
      return isInt(c.cell) ? { type: 'sellStructure', cell: c.cell } : null;
    case 'upgradeTower':
      return isInt(c.cell) ? { type: 'upgradeTower', cell: c.cell } : null;
    case 'repairStructure':
      return isInt(c.cell) ? { type: 'repairStructure', cell: c.cell } : null;
    case 'setTargeting':
      return isInt(c.cell) && typeof c.mode === 'string' && TARGETING.includes(c.mode)
        ? { type: 'setTargeting', cell: c.cell, mode: c.mode as 'first' | 'strongest' | 'closest' }
        : null;
    case 'startWave':
      return { type: 'startWave' };
    default:
      return null;
  }
}

/** Validates shape and ordering of a submitted log. Returns null when it is malformed. */
export function parseLog(raw: unknown): LoggedCommand[] | null {
  if (!Array.isArray(raw) || raw.length > LIMITS.maxCommands) return null;
  const log: LoggedCommand[] = [];
  let last = 1;
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { tick, cmd } = entry as { tick: unknown; cmd: unknown };
    if (!isInt(tick) || tick < last || tick > LIMITS.maxTicks) return null;
    const parsed = parseCommand(cmd);
    if (!parsed) return null;
    last = tick;
    log.push({ tick, cmd: parsed });
  }
  return log;
}

/**
 * Re-plays a match from its inputs and reports what actually happened.
 * The client's own claim about the result is never consulted.
 */
export function replay(levelId: string, faction: FactionId, seed: number, log: LoggedCommand[], untilTick: number): Verdict {
  const state = createState(content, levelId, faction, seed);
  const end = Math.min(untilTick, LIMITS.maxTicks);
  const batch: Command[] = [];
  let i = 0;
  while (state.tick < end && state.outcome === 'playing') {
    batch.length = 0;
    const next = state.tick + 1;
    while (i < log.length && log[i].tick === next) batch.push(log[i++].cmd);
    step(state, batch);
  }
  return {
    outcome: state.outcome,
    stars: state.outcome === 'won' ? starsFor(state.player.baseHp, state.player.baseMaxHp) : 0,
    ticks: state.tick,
    baseHp: state.player.baseHp,
  };
}

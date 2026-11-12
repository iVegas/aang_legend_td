import { content } from '../src/content';
import type { FactionId } from '../src/content';
import { checkPlace, createState, hashState, step, upgradeCost, WALL, type Command, type GameState } from '../src/core';

export interface BotRun {
  state: GameState;
  log: { tick: number; cmd: Command }[];
  hashes: number[];
}

/** A crude but deterministic player: builds a zig-zag of walls and lines it with towers. */
function botCommands(state: GameState): Command[] {
  if (state.wave.active) return [];
  const cmds: Command[] = [];
  const { cols, rows } = state;
  const towers = state.content.factions[state.player.faction].towers;
  let supplies = state.player.supplies;
  const wallCost = state.content.factions[state.player.faction].wall.cost;

  // Zig-zag: every third row is a wall line with a gap alternating left/right.
  let built = 0;
  for (let y = 2; y < rows - 2 && built < 3; y += 3) {
    const gap = (y / 3) % 2 < 1 ? 0 : cols - 1;
    for (let x = 0; x < cols && built < 3; x++) {
      if (x === gap) continue;
      const cell = y * cols + x;
      // Every other wall-line cell becomes a tower once affordable.
      const kind = x % 2 === 1 ? towers[(x + y) % 3] : WALL;
      const cost = kind === WALL ? wallCost : state.content.towers[kind].tiers[0].cost;
      if (state.structAt[cell] === 0 && supplies >= cost && checkPlace(state, kind, cell) === null) {
        cmds.push({ type: 'placeStructure', kind, cell });
        supplies -= cost;
        built++;
      }
    }
  }
  if (built === 0) {
    for (const s of state.structures) {
      const cost = upgradeCost(state, s.cell);
      if (cost !== undefined && supplies >= cost) {
        cmds.push({ type: 'upgradeTower', cell: s.cell });
        break;
      }
    }
    if (cmds.length === 0) cmds.push({ type: 'startWave' });
  }
  return cmds;
}

export function runBot(levelId: string, faction: FactionId, seed: number, maxTicks = 60000): BotRun {
  const state = createState(content, levelId, faction, seed);
  const log: BotRun['log'] = [];
  const hashes: number[] = [];
  while (state.outcome === 'playing' && state.tick < maxTicks) {
    const cmds = botCommands(state);
    for (const cmd of cmds) log.push({ tick: state.tick + 1, cmd });
    step(state, cmds);
    if (state.tick % 20 === 0) hashes.push(hashState(state));
  }
  hashes.push(hashState(state));
  return { state, log, hashes };
}

/** Re-simulates a match from its command log alone. */
export function replay(levelId: string, faction: FactionId, seed: number, log: BotRun['log'], untilTick: number): number[] {
  const state = createState(content, levelId, faction, seed);
  const hashes: number[] = [];
  let i = 0;
  while (state.tick < untilTick && state.outcome === 'playing') {
    const cmds: Command[] = [];
    while (i < log.length && log[i].tick === state.tick + 1) cmds.push(log[i++].cmd);
    step(state, cmds);
    if (state.tick % 20 === 0) hashes.push(hashState(state));
  }
  hashes.push(hashState(state));
  return hashes;
}

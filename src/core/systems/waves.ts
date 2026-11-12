import { cellCenter, TICKS_PER_SECOND } from '../fixed';
import { nextInt } from '../rng';
import type { GameState, QueuedSpawn } from '../state';

export function spawnUnit(state: GameState, kind: string, cell: number, hpPct: number): void {
  const def = state.content.units[kind];
  const x = cellCenter(cell % state.cols);
  const y = cellCenter(Math.floor(cell / state.cols));
  const hp = Math.max(1, Math.floor((def.hp * hpPct) / 100));
  state.units.push({
    id: state.nextId++, kind, x, y, px: x, py: y, cell, next: cell, hp, maxHp: hp, flying: def.flying,
    slowPct: 0, slowTicks: 0, stunTicks: 0, stunImmune: 0, burnDmg: 0, burnTicks: 0,
    pushTicks: 0, pushImmune: 0, leaked: false,
  });
}

/** Begins the next wave. Calling it during the build countdown pays one supply per second skipped. */
export function startWave(state: GameState): boolean {
  const { wave, level } = state;
  if (wave.active || wave.index >= level.waves.length || state.outcome !== 'playing') return false;
  if (wave.timer > 0) state.player.supplies += Math.floor(wave.timer / TICKS_PER_SECOND);

  const queue: QueuedSpawn[] = [];
  for (const group of level.waves[wave.index]) {
    const faction = state.content.factions[state.enemies[group.enemy]];
    const kind = faction.units[group.role];
    const swarm = state.content.units[kind].swarm;
    const bodies = group.count * swarm;
    for (let i = 0; i < bodies; i++) {
      queue.push({
        tick: state.tick + 1 + group.delay + Math.floor((i * group.interval) / swarm),
        kind,
        cell: state.spawnCells[nextInt(state, state.spawnCells.length)],
        hpPct: Math.floor(((group.hpPct ?? 100) * level.enemyHpPct) / 100),
      });
    }
  }
  // Stable sort keeps authoring order for spawns on the same tick.
  queue.sort((a, b) => a.tick - b.tick);
  wave.queue = queue;
  wave.active = true;
  wave.timer = 0;
  wave.index++;
  state.events.push({ type: 'waveStart', index: wave.index });
  return true;
}

export function waveSystem(state: GameState): void {
  const { wave } = state;
  if (wave.active) {
    let n = 0;
    while (n < wave.queue.length && wave.queue[n].tick <= state.tick) {
      const s = wave.queue[n++];
      spawnUnit(state, s.kind, s.cell, s.hpPct);
    }
    if (n) wave.queue.splice(0, n);
  } else if (wave.timer > 0) {
    wave.timer--;
    if (wave.timer === 0) startWave(state);
  }
}

/** Runs after deaths are resolved: closes the wave and decides victory. */
export function waveEndSystem(state: GameState): void {
  const { wave } = state;
  if (!wave.active || wave.queue.length > 0 || state.units.length > 0 || state.outcome !== 'playing') return;
  wave.active = false;
  state.player.supplies += state.level.waveBonus;
  state.events.push({ type: 'waveCleared', index: wave.index });
  if (wave.index >= state.level.waves.length) {
    state.outcome = 'won';
    state.events.push({ type: 'outcome', outcome: 'won' });
  } else {
    wave.timer = state.level.buildTicks;
  }
}

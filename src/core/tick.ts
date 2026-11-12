import { applyCommand, type Command } from './commands';
import type { GameState } from './state';
import { abilitySystem } from './systems/abilities';
import { projectileSystem, resolveSystem, towerSystem } from './systems/combat';
import { movementSystem } from './systems/movement';
import { waveEndSystem, waveSystem } from './systems/waves';

/** Advances the match by exactly one tick. The only way state ever changes. */
export function step(state: GameState, commands: readonly Command[]): void {
  state.events.length = 0;
  if (state.outcome !== 'playing') return;
  state.tick++;
  for (const cmd of commands) applyCommand(state, cmd);
  waveSystem(state);
  movementSystem(state);
  abilitySystem(state);
  towerSystem(state);
  projectileSystem(state);
  resolveSystem(state);
  waveEndSystem(state);
}

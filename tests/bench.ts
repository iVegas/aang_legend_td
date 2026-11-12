// Not a test: `npx -y vite-node tests/bench.ts` measures what one verification costs the server.
import { replay } from '../server/verify';
import { runBot } from './bot';

for (const [level, faction] of [['first_steps', 'fire'], ['open_field', 'water'], ['twin_gates', 'air']] as const) {
  const run = runBot(level, faction, 3);
  const t0 = performance.now();
  replay(level, faction, 3, run.log, run.state.tick);
  const cold = performance.now() - t0;
  const rounds = 30;
  const t1 = performance.now();
  for (let i = 0; i < rounds; i++) replay(level, faction, 3, run.log, run.state.tick);
  const warm = (performance.now() - t1) / rounds;
  console.log(`${level.padEnd(12)} ${String(run.state.tick).padStart(6)} ticks (${(run.state.tick / 1200).toFixed(1)} game-min)  first ${cold.toFixed(1)} ms  warm ${warm.toFixed(2)} ms`);
}

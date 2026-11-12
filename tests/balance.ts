// Not a test: `npx -y vite-node tests/balance.ts` prints how the reference bot fares.
import { content, FACTION_ORDER } from '../src/content';
import { runBot } from './bot';

for (const level of content.levels) {
  const row = FACTION_ORDER.map((f) => {
    const { state } = runBot(level.id, f, 1);
    return `${f}:${state.outcome === 'won' ? 'W' : 'L'} hp${state.player.baseHp} w${state.wave.index}/${level.waves.length}`;
  });
  console.log(level.id.padEnd(12), row.join('  '));
}

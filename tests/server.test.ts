import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, defaultConfig, type Req, type Res } from '../server/app';
import { playerIdOf } from '../server/identity';
import { SqliteStore } from '../server/store';
import { replay } from '../server/verify';
import { runBot } from './bot';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

async function makePlayer() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const sign = async (message: string) =>
    Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, Buffer.from(message))).toString('base64url');
  return { publicKey, sign, id: playerIdOf(publicKey) };
}

let app: (req: Req) => Promise<Res>;
let player: Awaited<ReturnType<typeof makePlayer>>;
const call = (method: string, path: string, body?: unknown, now = T0, ip = '1.1.1.1') => app({ method, path, body, now, ip });

async function startAttempt(levelId = 'first_steps', faction = 'fire') {
  const res = await call('POST', '/v1/attempts', { publicKey: player.publicKey, levelId, faction });
  expect(res.status).toBe(200);
  return res.body as { attemptId: string; seed: number; playerId: string };
}

async function submit(attemptId: string, tick: number, log: unknown, now = T0 + HOUR, signer = player) {
  const payload = JSON.stringify({ attemptId, tick, log });
  return call('POST', '/v1/results', { payload, signature: await signer.sign(payload) }, now);
}

beforeEach(async () => {
  app = createApp(new SqliteStore(':memory:'), defaultConfig);
  player = await makePlayer();
});

describe('verification server', () => {
  it('reports health', async () => {
    expect((await call('GET', '/v1/health')).body).toMatchObject({ ok: true });
    expect((await call('GET', '/nope')).status).toBe(404);
    expect((await call('DELETE', '/v1/health')).status).toBe(405);
  });

  it('verifies a won match and records progress', async () => {
    const attempt = await startAttempt();
    expect(attempt.playerId).toBe(player.id);
    const run = runBot('first_steps', 'fire', attempt.seed);
    expect(run.state.outcome).toBe('won');

    const res = await submit(attempt.attemptId, run.state.tick, run.log);
    expect(res.status).toBe(200);
    const verdict = res.body as { outcome: string; stars: number };
    expect(verdict.outcome).toBe('won');
    expect(verdict.stars).toBeGreaterThan(0);

    const progress = await call('GET', `/v1/players/${player.id}/progress`);
    expect(progress.body).toEqual({ playerId: player.id, progress: [{ faction: 'fire', levelId: 'first_steps', stars: verdict.stars }] });

    expect((await submit(attempt.attemptId, run.state.tick, run.log)).body).toEqual({ error: 'already_submitted' });
  });

  it('derives the result itself: a doctored log earns nothing', async () => {
    const attempt = await startAttempt();
    const run = runBot('first_steps', 'fire', attempt.seed);
    // Keep only the wave starts: no defences were ever built.
    const doctored = run.log.filter((e) => e.cmd.type === 'startWave');
    const res = await submit(attempt.attemptId, 30000, doctored);
    expect(res.body).toMatchObject({ outcome: 'lost', stars: 0 });
    expect((await call('GET', `/v1/players/${player.id}/progress`)).body).toMatchObject({ progress: [] });
  });

  it('rejects illegal moves the same way the client does', async () => {
    const attempt = await startAttempt();
    // Sixty towers on a budget for two: the rest are checked against supplies and dropped.
    const log = Array.from({ length: 60 }, (_, i) => ({ tick: 1, cmd: { type: 'placeStructure' as const, kind: 'lightning_spire', cell: 8 + i } }));
    const res = await submit(attempt.attemptId, 30000, [...log, { tick: 2, cmd: { type: 'startWave' } }]);
    const honest = replay('first_steps', 'fire', attempt.seed, [...log.slice(0, 2), { tick: 2, cmd: { type: 'startWave' } }], 30000);
    expect(res.body).toEqual({ outcome: honest.outcome, stars: honest.stars, ticks: honest.ticks });
  });

  it('refuses results that arrive faster than the match could be played', async () => {
    const attempt = await startAttempt();
    const run = runBot('first_steps', 'fire', attempt.seed);
    const res = await submit(attempt.attemptId, run.state.tick, run.log, T0 + 5000);
    expect(res.body).toEqual({ error: 'too_fast' });
  });

  it('refuses a result signed by someone else', async () => {
    const attempt = await startAttempt();
    const run = runBot('first_steps', 'fire', attempt.seed);
    const res = await submit(attempt.attemptId, run.state.tick, run.log, T0 + HOUR, await makePlayer());
    expect(res.status).toBe(401);
  });

  it('expires attempts and validates input', async () => {
    const attempt = await startAttempt();
    expect((await submit(attempt.attemptId, 100, [], T0 + 4 * HOUR)).body).toEqual({ error: 'attempt_expired' });
    expect((await submit('missing', 100, [])).status).toBe(404);
    const fresh = await startAttempt();
    expect((await submit(fresh.attemptId, 100, [{ tick: 5, cmd: { type: 'cheat' } }])).body).toEqual({ error: 'bad_log' });
    expect((await submit(fresh.attemptId, 100, [{ tick: 9 }, { tick: 3 }])).body).toEqual({ error: 'bad_log' });
    expect((await call('POST', '/v1/attempts', { publicKey: player.publicKey, levelId: 'nope', faction: 'fire' })).status).toBe(400);
    expect((await call('POST', '/v1/attempts', { publicKey: 'short', levelId: 'first_steps', faction: 'fire' })).status).toBe(400);
  });

  it('rate-limits per address', async () => {
    let last = 200;
    for (let i = 0; i <= defaultConfig.writeLimit; i++) {
      last = (await call('POST', '/v1/attempts', { publicKey: player.publicKey, levelId: 'first_steps', faction: 'fire' }, T0, '9.9.9.9')).status;
    }
    expect(last).toBe(429);
    expect((await call('POST', '/v1/attempts', { publicKey: player.publicKey, levelId: 'first_steps', faction: 'fire' }, T0 + 61_000, '9.9.9.9')).status).toBe(200);
  });

  it('replays a full match quickly', () => {
    const run = runBot('twin_gates', 'air', 3);
    replay('twin_gates', 'air', 3, run.log, run.state.tick); // warm-up
    const started = performance.now();
    const rounds = 20;
    for (let i = 0; i < rounds; i++) replay('twin_gates', 'air', 3, run.log, run.state.tick);
    const ms = (performance.now() - started) / rounds;
    console.log(`replay: ${run.state.tick} ticks in ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(250);
  });
});

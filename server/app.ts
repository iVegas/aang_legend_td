import { randomBytes, randomInt } from 'node:crypto';
import { content } from '../src/content';
import { MAX_SPEED, TICK_MS } from '../src/core';
import { isPublicKey, playerIdOf, verifySignature } from './identity';
import { RateLimiter } from './ratelimit';
import type { Store } from './store';
import { isFaction, isLevel, LIMITS, parseLog, replay } from './verify';

// Transport-independent request handling: plain objects in, plain objects out.
// main.ts adapts it to node:http; tests call it directly.

export interface Req {
  method: string;
  path: string;
  body: unknown;
  ip: string;
  now: number;
}

export interface Res {
  status: number;
  body: unknown;
}

export interface Config {
  /** How long an issued seed stays valid. */
  attemptTtlMs: number;
  /** Requests per minute per IP for each route group. */
  writeLimit: number;
  readLimit: number;
}

export const defaultConfig: Config = {
  attemptTtlMs: 3 * 60 * 60 * 1000,
  writeLimit: 30,
  readLimit: 120,
};

type Handler = (req: Req, params: string[]) => Res | Promise<Res>;
interface Route {
  method: string;
  pattern: RegExp;
  limiter: RateLimiter;
  handler: Handler;
}

const ok = (body: unknown): Res => ({ status: 200, body });
const fail = (status: number, error: string): Res => ({ status, body: { error } });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function createApp(store: Store, config: Config = defaultConfig): (req: Req) => Promise<Res> {
  const writes = new RateLimiter(config.writeLimit, 60_000);
  const reads = new RateLimiter(config.readLimit, 60_000);

  /** Hands out the seed for one match. The client cannot choose or re-roll it. */
  const createAttempt: Handler = (req) => {
    if (!isObject(req.body)) return fail(400, 'bad_request');
    const { publicKey, levelId, faction } = req.body;
    if (!isPublicKey(publicKey) || !isLevel(levelId) || !isFaction(faction)) return fail(400, 'bad_request');
    const attempt = {
      id: randomBytes(16).toString('base64url'),
      playerId: playerIdOf(publicKey),
      publicKey,
      levelId,
      faction,
      seed: randomInt(0, 2 ** 32),
      contentVersion: content.version,
      createdAt: req.now,
    };
    store.createAttempt(attempt);
    return ok({ attemptId: attempt.id, seed: attempt.seed, playerId: attempt.playerId, contentVersion: content.version });
  };

  /**
   * Accepts a match's inputs and derives the result by replaying them.
   * Checks run cheapest-first so a bad request never reaches the simulation.
   */
  const submitResult: Handler = async (req) => {
    if (!isObject(req.body)) return fail(400, 'bad_request');
    const { payload, signature } = req.body;
    if (typeof payload !== 'string' || typeof signature !== 'string' || signature.length > 200) return fail(400, 'bad_request');
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      return fail(400, 'bad_request');
    }
    if (!isObject(data) || typeof data.attemptId !== 'string') return fail(400, 'bad_request');
    const tick = data.tick;
    if (typeof tick !== 'number' || !Number.isInteger(tick) || tick < 1 || tick > LIMITS.maxTicks) return fail(400, 'bad_request');

    const attempt = store.getAttempt(data.attemptId);
    if (!attempt) return fail(404, 'unknown_attempt');
    if (attempt.finishedAt !== null) return fail(409, 'already_submitted');
    if (req.now - attempt.createdAt > config.attemptTtlMs) return fail(410, 'attempt_expired');
    if (attempt.contentVersion !== content.version) return fail(409, 'content_changed');

    // A match of N ticks cannot have been played in less real time than N ticks at top speed.
    // This also means nobody can make the server simulate without first waiting that long.
    const minElapsed = ((tick * TICK_MS) / MAX_SPEED) * 0.9;
    if (req.now - attempt.createdAt < minElapsed) return fail(422, 'too_fast');

    // The signature covers the exact payload string, so no canonical JSON form is needed.
    if (!(await verifySignature(attempt.publicKey, payload, signature))) return fail(401, 'bad_signature');

    const log = parseLog(data.log);
    if (!log) return fail(400, 'bad_log');

    const verdict = replay(attempt.levelId, attempt.faction as 'water', attempt.seed, log, tick);
    if (verdict.outcome === 'playing') return fail(422, 'unfinished');
    if (!store.finishAttempt(attempt.id, req.now, verdict.outcome, verdict.stars, verdict.ticks)) return fail(409, 'already_submitted');
    return ok({ outcome: verdict.outcome, stars: verdict.stars, ticks: verdict.ticks });
  };

  const getProgress: Handler = (_req, [playerId]) => ok({ playerId, progress: store.progress(playerId) });

  // Adding a feature means adding a line here.
  const routes: Route[] = [
    { method: 'GET', pattern: /^\/v1\/health$/, limiter: reads, handler: () => ok({ ok: true, contentVersion: content.version }) },
    { method: 'POST', pattern: /^\/v1\/attempts$/, limiter: writes, handler: createAttempt },
    { method: 'POST', pattern: /^\/v1\/results$/, limiter: writes, handler: submitResult },
    { method: 'GET', pattern: /^\/v1\/players\/([A-Za-z0-9_-]{22})\/progress$/, limiter: reads, handler: getProgress },
  ];

  return async (req) => {
    let pathKnown = false;
    for (const route of routes) {
      const match = route.pattern.exec(req.path);
      if (!match) continue;
      pathKnown = true;
      if (route.method !== req.method) continue;
      if (!route.limiter.allow(req.ip, req.now)) return fail(429, 'rate_limited');
      return route.handler(req, match.slice(1));
    }
    return pathKnown ? fail(405, 'method_not_allowed') : fail(404, 'not_found');
  };
}

import type { FactionId } from '../content';
import type { LoggedCommand } from '../game/session';
import { load, save } from './storage';

// Client for the verification server. Everything here is optional: with no server
// configured, or no connection, the game plays exactly the same and results stay local.

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '';
export const apiEnabled = API !== '';

const IDENTITY_KEY = 'identity';
const PENDING_KEY = 'pendingResults';

interface Identity {
  publicKey: string;
  privateKey: CryptoKey;
  playerId?: string;
}

export interface PendingResult {
  attemptId: string;
  tick: number;
  log: LoggedCommand[];
}

export type SubmitOutcome =
  | { status: 'verified'; outcome: 'won' | 'lost'; stars: number }
  | { status: 'rejected'; error: string }
  | { status: 'offline' };

const b64url = (buf: ArrayBuffer) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let identityPromise: Promise<Identity | null> | undefined;

/** The device's anonymous key pair. The private key is non-extractable and never leaves the browser. */
function identity(): Promise<Identity | null> {
  identityPromise ??= (async () => {
    try {
      const stored = await load<Identity>(IDENTITY_KEY);
      if (stored?.privateKey && stored.publicKey) return stored;
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      const created: Identity = { publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)), privateKey: pair.privateKey };
      await save(IDENTITY_KEY, created);
      return created;
    } catch {
      return null;
    }
  })();
  return identityPromise;
}

// Circuit breaker: after a failed call the server is assumed down for a while, so a
// missing server costs one short timeout rather than a delay on every level start.
const RETRY_AFTER_MS = 30_000;
let downUntil = 0;

/** True when it is worth trying the network at all. */
export function serverReachable(): boolean {
  return apiEnabled && navigator.onLine !== false && Date.now() >= downUntil;
}

async function request<T>(path: string, body?: unknown, timeoutMs = 8000): Promise<{ status: number; data: T } | null> {
  if (!serverReachable()) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
    // A gateway error means a proxy answered but the server behind it did not.
    if (res.status >= 502 && res.status <= 504) throw new Error('unavailable');
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    downUntil = Date.now() + RETRY_AFTER_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the server for a seed. Returns null quickly when offline so the level still starts. */
export async function startAttempt(levelId: string, faction: FactionId): Promise<{ attemptId: string; seed: number } | null> {
  const id = apiEnabled ? await identity() : null;
  if (!id) return null;
  const res = await request<{ attemptId: string; seed: number; playerId: string }>('/v1/attempts', { publicKey: id.publicKey, levelId, faction }, 1500);
  if (!res || res.status !== 200) return null;
  if (id.playerId !== res.data.playerId) {
    id.playerId = res.data.playerId;
    void save(IDENTITY_KEY, id);
  }
  return { attemptId: res.data.attemptId, seed: res.data.seed };
}

async function send(result: PendingResult): Promise<SubmitOutcome> {
  const id = await identity();
  if (!id) return { status: 'offline' };
  const payload = JSON.stringify(result);
  const signature = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, id.privateKey, new TextEncoder().encode(payload)));
  const res = await request<{ outcome?: 'won' | 'lost'; stars?: number; error?: string }>('/v1/results', { payload, signature });
  if (!res || res.status === 429 || res.status >= 500) return { status: 'offline' };
  if (res.status !== 200) return { status: 'rejected', error: res.data.error ?? 'rejected' };
  return { status: 'verified', outcome: res.data.outcome!, stars: res.data.stars ?? 0 };
}

/** Submits a finished match. If the server cannot be reached the result is kept and retried on next launch. */
export async function submitResult(result: PendingResult): Promise<SubmitOutcome> {
  const outcome = await send(result);
  if (outcome.status === 'offline') {
    const pending = (await load<PendingResult[]>(PENDING_KEY)) ?? [];
    pending.push(result);
    await save(PENDING_KEY, pending.slice(-10));
  }
  return outcome;
}

export async function flushPending(): Promise<void> {
  const pending = await load<PendingResult[]>(PENDING_KEY);
  if (!apiEnabled || !pending?.length) return;
  const keep: PendingResult[] = [];
  for (const result of pending) {
    if ((await send(result)).status === 'offline') keep.push(result);
  }
  await save(PENDING_KEY, keep);
}

/** Server-verified stars per `${faction}:${levelId}`, or null when unavailable. */
export async function fetchVerified(): Promise<Record<string, number> | null> {
  const id = apiEnabled ? await identity() : null;
  if (!id?.playerId) return null;
  const res = await request<{ progress: { faction: string; levelId: string; stars: number }[] }>(`/v1/players/${id.playerId}/progress`);
  if (!res || res.status !== 200) return null;
  return Object.fromEntries(res.data.progress.map((p) => [`${p.faction}:${p.levelId}`, p.stars]));
}

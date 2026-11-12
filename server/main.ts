import { createServer, type IncomingMessage } from 'node:http';
import { createApp, defaultConfig } from './app';
import { SqliteStore } from './store';
import { LIMITS } from './verify';

// Configuration is environment variables only, with working defaults.
const env = process.env;
const PORT = Number(env.PORT ?? 8787);
const DB_PATH = env.DB_PATH ?? './legend-td.sqlite';
const CORS_ORIGIN = env.CORS_ORIGIN ?? '*';
/** Set when running behind a reverse proxy that sets X-Forwarded-For. */
const TRUST_PROXY = env.TRUST_PROXY === '1';
const QUIET = env.LOG === '0';

const store = new SqliteStore(DB_PATH);
const app = createApp(store, defaultConfig);

function clientIp(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Reads a JSON body, refusing anything over the size limit before buffering it all. */
function readJson(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: number }> {
  return new Promise((resolve) => {
    if (Number(req.headers['content-length'] ?? 0) > LIMITS.maxBodyBytes) return resolve({ ok: false, status: 413 });
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMITS.maxBodyBytes) {
        resolve({ ok: false, status: 413 });
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) return resolve({ ok: true, value: undefined });
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ ok: false, status: 400 });
      }
    });
    req.on('error', () => resolve({ ok: false, status: 400 }));
  });
}

const server = createServer(async (req, res) => {
  const started = performance.now();
  const path = (req.url ?? '/').split('?')[0];
  const method = req.method ?? 'GET';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'access-control-allow-origin': CORS_ORIGIN,
    'cache-control': 'no-store',
  };
  let status = 500;
  let body: unknown = { error: 'internal' };
  try {
    if (method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      headers['access-control-allow-headers'] = 'content-type';
      headers['access-control-max-age'] = '86400';
      status = 204;
      body = undefined;
    } else {
      const parsed = method === 'POST' ? await readJson(req) : ({ ok: true, value: undefined } as const);
      if (!parsed.ok) {
        status = parsed.status;
        body = { error: parsed.status === 413 ? 'too_large' : 'bad_request' };
      } else {
        ({ status, body } = await app({ method, path, body: parsed.value, ip: clientIp(req), now: Date.now() }));
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', path, message: e instanceof Error ? e.message : String(e) }));
  }
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
  if (!QUIET) console.log(JSON.stringify({ method, path, status, ms: Math.round((performance.now() - started) * 10) / 10 }));
});

// Abandoned attempts are the only data that grows without a result; sweep them occasionally.
const sweep = setInterval(() => store.purgeAttempts(Date.now() - defaultConfig.attemptTtlMs), 10 * 60 * 1000);
sweep.unref();

server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', message: 'listening', port: PORT, db: DB_PATH })));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

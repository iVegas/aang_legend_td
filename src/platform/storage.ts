// Minimal key-value store on IndexedDB. Falls back to memory when storage is unavailable
// (private windows, blocked site data) so the game still runs.

// Kept from the project's working title: renaming it would orphan players' saved progress.
const DB = 'legend-td';
const STORE = 'kv';
const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | undefined;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function load<T>(key: string): Promise<T | undefined> {
  const value = await run<T>('readonly', (s) => s.get(key));
  return value ?? (memory.get(key) as T | undefined);
}

export async function save(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  await run('readwrite', (s) => s.put(value, key));
}

export async function remove(key: string): Promise<void> {
  memory.delete(key);
  await run('readwrite', (s) => s.delete(key));
}

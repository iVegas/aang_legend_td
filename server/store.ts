import { DatabaseSync, type StatementSync } from 'node:sqlite';

export interface Attempt {
  id: string;
  playerId: string;
  publicKey: string;
  levelId: string;
  faction: string;
  seed: number;
  contentVersion: string;
  createdAt: number;
  finishedAt: number | null;
}

export interface ProgressRow {
  faction: string;
  levelId: string;
  stars: number;
}

/** Persistence boundary. Routes only ever talk to this interface. */
export interface Store {
  createAttempt(a: Omit<Attempt, 'finishedAt'>): void;
  getAttempt(id: string): Attempt | undefined;
  /** Marks the attempt used and records verified progress in one transaction. Returns false if it was already finished. */
  finishAttempt(id: string, at: number, outcome: string, stars: number, ticks: number): boolean;
  progress(playerId: string): ProgressRow[];
  /** Deletes unfinished attempts older than the cutoff; returns how many were removed. */
  purgeAttempts(olderThan: number): number;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  level_id TEXT NOT NULL,
  faction TEXT NOT NULL,
  seed INTEGER NOT NULL,
  content_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  outcome TEXT,
  stars INTEGER,
  ticks INTEGER
);
CREATE INDEX IF NOT EXISTS attempts_open ON attempts(created_at) WHERE finished_at IS NULL;
CREATE TABLE IF NOT EXISTS progress (
  player_id TEXT NOT NULL REFERENCES players(id),
  faction TEXT NOT NULL,
  level_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, faction, level_id)
) WITHOUT ROWID;
`;

/** SQLite via Node's built-in driver: one file on disk, no native add-ons to install. */
export class SqliteStore implements Store {
  private db: DatabaseSync;
  private q: Record<'player' | 'insert' | 'get' | 'finish' | 'progressUp' | 'progress' | 'purge', StatementSync>;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.q = {
      player: this.db.prepare('INSERT OR IGNORE INTO players (id, public_key, created_at) VALUES (?, ?, ?)'),
      insert: this.db.prepare(
        'INSERT INTO attempts (id, player_id, level_id, faction, seed, content_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ),
      get: this.db.prepare(
        `SELECT a.id, a.player_id AS playerId, p.public_key AS publicKey, a.level_id AS levelId, a.faction, a.seed,
                a.content_version AS contentVersion, a.created_at AS createdAt, a.finished_at AS finishedAt
         FROM attempts a JOIN players p ON p.id = a.player_id WHERE a.id = ?`,
      ),
      finish: this.db.prepare('UPDATE attempts SET finished_at = ?, outcome = ?, stars = ?, ticks = ? WHERE id = ? AND finished_at IS NULL'),
      progressUp: this.db.prepare(
        `INSERT INTO progress (player_id, faction, level_id, stars, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (player_id, faction, level_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at
         WHERE excluded.stars > progress.stars`,
      ),
      progress: this.db.prepare('SELECT faction, level_id AS levelId, stars FROM progress WHERE player_id = ?'),
      purge: this.db.prepare('DELETE FROM attempts WHERE finished_at IS NULL AND created_at < ?'),
    };
  }

  createAttempt(a: Omit<Attempt, 'finishedAt'>): void {
    this.q.player.run(a.playerId, a.publicKey, a.createdAt);
    this.q.insert.run(a.id, a.playerId, a.levelId, a.faction, a.seed, a.contentVersion, a.createdAt);
  }

  getAttempt(id: string): Attempt | undefined {
    return this.q.get.get(id) as unknown as Attempt | undefined;
  }

  finishAttempt(id: string, at: number, outcome: string, stars: number, ticks: number): boolean {
    const attempt = this.getAttempt(id);
    if (!attempt) return false;
    this.db.exec('BEGIN');
    try {
      const done = this.q.finish.run(at, outcome, stars, ticks, id).changes === 1;
      if (done && stars > 0) this.q.progressUp.run(attempt.playerId, attempt.faction, attempt.levelId, stars, at);
      this.db.exec('COMMIT');
      return done;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  progress(playerId: string): ProgressRow[] {
    return this.q.progress.all(playerId) as unknown as ProgressRow[];
  }

  purgeAttempts(olderThan: number): number {
    return Number(this.q.purge.run(olderThan).changes);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * SQLite open + boot-time migrations.
 *
 * Migrations live in ./migrations/*.sql (lexically ordered). Applied
 * migrations are tracked in a `_migrations` table so reruns are no-ops.
 * The schema itself is identical to the Cloudflare Worker's D1 schema
 * (server/worker/migrations/0001_init.sql) — both servers implement the
 * same OpenAPI contract over the same shapes.
 *
 * The DB path is read from Config.dbPath (default /data/governor.sqlite).
 * If the path looks ephemeral (e.g. /tmp or relative), the caller is
 * warned at boot — see warnIfEphemeral().
 */
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

export function openDb(path: string): Db {
  // Ensure the parent directory exists; better-sqlite3 will not create it.
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new Database(path);
  // WAL + foreign keys: WAL gives us non-blocking readers during writes;
  // FK enforcement is OFF by default in SQLite (yes, really) and we rely on it.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Db, migrationsDir = defaultMigrationsDir()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare(`SELECT name FROM _migrations`).all().map((r) => (r as { name: string }).name),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran: string[] = [];
  const insert = db.prepare(`INSERT INTO _migrations (name, applied_at) VALUES (?, ?)`);
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      insert.run(file, new Date().toISOString());
    });
    tx();
    ran.push(file);
  }
  return ran;
}

/**
 * Durability tiers, in decreasing order of safety:
 *
 *   replicated   GOVERNOR_REPLICATION_URL is set. The operator has
 *                committed to off-host replication (Litestream in the
 *                official Docker image; equivalent elsewhere).
 *   single-host  Persistent volume, but no off-host replication. A
 *                disk or host failure loses every attestation.
 *   ephemeral    Path is on /tmp, /var/tmp, or a relative path (the
 *                container's writable layer). Every restart is total
 *                data loss.
 *
 * The server refuses to start on the lower two tiers unless the
 * operator has explicitly acknowledged the risk via env vars.
 */
export type DurabilityClass = 'replicated' | 'single-host' | 'ephemeral';

export function classifyDurability(path: string, hasReplication: boolean): DurabilityClass {
  if (hasReplication) return 'replicated';
  const abs = resolve(path);
  const looksEphemeral =
    !isAbsolute(path) ||
    abs === '/tmp' ||
    abs.startsWith('/tmp/') ||
    abs.startsWith('/var/tmp/');
  return looksEphemeral ? 'ephemeral' : 'single-host';
}

export interface DurabilityPolicy {
  allowSingleHost: boolean;
  allowEphemeral: boolean;
}

/**
 * Throws (via process.exit(2)) with a multi-line operator-facing
 * explanation when the chosen path doesn't meet the durability policy.
 */
export function assertDurability(
  path: string,
  cls: DurabilityClass,
  policy: DurabilityPolicy,
  logger: (s: string) => void = console.error,
): void {
  if (cls === 'replicated') return;
  if (cls === 'single-host' && policy.allowSingleHost) {
    logger(banner([
      `Governor is running in SINGLE-HOST mode (db=${resolve(path)}).`,
      'Data survives container restarts on this host. A disk or host',
      'failure loses every attestation. Acceptable for evaluation or',
      'low-stakes use only.',
      '',
      'To upgrade to a durable deployment, set GOVERNOR_REPLICATION_URL',
      'to an S3-compatible bucket; see server/node/README.md.',
    ]));
    return;
  }
  if (cls === 'ephemeral' && policy.allowEphemeral) {
    logger(banner([
      `Governor is running with EPHEMERAL storage (db=${resolve(path)}).`,
      'Every restart wipes the database. Development/CI only.',
    ]));
    return;
  }

  const lines =
    cls === 'ephemeral'
      ? [
          `REFUSING TO START: Governor DB path "${resolve(path)}" is ephemeral.`,
          'The container\'s writable layer disappears on every restart, taking',
          'every attestation with it. That is never the right default for an',
          'audit log.',
          '',
          'Fix one of three ways:',
          '  1. (recommended) Configure off-host replication:',
          '     GOVERNOR_DB_PATH=/data/governor.sqlite',
          '     GOVERNOR_REPLICATION_URL=s3://your-bucket/governor',
          '     LITESTREAM_ACCESS_KEY_ID=...   LITESTREAM_SECRET_ACCESS_KEY=...',
          '  2. Mount a persistent volume at /data and set',
          '     GOVERNOR_DB_PATH=/data/governor.sqlite (single-host; see below).',
          '  3. Development only: GOVERNOR_ALLOW_EPHEMERAL=true',
        ]
      : [
          `REFUSING TO START: Governor DB at "${resolve(path)}" has no off-host replication.`,
          'A disk or host failure would lose every attestation. For an audit',
          'log we want at least one copy of the data outside the host.',
          '',
          'Fix one of two ways:',
          '  1. (recommended) Configure off-host replication:',
          '     GOVERNOR_REPLICATION_URL=s3://your-bucket/governor',
          '     LITESTREAM_ACCESS_KEY_ID=...   LITESTREAM_SECRET_ACCESS_KEY=...',
          '     (Litestream-compatible: AWS S3, Cloudflare R2, Backblaze B2,',
          '      MinIO, Wasabi, anything S3-API-compatible.)',
          '  2. Accept the single-host risk explicitly:',
          '     GOVERNOR_ALLOW_SINGLE_HOST=true',
        ];
  logger(banner(lines));
  logger('See governor/server/node/README.md for per-platform walkthroughs.');
  process.exit(2);
}

function banner(lines: string[]): string {
  const rule = '='.repeat(72);
  return ['', rule, ...lines.map((l) => l ? `  ${l}` : ''), rule, ''].join('\n');
}

function defaultMigrationsDir(): string {
  // Resolve relative to this compiled file so it works both in `tsx` dev
  // (src/storage.ts → ../migrations) and in `node dist/...` (dist/storage.js
  // → ../migrations). The migrations dir is copied next to dist/ in Docker.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'migrations');
}

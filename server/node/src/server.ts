/**
 * Node entry point: open the SQLite DB, run migrations, then start the
 * Hono app on PORT (default 8080). Designed to be the CMD of a Docker
 * image with /data mounted as a persistent volume.
 */
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { assertDurability, classifyDurability, migrate, openDb } from './storage.js';
import { readConfig } from './types.js';

const cfg = readConfig();

// Refuse to start (or warn loudly, depending on opt-in) before we open
// the database. See storage.ts:assertDurability for the policy.
const durability = classifyDurability(cfg.dbPath, !!cfg.replicationUrl);
assertDurability(cfg.dbPath, durability, {
  allowSingleHost: cfg.allowSingleHost,
  allowEphemeral: cfg.allowEphemeral,
});

const db = openDb(cfg.dbPath);
const ran = migrate(db);
if (ran.length > 0) {
  console.log(`governor: applied ${ran.length} migration(s): ${ran.join(', ')}`);
}

if (!cfg.bootstrapToken) {
  console.warn(
    'governor: GOVERNOR_BOOTSTRAP_TOKEN is not set. The admin bootstrap path is disabled; ' +
    'no first actor can be created until you set it.',
  );
}

const app = createApp(db, cfg);

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(
    `governor: listening on http://0.0.0.0:${info.port} ` +
    `(db=${cfg.dbPath}, durability=${durability}, public=${cfg.publicEnabled})`,
  );
});

const shutdown = (signal: string) => {
  console.log(`governor: ${signal} received, closing db`);
  try { db.close(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * Bearer-token authentication. Mirrors server/worker/src/auth.ts; only
 * the storage calls differ (better-sqlite3 instead of D1).
 *
 * The bearer is read from X-Governor-Authorization first, falling back to
 * Authorization. The fallback exists for deployments behind a proxy that
 * consumes Authorization for its own auth (e.g. Google IAP, which strips it
 * before the request reaches us); such clients send the Governor bearer in
 * X-Governor-Authorization instead. Direct deployments keep using
 * Authorization unchanged.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { sha256Hex } from './crypto.js';
import type { Db } from './storage.js';
import type { AppVars, AuthedActor, Config } from './types.js';

const BOOTSTRAP_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export function makeAuth(db: Db, cfg: Config): MiddlewareHandler<{ Variables: AppVars }> {
  return async (c, next) => {
    const header =
      c.req.header('X-Governor-Authorization') ?? c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return c.json({ error: 'unauthorized', message: 'missing bearer token' }, 401);
    }
    const token = match[1]!.trim();

    if (cfg.bootstrapToken && token === cfg.bootstrapToken) {
      c.set('actor', {
        id: BOOTSTRAP_ACTOR_ID,
        kind: 'service',
        display_name: 'bootstrap',
        roles: new Set(['admin']),
      });
      return next();
    }

    const hash = await sha256Hex(token);
    const row = db
      .prepare(
        `SELECT a.id, a.kind, a.display_name
         FROM tokens t
         JOIN actors a ON a.id = t.actor_id
         WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
      )
      .get(hash) as { id: string; kind: string; display_name: string } | undefined;

    if (!row) {
      return c.json({ error: 'unauthorized', message: 'invalid bearer token' }, 401);
    }

    const roleRows = db
      .prepare(`SELECT role FROM actor_roles WHERE actor_id = ?`)
      .all(row.id) as { role: string }[];

    c.set('actor', {
      id: row.id,
      kind: row.kind as AuthedActor['kind'],
      display_name: row.display_name,
      roles: new Set(roleRows.map((r) => r.role)),
    });
    return next();
  };
}

export function requireAdmin(c: Context<{ Variables: AppVars }>): Response | null {
  const actor = c.get('actor');
  if (!actor.roles.has('admin')) {
    return c.json({ error: 'forbidden', message: 'admin role required' }, 403);
  }
  return null;
}

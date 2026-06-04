/**
 * Bearer-token authentication.
 *
 * Two ways to authenticate:
 *
 * 1. The bootstrap token (env GOVERNOR_BOOTSTRAP_TOKEN). Synthesises a
 *    pseudo-actor with role `admin`. Used to create the first real actor
 *    and mint its first token.
 *
 * 2. A token issued via POST /v1/actors/{id}/tokens. Looked up by SHA-256
 *    hash; roles loaded from actor_roles.
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
import type { Env, AuthedActor } from './types.js';

const BOOTSTRAP_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export const auth: MiddlewareHandler<{ Bindings: Env; Variables: { actor: AuthedActor } }> =
  async (c, next) => {
    const header =
      c.req.header('X-Governor-Authorization') ?? c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      return c.json({ error: 'unauthorized', message: 'missing bearer token' }, 401);
    }
    const token = match[1]!.trim();

    // Trimmed: a bootstrap secret may carry surrounding whitespace (e.g. a
    // trailing newline from `openssl ... | secrets add --data-file=-`), which
    // would never match the already-trimmed incoming bearer token.
    const bootstrapToken = c.env.GOVERNOR_BOOTSTRAP_TOKEN?.trim();
    if (bootstrapToken && token === bootstrapToken) {
      c.set('actor', {
        id: BOOTSTRAP_ACTOR_ID,
        kind: 'service',
        display_name: 'bootstrap',
        roles: new Set(['admin']),
      });
      return next();
    }

    const hash = await sha256Hex(token);
    const row = await c.env.DB
      .prepare(
        `SELECT a.id, a.kind, a.display_name
         FROM tokens t
         JOIN actors a ON a.id = t.actor_id
         WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
      )
      .bind(hash)
      .first<{ id: string; kind: string; display_name: string }>();

    if (!row) {
      return c.json({ error: 'unauthorized', message: 'invalid bearer token' }, 401);
    }

    const roleRows = await c.env.DB
      .prepare(`SELECT role FROM actor_roles WHERE actor_id = ?`)
      .bind(row.id)
      .all<{ role: string }>();

    c.set('actor', {
      id: row.id,
      kind: row.kind as AuthedActor['kind'],
      display_name: row.display_name,
      roles: new Set((roleRows.results ?? []).map((r) => r.role)),
    });
    return next();
  };

export function requireAdmin(
  c: Context<{ Bindings: Env; Variables: { actor: AuthedActor } }>,
): Response | null {
  const actor = c.get('actor');
  if (!actor.roles.has('admin')) {
    return c.json({ error: 'forbidden', message: 'admin role required' }, 403);
  }
  return null;
}

/**
 * Governor reference server: Cloudflare Worker + D1 + Hono.
 * Implements the contract at governor/spec/openapi/governor.v1.yaml.
 */
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { auth, requireAdmin } from './auth.js';
import { mintTokenString, newUuid, nowIso, sha256Hex } from './crypto.js';
import { gateRun, loadRun, serialiseAttestation, serialiseRun } from './runs.js';
import type { ActorKind, AuthedActor, Env } from './types.js';

type App = { Bindings: Env; Variables: { actor: AuthedActor } };

const app = new Hono<App>();

app.get('/', (c) => c.json({ name: 'governor', version: c.env.GOVERNOR_VERSION ?? 'dev' }));

const v1 = new Hono<App>();
v1.use('*', auth);

v1.get('/whoami', (c) => {
  const a = c.get('actor');
  return c.json({ id: a.id, kind: a.kind, display_name: a.display_name, roles: [...a.roles] });
});

v1.post('/actors', async (c) => {
  const forbidden = requireAdmin(c);
  if (forbidden) return forbidden;
  const body = await c.req.json().catch(() => null) as
    | { kind?: ActorKind; display_name?: string; roles?: string[] }
    | null;
  if (!body?.kind || !body.display_name) {
    return c.json({ error: 'invalid', message: 'kind and display_name are required' }, 422);
  }
  if (!['human', 'agent', 'service'].includes(body.kind)) {
    return c.json({ error: 'invalid', message: 'kind must be human|agent|service' }, 422);
  }
  const id = newUuid();
  const created_at = nowIso();
  const roles = Array.from(new Set(body.roles ?? []));
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO actors (id, kind, display_name, created_at) VALUES (?,?,?,?)`)
      .bind(id, body.kind, body.display_name, created_at),
    ...roles.map((r) =>
      c.env.DB.prepare(`INSERT INTO actor_roles (actor_id, role) VALUES (?,?)`).bind(id, r),
    ),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ id, kind: body.kind, display_name: body.display_name, roles, created_at }, 201);
});

v1.post('/actors/:actor_id/tokens', async (c) => {
  const actor = c.get('actor');
  const targetId = c.req.param('actor_id');
  if (!actor.roles.has('admin') && actor.id !== targetId) {
    return c.json({ error: 'forbidden', message: 'cannot mint tokens for another actor' }, 403);
  }
  const exists = await c.env.DB.prepare(`SELECT 1 FROM actors WHERE id = ?`).bind(targetId).first();
  if (!exists) return c.json({ error: 'not-found', message: 'actor does not exist' }, 404);

  const token = mintTokenString();
  const token_hash = await sha256Hex(token);
  const id = newUuid();
  const created_at = nowIso();
  await c.env.DB
    .prepare(`INSERT INTO tokens (id, actor_id, token_hash, prefix, created_at) VALUES (?,?,?,?,?)`)
    .bind(id, targetId, token_hash, token.slice(0, 8), created_at)
    .run();
  return c.json({ token, actor_id: targetId, created_at }, 201);
});

v1.post('/runs', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => null) as {
    checklist?: { key?: string; title?: string; items?: Array<{ key: string; description?: string; rule: unknown }> };
    subject?: { id?: string; label?: string; kind?: string };
  } | null;
  const cl = body?.checklist;
  const sub = body?.subject;
  if (!cl?.key || !cl.items?.length || !sub?.id) {
    return c.json({ error: 'invalid', message: 'checklist.key, checklist.items, subject.id required' }, 422);
  }
  const id = newUuid();
  const created_at = nowIso();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO runs (id, subject_id, subject_label, subject_kind, checklist_key, checklist_title, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(id, sub.id, sub.label ?? null, sub.kind ?? null, cl.key, cl.title ?? null, created_at, actor.id),
    ...cl.items.map((it, idx) =>
      c.env.DB.prepare(
        `INSERT INTO run_items (run_id, key, description, rule_json, ordinal) VALUES (?,?,?,?,?)`,
      ).bind(id, it.key, it.description ?? null, JSON.stringify(it.rule), idx),
    ),
  ];
  await c.env.DB.batch(stmts);
  const bundle = await loadRun(c.env, id);
  return c.json(serialiseRun(bundle!), 201);
});

v1.get('/runs/:run_id', async (c) => {
  const bundle = await loadRun(c.env, c.req.param('run_id'));
  if (!bundle) return c.json({ error: 'not-found', message: 'run does not exist' }, 404);
  return c.json(serialiseRun(bundle));
});

v1.post('/runs/:run_id/attestations', async (c) => {
  const actor = c.get('actor');
  const runId = c.req.param('run_id');
  const body = await c.req.json().catch(() => null) as
    | { item_key?: string; note?: string }
    | null;
  if (!body?.item_key) {
    return c.json({ error: 'invalid', message: 'item_key is required' }, 422);
  }
  const item = await c.env.DB
    .prepare(`SELECT 1 FROM run_items WHERE run_id = ? AND key = ?`)
    .bind(runId, body.item_key)
    .first();
  if (!item) return c.json({ error: 'not-found', message: 'run or item does not exist' }, 404);

  const id = newUuid();
  const attested_at = nowIso();
  await c.env.DB
    .prepare(
      `INSERT INTO attestations (id, run_id, item_key, actor_id, note, attested_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(id, runId, body.item_key, actor.id, body.note ?? null, attested_at)
    .run();
  return c.json(
    serialiseAttestation({
      id, run_id: runId, item_key: body.item_key,
      actor_id: actor.id, actor_kind: actor.kind, actor_display_name: actor.display_name,
      note: body.note ?? null, attested_at,
    }),
    201,
  );
});

v1.get('/runs/:run_id/gate', async (c) => {
  const bundle = await loadRun(c.env, c.req.param('run_id'));
  if (!bundle) return c.json({ error: 'not-found', message: 'run does not exist' }, 404);
  return c.json(await gateRun(c.env, bundle));
});

app.route('/v1', v1);

export default app;

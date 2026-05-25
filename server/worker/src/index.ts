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

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="25" fill="none" stroke="#111" stroke-width="6"/>' +
  '<path d="M19 33 L28.5 43 L46 22" fill="none" stroke="#111" stroke-width="7" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

app.get('/favicon.svg', (c) => {
  return new Response(FAVICON_SVG, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
  });
});

app.get('/', (c) => {
  const version = c.env.GOVERNOR_VERSION ?? 'dev';
  // Content-negotiated: browsers get a tiny landing page, API clients get JSON.
  const accept = c.req.header('accept') ?? '';
  if (accept.includes('text/html')) {
    return c.html(
      `<!doctype html><html lang="en"><meta charset="utf-8">` +
        `<title>Governor</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>html{font:15px/1.55 ui-sans-serif,-apple-system,system-ui,sans-serif;` +
        `color:#1a1a1a;background:#fafaf7}@media(prefers-color-scheme:dark){html{color:#e8e6df;background:#111418}}` +
        `body{max-width:560px;margin:14vh auto;padding:0 24px}h1{display:flex;align-items:center;gap:14px;font-size:28px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}` +
        `h1 svg{flex:0 0 auto}p{opacity:.75;margin:0 0 8px}code{font:13px ui-monospace,Menlo,monospace;background:rgba(127,127,127,.12);padding:2px 6px;border-radius:4px}` +
        `a{color:inherit}</style>` +
        `<body><h1>` +
        `<svg width="32" height="32" viewBox="0 0 64 64"><circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="5"/>` +
        `<path d="M19 33 L28.5 43 L46 22" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
        `Governor</h1>` +
        `<p>Reference attestation server, version <code>${version}</code>. ` +
        `Authenticated API under <code>/v1</code>.</p>` +
        `<p>Source &amp; spec at <a href="https://github.com/makemore/governor">github.com/makemore/governor</a>.</p>`,
    );
  }
  return c.json({ name: 'governor', version });
});

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

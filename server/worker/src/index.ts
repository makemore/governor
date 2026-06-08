/**
 * Governor reference server: Cloudflare Worker + D1 + Hono.
 * Implements the contract at governor/spec/openapi/governor.v1.yaml.
 */
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { auth, requireAdmin } from './auth.js';
import { mintTokenString, newUuid, nowIso, sha256Hex } from './crypto.js';
import {
  buildSubjectView,
  isPublicEnabled,
  loadRecentActivity,
  loadRecentSubjects,
  readPublicConfig,
} from './public.js';
import { renderPublicPage } from './public-render.js';
import {
  parseHistory,
  renderLogMarkdown,
  renderReportPage,
  renderSubjectMarkdown,
  reportFileName,
} from './report-render.js';
import { gateRun, listRuns, loadRun, parseAttestationBody, serialiseAttestation, serialiseRun } from './runs.js';
import type { ActorKind, AuthedActor, Env } from './types.js';

type App = { Bindings: Env; Variables: { actor: AuthedActor } };

const app = new Hono<App>();

// Clamp the ?limit query for run listing to a sane range (default 50, max 200).
function parseListLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 200);
}

// Parse the ?offset query for run listing; non-positive/invalid -> 0.
function parseListOffset(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="25" fill="none" stroke="#111" stroke-width="6"/>' +
  '<path d="M19 33 L28.5 43 L46 22" fill="none" stroke="#111" stroke-width="7" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

// 180x180 PNG, brand/png/apple-touch-icon.png, base64. Regenerate with
// `rsvg-convert -w 180 favicon.svg | base64 | tr -d '\n'`.
const APPLE_TOUCH_ICON_PNG_B64 =
  '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';

app.get('/favicon.svg', (c) => {
  return new Response(FAVICON_SVG, {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
  });
});

app.get('/apple-touch-icon.png', () => {
  const bytes = Uint8Array.from(atob(APPLE_TOUCH_ICON_PNG_B64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
});
// iOS probes both with and without a precomposed suffix; alias to the same asset.
app.get('/apple-touch-icon-precomposed.png', (c) => c.redirect('/apple-touch-icon.png', 301));

app.get('/', async (c) => {
  const version = c.env.GOVERNOR_VERSION ?? 'dev';
  // Content-negotiated: browsers get HTML, API clients get JSON.
  const accept = c.req.header('accept') ?? '';
  if (!accept.includes('text/html')) {
    return c.json({ name: 'governor', version });
  }
  if (isPublicEnabled(c.env)) {
    const cfg = readPublicConfig(c.env);
    const [subjects, activity] = await Promise.all([
      loadRecentSubjects(c.env, cfg.subjectLimit),
      loadRecentActivity(c.env, cfg.activityLimit),
    ]);
    return c.html(renderPublicPage(cfg, subjects, activity, Date.now()));
  }
  return c.html(
    `<!doctype html><html lang="en"><meta charset="utf-8">` +
      `<title>Governor</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` +
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
});

// Downloadable reports (same data + opt-in flag as the public page).
const REPORT_SUBJECT_LIMIT = 1000;
const mdResponse = (body: string, filename: string) =>
  new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });

app.get('/r/:run_id/report.md', async (c) => {
  if (!isPublicEnabled(c.env)) return c.json({ error: 'not-found' }, 404);
  const s = await buildSubjectView(c.env, c.req.param('run_id'));
  if (!s) return c.json({ error: 'not-found', message: 'run does not exist' }, 404);
  const history = parseHistory(c.req.query('history'));
  return mdResponse(
    renderSubjectMarkdown(readPublicConfig(c.env), s, Date.now(), { history }),
    reportFileName(s, 'md', history),
  );
});

app.get('/r/:run_id/report', async (c) => {
  if (!isPublicEnabled(c.env)) return c.json({ error: 'not-found' }, 404);
  const cfg = readPublicConfig(c.env);
  const s = await buildSubjectView(c.env, c.req.param('run_id'));
  if (!s) return c.json({ error: 'not-found', message: 'run does not exist' }, 404);
  const history = parseHistory(c.req.query('history'));
  return c.html(renderReportPage(cfg, `${s.subjectLabel ?? s.subjectId} — report`, [s], Date.now(), {
    history,
    togglePath: `/r/${s.runId}/report`,
  }));
});

app.get('/report.md', async (c) => {
  if (!isPublicEnabled(c.env)) return c.json({ error: 'not-found' }, 404);
  const subjects = await loadRecentSubjects(c.env, REPORT_SUBJECT_LIMIT);
  const history = parseHistory(c.req.query('history'));
  const filename = history === 'passing' ? 'governor-full-report-passing.md' : 'governor-full-report.md';
  return mdResponse(renderLogMarkdown(readPublicConfig(c.env), subjects, Date.now(), { history }), filename);
});

app.get('/report', async (c) => {
  if (!isPublicEnabled(c.env)) return c.json({ error: 'not-found' }, 404);
  const cfg = readPublicConfig(c.env);
  const subjects = await loadRecentSubjects(c.env, REPORT_SUBJECT_LIMIT);
  const history = parseHistory(c.req.query('history'));
  return c.html(renderReportPage(cfg, `${cfg.title} — full report`, subjects, Date.now(), {
    history,
    togglePath: '/report',
  }));
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

v1.get('/runs', async (c) => {
  const limit = parseListLimit(c.req.query('limit'));
  const offset = parseListOffset(c.req.query('offset'));
  const search = c.req.query('q') ?? c.req.query('search') ?? undefined;
  return c.json(await listRuns(c.env, { limit, offset, search }));
});

v1.get('/runs/:run_id', async (c) => {
  const bundle = await loadRun(c.env, c.req.param('run_id'));
  if (!bundle) return c.json({ error: 'not-found', message: 'run does not exist' }, 404);
  return c.json(serialiseRun(bundle));
});

v1.post('/runs/:run_id/attestations', async (c) => {
  const actor = c.get('actor');
  const runId = c.req.param('run_id');
  const parsed = parseAttestationBody(await c.req.json().catch(() => null));
  if (!parsed.ok) {
    return c.json({ error: 'invalid', message: parsed.message }, 422);
  }
  const body = parsed.value;
  const item = await c.env.DB
    .prepare(`SELECT 1 FROM run_items WHERE run_id = ? AND key = ?`)
    .bind(runId, body.item_key)
    .first();
  if (!item) return c.json({ error: 'not-found', message: 'run or item does not exist' }, 404);

  const id = newUuid();
  const attested_at = nowIso();
  const evidenceJson = body.evidence ? JSON.stringify(body.evidence) : null;
  await c.env.DB
    .prepare(
      `INSERT INTO attestations
         (id, run_id, item_key, actor_id, note, outcome, severity, detail, evidence, attested_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id, runId, body.item_key, actor.id,
      body.note, body.outcome, body.severity, body.detail, evidenceJson, attested_at,
    )
    .run();
  return c.json(
    serialiseAttestation({
      id, run_id: runId, item_key: body.item_key,
      actor_id: actor.id, actor_kind: actor.kind, actor_display_name: actor.display_name,
      note: body.note, outcome: body.outcome, severity: body.severity,
      detail: body.detail, evidence: evidenceJson, attested_at,
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

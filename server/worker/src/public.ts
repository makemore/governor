/**
 * Public read-only status view. Opt-in via GOVERNOR_PUBLIC_ENABLED=true.
 *
 * Reads the same D1 that the authenticated API writes to; renders a
 * branded HTML page for browsers. Off by default; the operator chooses
 * what (if anything) to expose by setting environment variables in
 * wrangler.toml.
 */
import { gateRun, loadRun, type EvidenceItem } from './runs.js';
import type { Env } from './types.js';

export interface PublicConfig {
  brandName: string;
  accent: string;
  logoUrl: string | null;
  title: string;
  tagline: string;
  hideActorNames: boolean;
  hideNotes: boolean;
  subjectLimit: number;
  activityLimit: number;
}

export function readPublicConfig(env: Env): PublicConfig {
  return {
    brandName: env.GOVERNOR_BRAND_NAME ?? 'Governor',
    accent: env.GOVERNOR_BRAND_ACCENT ?? '#1f6f5c',
    logoUrl: env.GOVERNOR_BRAND_LOGO_URL ?? null,
    title: env.GOVERNOR_PUBLIC_TITLE ?? 'Attestation log',
    tagline:
      env.GOVERNOR_PUBLIC_TAGLINE ??
      'Live record of who has signed off on what, and what is still waiting.',
    hideActorNames: env.GOVERNOR_PUBLIC_HIDE_ACTOR_NAMES === 'true',
    hideNotes: env.GOVERNOR_PUBLIC_HIDE_NOTES === 'true',
    subjectLimit: 10,
    activityLimit: 20,
  };
}

export function isPublicEnabled(env: Env): boolean {
  return env.GOVERNOR_PUBLIC_ENABLED === 'true';
}

export interface ActivityRow {
  attestation_id: string;
  run_id: string;
  item_key: string;
  actor_kind: string;
  actor_display_name: string;
  note: string | null;
  outcome: string | null;
  attested_at: string;
  subject_id: string;
  subject_label: string | null;
  checklist_title: string | null;
}

export interface AttestationView {
  id: string;
  actorKind: string;
  displayName: string;
  attestedAt: string;
  outcome: string;
  severity: string | null;
  note: string | null;
  detail: string | null;
  evidence: EvidenceItem[] | null;
}

export interface SubjectView {
  runId: string;
  subjectId: string;
  subjectLabel: string | null;
  checklistTitle: string | null;
  createdAt: string;
  decision: 'allow' | 'deny';
  totalItems: number;
  satisfiedItems: number;
  items: {
    key: string;
    description: string | null;
    satisfied: boolean;
    attestations: AttestationView[];
  }[];
}

export async function buildSubjectView(env: Env, runId: string): Promise<SubjectView | null> {
  const bundle = await loadRun(env, runId);
  if (!bundle) return null;
  const gate = await gateRun(env, bundle);
  const attsByItem = new Map<string, typeof bundle.attestations>();
  for (const a of bundle.attestations) {
    const list = attsByItem.get(a.item_key) ?? [];
    list.push(a);
    attsByItem.set(a.item_key, list);
  }
  const satisfiedKeys = new Set(gate.items.filter((i) => i.satisfied).map((i) => i.key));
  return {
    runId: bundle.run.id,
    subjectId: bundle.run.subject_id,
    subjectLabel: bundle.run.subject_label,
    checklistTitle: bundle.run.checklist_title,
    createdAt: bundle.run.created_at,
    decision: gate.decision,
    totalItems: gate.summary.items_total,
    satisfiedItems: gate.summary.items_satisfied,
    items: bundle.items.map((i) => ({
      key: i.key,
      description: i.description,
      satisfied: satisfiedKeys.has(i.key),
      attestations: (attsByItem.get(i.key) ?? []).map((a) => ({
        id: a.id,
        actorKind: a.actor_kind,
        displayName: a.actor_display_name,
        attestedAt: a.attested_at,
        outcome: a.outcome ?? 'pass',
        severity: a.severity,
        note: a.note,
        detail: a.detail,
        evidence: a.evidence ? (JSON.parse(a.evidence) as EvidenceItem[]) : null,
      })),
    })),
  };
}

export async function loadRecentSubjects(env: Env, limit: number): Promise<SubjectView[]> {
  const rows = await env.DB
    .prepare(`SELECT id FROM runs ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<{ id: string }>();
  const out: SubjectView[] = [];
  for (const r of rows.results ?? []) {
    const view = await buildSubjectView(env, r.id);
    if (view) out.push(view);
  }
  return out;
}

export async function loadRecentActivity(env: Env, limit: number): Promise<ActivityRow[]> {
  const rows = await env.DB
    .prepare(
      `SELECT a.id AS attestation_id, a.run_id, a.item_key,
              ac.kind AS actor_kind, ac.display_name AS actor_display_name,
              a.note, a.outcome, a.attested_at,
              r.subject_id, r.subject_label, r.checklist_title
       FROM attestations a
       JOIN actors ac ON ac.id = a.actor_id
       JOIN runs   r  ON r.id  = a.run_id
       ORDER BY a.attested_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<ActivityRow>();
  return rows.results ?? [];
}

export function relativeTime(isoTs: string, nowMs: number): string {
  const then = Date.parse(isoTs);
  if (!Number.isFinite(then)) return isoTs;
  const sec = Math.max(0, Math.round((nowMs - then) / 1000));
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400)     return `${Math.round(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.round(sec / 86400)}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

export function escape(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!),
  );
}

/**
 * Run persistence + gate evaluation. The evaluator is `@governor/core`;
 * this file is glue between D1 rows and the evaluator's pure data shape.
 */
import { evaluate, type Attestation as RuleAttestation } from '@governor/core';
import type { Env } from './types.js';

interface RunRow {
  id: string;
  subject_id: string;
  subject_label: string | null;
  subject_kind: string | null;
  checklist_key: string;
  checklist_title: string | null;
  created_at: string;
}

interface ItemRow {
  key: string;
  description: string | null;
  rule_json: string;
  ordinal: number;
}

interface AttRow {
  id: string;
  run_id: string;
  item_key: string;
  actor_id: string;
  actor_kind: string;
  actor_display_name: string;
  note: string | null;
  outcome: string | null;
  severity: string | null;
  detail: string | null;
  evidence: string | null;
  attested_at: string;
}

export const ATTESTATION_OUTCOMES = ['pass', 'fail', 'waived'] as const;
export type AttestationOutcome = (typeof ATTESTATION_OUTCOMES)[number];

export const ATTESTATION_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

export type EvidenceKind = 'url' | 'hash' | 'inline';
export interface EvidenceItem {
  kind: EvidenceKind;
  url?: string;
  content_hash?: string;
  media_type?: string;
  inline_metadata?: Record<string, unknown>;
}

export interface ParsedAttestation {
  item_key: string;
  note: string | null;
  outcome: AttestationOutcome;
  severity: string | null;
  detail: string | null;
  evidence: EvidenceItem[] | null;
}

export type ParseResult =
  | { ok: true; value: ParsedAttestation }
  | { ok: false; message: string };

/**
 * Validate and normalise an attestation request body. Lenient about
 * absent fields (everything but item_key is optional; a missing outcome
 * defaults to 'pass'), strict about malformed enums and evidence shapes —
 * those return a message the handler turns into a 422.
 */
export function parseAttestationBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: 'request body must be a JSON object' };
  }
  const b = raw as Record<string, unknown>;
  const item_key = typeof b.item_key === 'string' ? b.item_key.trim() : '';
  if (!item_key) return { ok: false, message: 'item_key is required' };

  let outcome: AttestationOutcome = 'pass';
  if (b.outcome != null && b.outcome !== '') {
    if (typeof b.outcome !== 'string' || !(ATTESTATION_OUTCOMES as readonly string[]).includes(b.outcome)) {
      return { ok: false, message: `outcome must be one of: ${ATTESTATION_OUTCOMES.join(', ')}` };
    }
    outcome = b.outcome as AttestationOutcome;
  }

  let severity: string | null = null;
  if (b.severity != null && b.severity !== '') {
    if (typeof b.severity !== 'string' || !(ATTESTATION_SEVERITIES as readonly string[]).includes(b.severity)) {
      return { ok: false, message: `severity must be one of: ${ATTESTATION_SEVERITIES.join(', ')}` };
    }
    severity = b.severity;
  }

  const note = typeof b.note === 'string' && b.note !== '' ? b.note : null;
  const detail = typeof b.detail === 'string' && b.detail !== '' ? b.detail : null;

  let evidence: EvidenceItem[] | null = null;
  if (b.evidence != null) {
    if (!Array.isArray(b.evidence)) {
      return { ok: false, message: 'evidence must be an array' };
    }
    const items: EvidenceItem[] = [];
    for (let i = 0; i < b.evidence.length; i++) {
      const r = parseEvidenceItem(b.evidence[i], i);
      if (!r.ok) return r;
      items.push(r.value);
    }
    evidence = items.length > 0 ? items : null;
  }

  return { ok: true, value: { item_key, note, outcome, severity, detail, evidence } };
}

function parseEvidenceItem(
  e: unknown,
  idx: number,
): { ok: true; value: EvidenceItem } | { ok: false; message: string } {
  if (!e || typeof e !== 'object') {
    return { ok: false, message: `evidence[${idx}] must be an object` };
  }
  const o = e as Record<string, unknown>;
  if (o.kind !== 'url' && o.kind !== 'hash' && o.kind !== 'inline') {
    return { ok: false, message: `evidence[${idx}].kind must be one of: url, hash, inline` };
  }
  const item: EvidenceItem = { kind: o.kind };
  if (typeof o.url === 'string' && o.url !== '') item.url = o.url;
  if (typeof o.content_hash === 'string' && o.content_hash !== '') item.content_hash = o.content_hash;
  if (typeof o.media_type === 'string' && o.media_type !== '') item.media_type = o.media_type;
  if (o.inline_metadata && typeof o.inline_metadata === 'object' && !Array.isArray(o.inline_metadata)) {
    item.inline_metadata = o.inline_metadata as Record<string, unknown>;
  }
  if (item.kind === 'url' && !item.url) {
    return { ok: false, message: `evidence[${idx}] of kind url requires a url` };
  }
  if (item.kind === 'hash' && !item.content_hash) {
    return { ok: false, message: `evidence[${idx}] of kind hash requires content_hash` };
  }
  return { ok: true, value: item };
}

export interface RunBundle {
  run: RunRow;
  items: ItemRow[];
  attestations: AttRow[];
}

export async function loadRun(env: Env, runId: string): Promise<RunBundle | null> {
  const run = await env.DB
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .bind(runId)
    .first<RunRow>();
  if (!run) return null;

  const items = await env.DB
    .prepare(`SELECT key, description, rule_json, ordinal FROM run_items WHERE run_id = ? ORDER BY ordinal`)
    .bind(runId)
    .all<ItemRow>();

  const atts = await env.DB
    .prepare(
      `SELECT a.id, a.run_id, a.item_key, a.actor_id,
              a.note, a.outcome, a.severity, a.detail, a.evidence, a.attested_at,
              ac.kind AS actor_kind, ac.display_name AS actor_display_name
       FROM attestations a
       JOIN actors ac ON ac.id = a.actor_id
       WHERE a.run_id = ?
       ORDER BY a.attested_at`,
    )
    .bind(runId)
    .all<AttRow>();

  return { run, items: items.results ?? [], attestations: atts.results ?? [] };
}

export function serialiseRun(bundle: RunBundle) {
  const byItem = new Map<string, AttRow[]>();
  for (const a of bundle.attestations) {
    const list = byItem.get(a.item_key) ?? [];
    list.push(a);
    byItem.set(a.item_key, list);
  }
  return {
    id: bundle.run.id,
    subject: {
      id: bundle.run.subject_id,
      label: bundle.run.subject_label ?? undefined,
      kind: bundle.run.subject_kind ?? undefined,
    },
    created_at: bundle.run.created_at,
    items: bundle.items.map((i) => ({
      key: i.key,
      description: i.description ?? undefined,
      rule: JSON.parse(i.rule_json),
      attestations: (byItem.get(i.key) ?? []).map(serialiseAttestation),
    })),
  };
}

export function serialiseAttestation(a: AttRow) {
  return {
    id: a.id,
    run_id: a.run_id,
    item_key: a.item_key,
    actor: {
      id: a.actor_id,
      kind: a.actor_kind,
      display_name: a.actor_display_name,
    },
    attested_at: a.attested_at,
    outcome: (a.outcome ?? 'pass') as AttestationOutcome,
    severity: a.severity ?? undefined,
    note: a.note ?? undefined,
    detail: a.detail ?? undefined,
    evidence: a.evidence ? (JSON.parse(a.evidence) as EvidenceItem[]) : undefined,
  };
}

export interface RunSummary {
  id: string;
  subject: { id: string; label?: string; kind?: string };
  checklist_title?: string;
  created_at: string;
  decision: 'allow' | 'deny';
  summary: { items_total: number; items_satisfied: number };
}

/**
 * Lightweight enumeration of recent runs for pickers and dashboards. Most
 * recent first. Each entry carries the gate decision and item counts so a
 * client can show progress without a follow-up request per run.
 */
export async function listRuns(env: Env, limit: number): Promise<RunSummary[]> {
  const rows = await env.DB
    .prepare(`SELECT id FROM runs ORDER BY created_at DESC LIMIT ?`)
    .bind(limit)
    .all<{ id: string }>();
  const out: RunSummary[] = [];
  for (const r of rows.results ?? []) {
    const bundle = await loadRun(env, r.id);
    if (!bundle) continue;
    const gate = await gateRun(env, bundle);
    out.push({
      id: bundle.run.id,
      subject: {
        id: bundle.run.subject_id,
        label: bundle.run.subject_label ?? undefined,
        kind: bundle.run.subject_kind ?? undefined,
      },
      checklist_title: bundle.run.checklist_title ?? undefined,
      created_at: bundle.run.created_at,
      decision: gate.decision,
      summary: gate.summary,
    });
  }
  return out;
}

/**
 * Compute the gate decision. Loads per-actor roles for everyone who has
 * attested on this run, then asks the pure evaluator about each item.
 */
export async function gateRun(env: Env, bundle: RunBundle) {
  const actorIds = Array.from(new Set(bundle.attestations.map((a) => a.actor_id)));
  const actorRoles: Record<string, Set<string>> = {};
  if (actorIds.length > 0) {
    const placeholders = actorIds.map(() => '?').join(',');
    const roleRows = await env.DB
      .prepare(`SELECT actor_id, role FROM actor_roles WHERE actor_id IN (${placeholders})`)
      .bind(...actorIds)
      .all<{ actor_id: string; role: string }>();
    for (const r of roleRows.results ?? []) {
      const set = actorRoles[r.actor_id] ?? new Set<string>();
      set.add(r.role);
      actorRoles[r.actor_id] = set;
    }
  }

  const byItem = new Map<string, RuleAttestation[]>();
  for (const a of bundle.attestations) {
    // A recorded failure never satisfies a rule. NULL/pass/waived all count
    // toward the gate; only an explicit 'fail' is excluded.
    if (a.outcome === 'fail') continue;
    const list = byItem.get(a.item_key) ?? [];
    list.push({ actor_id: a.actor_id, actor_kind: a.actor_kind });
    byItem.set(a.item_key, list);
  }

  const items = bundle.items.map((i) => {
    const atts = byItem.get(i.key) ?? [];
    const satisfied = evaluate(JSON.parse(i.rule_json), atts, actorRoles);
    return { key: i.key, satisfied, reason: satisfied ? 'rule satisfied' : 'rule not yet satisfied' };
  });
  const satisfiedCount = items.filter((i) => i.satisfied).length;
  return {
    decision: satisfiedCount === items.length ? ('allow' as const) : ('deny' as const),
    summary: { items_total: items.length, items_satisfied: satisfiedCount },
    items,
  };
}

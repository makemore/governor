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
  attested_at: string;
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
      `SELECT a.id, a.run_id, a.item_key, a.actor_id, a.note, a.attested_at,
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
    note: a.note ?? undefined,
  };
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

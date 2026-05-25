/**
 * Pure-TypeScript evaluator for the Governor rule DSL
 * (spec/schemas/rule.v1.json).
 *
 * Mirrors the Python reference implementation at
 * governor/core/python/src/governor_core/rules.py. Both implementations
 * are validated against the same conformance vectors in
 * governor/spec/conformance/rules.v1.json.
 */

export interface Attestation {
  actor_id: string;
  actor_kind: string;
  [key: string]: unknown;
}

/** Map of actor_id -> set of role slugs that actor holds. */
export type ActorRoles = Record<string, ReadonlySet<string> | readonly string[]>;

export type Rule =
  | null
  | { actor: true }
  | { actor_with_role: string }
  | { actor_with_kind: string }
  | { actor_is: string }
  | { all_of: Rule[] }
  | { any_of: Rule[] }
  | { n_of: { count: number; of: Rule[] } }
  | Record<string, unknown>;

export interface ExplainNode {
  rule: Rule;
  satisfied: boolean;
  children?: ExplainNode[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function attesterIds(attestations: readonly Attestation[]): Set<string> {
  return new Set(attestations.map((a) => String(a.actor_id)));
}

function attesterKinds(attestations: readonly Attestation[]): Set<string> {
  return new Set(attestations.map((a) => String(a.actor_kind)));
}

function roleSet(roles: ActorRoles, actorId: string): ReadonlySet<string> {
  const entry = roles[actorId];
  if (!entry) return new Set();
  return entry instanceof Set ? entry : new Set(entry);
}

export function evaluate(
  rule: Rule,
  attestations: readonly Attestation[],
  actorRoles: ActorRoles,
): boolean {
  if (!isObject(rule) || Object.keys(rule).length === 0) {
    return false;
  }

  if ('all_of' in rule) {
    const branches = rule.all_of as Rule[];
    return branches.every((r) => evaluate(r, attestations, actorRoles));
  }
  if ('any_of' in rule) {
    const branches = rule.any_of as Rule[];
    return branches.some((r) => evaluate(r, attestations, actorRoles));
  }
  if ('n_of' in rule) {
    const spec = rule.n_of as { count?: number; of?: Rule[] };
    const count = Number(spec.count ?? 0);
    const branches = spec.of ?? [];
    const hits = branches.reduce(
      (n, r) => n + (evaluate(r, attestations, actorRoles) ? 1 : 0),
      0,
    );
    return hits >= count;
  }

  if ('actor' in rule && rule.actor === true) {
    return attestations.length > 0;
  }
  if ('actor_with_role' in rule) {
    const slug = String(rule.actor_with_role);
    for (const aid of attesterIds(attestations)) {
      if (roleSet(actorRoles, aid).has(slug)) return true;
    }
    return false;
  }
  if ('actor_is' in rule) {
    return attesterIds(attestations).has(String(rule.actor_is));
  }
  if ('actor_with_kind' in rule) {
    return attesterKinds(attestations).has(String(rule.actor_with_kind));
  }
  return false;
}

export function explain(
  rule: Rule,
  attestations: readonly Attestation[],
  actorRoles: ActorRoles,
): ExplainNode {
  const node: ExplainNode = {
    rule,
    satisfied: evaluate(rule, attestations, actorRoles),
  };
  if (!isObject(rule)) return node;
  if ('all_of' in rule) {
    node.children = (rule.all_of as Rule[]).map((r) => explain(r, attestations, actorRoles));
  } else if ('any_of' in rule) {
    node.children = (rule.any_of as Rule[]).map((r) => explain(r, attestations, actorRoles));
  } else if ('n_of' in rule) {
    const branches = (rule.n_of as { of?: Rule[] }).of ?? [];
    node.children = branches.map((r) => explain(r, attestations, actorRoles));
  }
  return node;
}

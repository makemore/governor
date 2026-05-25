"""
Pure-Python evaluator for the Governor rule DSL (spec/schemas/rule.v1.json).

The evaluator operates on plain dicts so it has zero dependency on any
storage layer. Callers translate their own attestation records into the
shape:

    {"actor_id": str, "actor_kind": str}

and pre-compute the actor -> roles mapping:

    {actor_id: {role_slug, ...}}

`evaluate` returns a bool. `explain` returns a recursive structured
reason tree, suitable for serialising into a gate-decision payload.
"""
from __future__ import annotations

from typing import Any, Iterable, Mapping


Attestation = Mapping[str, Any]
ActorRoles = Mapping[str, set]


def _attester_ids(attestations: Iterable[Attestation]) -> set:
    return {str(a['actor_id']) for a in attestations}


def _attester_kinds(attestations: Iterable[Attestation]) -> set:
    return {str(a['actor_kind']) for a in attestations}


def evaluate(
    rule: dict | None,
    attestations: Iterable[Attestation],
    actor_roles: ActorRoles,
) -> bool:
    atts = list(attestations)
    if not isinstance(rule, dict) or not rule:
        return False

    if 'all_of' in rule:
        return all(evaluate(r, atts, actor_roles) for r in rule['all_of'])
    if 'any_of' in rule:
        return any(evaluate(r, atts, actor_roles) for r in rule['any_of'])
    if 'n_of' in rule:
        spec = rule['n_of']
        count = int(spec.get('count', 0))
        branches = spec.get('of', [])
        return sum(1 for r in branches if evaluate(r, atts, actor_roles)) >= count

    if rule.get('actor') is True:
        return len(atts) > 0
    if 'actor_with_role' in rule:
        slug = rule['actor_with_role']
        return any(slug in actor_roles.get(aid, set()) for aid in _attester_ids(atts))
    if 'actor_is' in rule:
        return str(rule['actor_is']) in _attester_ids(atts)
    if 'actor_with_kind' in rule:
        return rule['actor_with_kind'] in _attester_kinds(atts)
    return False


def explain(
    rule: dict | None,
    attestations: Iterable[Attestation],
    actor_roles: ActorRoles,
) -> dict:
    atts = list(attestations)
    node: dict = {'rule': rule, 'satisfied': evaluate(rule, atts, actor_roles)}
    if not isinstance(rule, dict):
        return node
    if 'all_of' in rule:
        node['children'] = [explain(r, atts, actor_roles) for r in rule['all_of']]
    elif 'any_of' in rule:
        node['children'] = [explain(r, atts, actor_roles) for r in rule['any_of']]
    elif 'n_of' in rule:
        node['children'] = [
            explain(r, atts, actor_roles) for r in rule['n_of'].get('of', [])
        ]
    return node

"""
Conformance tests: every implementation of governor-core in every language
must agree on these vectors. The TypeScript suite under governor/core/ts/
loads the same JSON file.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from governor_core.rules import evaluate


VECTORS_PATH = (
    Path(__file__).resolve().parents[3]
    / "spec" / "conformance" / "rules.v1.json"
)


def _load_cases():
    with VECTORS_PATH.open() as fh:
        doc = json.load(fh)
    assert doc["version"] == 1, "unexpected conformance corpus version"
    return doc["cases"]


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
def test_rule_vector(case):
    roles = {actor: set(roles) for actor, roles in case["actor_roles"].items()}
    actual = evaluate(case["rule"], case["attestations"], roles)
    assert actual is case["expected"], (
        f"case {case['id']!r}: rule {case['rule']} on "
        f"{case['attestations']} with roles {case['actor_roles']} "
        f"expected {case['expected']} got {actual}"
    )

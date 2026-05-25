# governor-core (Python)

Pure-Python evaluator for the [Governor rule DSL](../../spec/schemas/rule.v1.json).
Zero runtime dependencies; one module; ~80 lines.

```python
from governor_core.rules import evaluate, explain

rule = {"n_of": {"count": 2, "of": [
    {"actor_with_role": "reviewer"},
    {"actor_with_role": "release-manager"},
    {"actor_with_role": "security-officer"},
]}}

attestations = [
    {"actor_id": "a1", "actor_kind": "human"},
    {"actor_id": "a2", "actor_kind": "human"},
]
actor_roles = {
    "a1": {"reviewer"},
    "a2": {"security-officer"},
}

evaluate(rule, attestations, actor_roles)   # -> True
explain(rule, attestations, actor_roles)    # -> nested {"rule", "satisfied", "children"} tree
```

## Install (dev)

```
pip install -e ./governor/core/python[test]
pytest governor/core/python
```

## Why dicts?

Storage layers are diverse — Django ORM, SQLAlchemy, raw rows, JSON files,
in-memory test fixtures. Translating to a fixed dict shape at the boundary
keeps the evaluator free of any ORM or framework coupling, which is the
whole point of having a core library.

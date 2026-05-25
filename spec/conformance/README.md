# Governor conformance vectors

Language-portable test data that every implementation of `governor-core`
must satisfy. The reference Python and TypeScript implementations both
load these files in their test suites; new ports MUST do the same.

## Format

Each file is a JSON document of the form:

```jsonc
{
  "version": 1,
  "description": "...",
  "cases": [
    {
      "id": "kebab-case-stable-id",
      "rule":          { /* a value valid against schemas/rule.v1.json */ },
      "attestations":  [ { "actor_id": "...", "actor_kind": "..." }, ... ],
      "actor_roles":   { "actor_id": ["role-slug", ...], ... },
      "expected":      true | false
    }
  ]
}
```

`actor_roles` is serialised with arrays (not sets) so it survives the
JSON round-trip; implementations are free to coerce to set-like
structures internally.

## Files

| File | Covers |
|---|---|
| [`rules.v1.json`](./rules.v1.json) | The `evaluate()` contract for the v1 rule DSL |

## Adding a vector

1. Add the case to the appropriate file.
2. Run the Python suite: `pytest governor/core/python`.
3. Run the TypeScript suite: `cd governor/core/ts && npm test`.
4. If either fails, the discrepancy is the bug — fix the implementation,
   not the vector.

## Rules of engagement

- **`id` is a contract.** Never rename. Adding new cases is fine.
- **No implementation-specific behaviour.** If a case relies on iteration
  order, role-set deduplication semantics, or unicode normalisation, it
  belongs in the per-language unit tests, not here.
- **One observable per case.** Each case asserts one `expected` boolean.
  Use `explain()` tests in per-language suites for tree-shape assertions.

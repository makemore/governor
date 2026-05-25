# @governor/core (TypeScript)

Pure-TypeScript evaluator for the [Governor rule DSL](../../spec/schemas/rule.v1.json).
Zero runtime dependencies; one module; mirrors the Python reference at
[`governor/core/python`](../python).

```ts
import { evaluate, explain } from '@governor/core';

const rule = { n_of: { count: 2, of: [
  { actor_with_role: 'reviewer' },
  { actor_with_role: 'release-manager' },
  { actor_with_role: 'security-officer' },
] } };

const attestations = [
  { actor_id: 'a1', actor_kind: 'human' },
  { actor_id: 'a2', actor_kind: 'human' },
];

const roles = {
  a1: ['reviewer'],
  a2: ['security-officer'],
};

evaluate(rule, attestations, roles);  // -> true
explain(rule, attestations, roles);   // -> nested decision tree
```

## Dev

```
cd governor/core/ts
npm install
npm test       # runs the shared conformance vectors
npm run build  # emits dist/
```

## Conformance

Both implementations of `governor-core` (this one and the Python one)
load the same JSON test vectors from
[`governor/spec/conformance/rules.v1.json`](../../spec/conformance/rules.v1.json).
If you add a vector, both suites must pass.

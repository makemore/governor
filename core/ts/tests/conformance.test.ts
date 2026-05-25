import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { evaluate, type Attestation, type Rule } from '../src/rules.js';

interface Case {
  id: string;
  rule: Rule;
  attestations: Attestation[];
  actor_roles: Record<string, string[]>;
  expected: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const VECTORS = resolve(here, '../../../spec/conformance/rules.v1.json');

const doc = JSON.parse(readFileSync(VECTORS, 'utf8')) as {
  version: number;
  cases: Case[];
};

describe('governor-core conformance (rules.v1)', () => {
  expect(doc.version).toBe(1);

  for (const c of doc.cases) {
    it(c.id, () => {
      const roles: Record<string, Set<string>> = {};
      for (const [actor, list] of Object.entries(c.actor_roles)) {
        roles[actor] = new Set(list);
      }
      expect(evaluate(c.rule, c.attestations, roles)).toBe(c.expected);
    });
  }
});

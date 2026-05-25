# Agent handoff: the smallest useful Governor flow

> **Scenario.** An AI agent has drafted a database migration. Before that
> migration runs in production, three other parties must sign off: CI must
> show the test suite green, a human DBA must approve the schema impact, and
> a human release manager must give the final go.
>
> Four signatures, three roles, two species (agent and human, plus a CI
> service). Governor's job is to (a) hold the definition of "what must be
> true before this ships", (b) record who said what, (c) answer
> _ship-or-don't-ship_ on demand.

This example is intentionally smaller than the [release quickstart](../quickstart/).
It exists to teach one idea: **humans and agents sign attestations of the
same shape, and the rule evaluator does not treat them differently.**

## Why this matters

Without Governor, the audit trail for "the agent did a thing and then we
shipped it" is a Slack thread, a PR comment, and someone's memory. Reviews
get implied, sign-offs get assumed, and when something breaks the
post-mortem starts with "who approved this?" and ends with a shrug.

With Governor, the same moment produces a tamper-evident bundle:

- The agent attests, signed with its own token, that it produced the work.
- CI attests, signed with its own token, that the tests passed.
- The DBA attests, signed with their own token, that the schema is safe.
- The release manager attests, signed with their own token, to ship.

The gate decision is computed from those attestations against a checklist
that was pinned _before_ work started. No party can retroactively change
the bar, and no party can attest on behalf of another.

## The checklist

[`checklist.json`](./checklist.json) defines four items:

| Item | Rule | Who can satisfy it |
|---|---|---|
| `author-statement` | `actor_with_kind: agent` | The agent that did the work |
| `tests-green` | `actor_with_role: ci` | The CI service |
| `schema-approved` | human AND `actor_with_role: dba` | A human DBA |
| `release-approved` | human AND `actor_with_role: release-manager` | A human release manager |

Two of those rules require `kind: human` explicitly — they cannot be
satisfied by an agent or a service even if the role matches. That is the
only place in the rule DSL where the human/agent distinction is treated as
material.

## Run it

Prerequisites: a deployed Governor server (follow
[`server/worker/README.md`](../../server/worker/README.md)) and the
bootstrap token it minted.

```
export GOV=https://governor.<your-subdomain>.workers.dev
export BOOTSTRAP="<your bootstrap token>"

./demo.sh
```

Expected shape of output, end to end:

```
1. gate before any attestations         -> deny  (0/4 items satisfied)
2. agent attests author-statement       -> deny  (1/4 items satisfied)
3. agent ALSO attests schema-approved   -> deny  (1/4 items satisfied)
4. ci attests tests-green               -> deny  (2/4 items satisfied)
5. dba attests schema-approved          -> deny  (3/4 items satisfied)
6. release-mgr attests release-approved -> allow (4/4 items satisfied)
7. gate after all attestations          -> allow (4/4 items satisfied)
```

Step 3 is the educational moment. The agent is allowed to record an
attestation against `schema-approved` — Governor never rejects writes from
authenticated actors — but the rule evaluator still keeps the gate at
`deny` because the rule requires `actor_with_kind: human`. Step 5 shows
the same item with two attestations (the agent's _and_ the DBA's); both
are kept, the rule passes off the DBA's, and the audit log preserves the
fact that the agent self-asserted. Authority lives in the rule, not in
who is allowed to type.

## What to read next

- [`demo.sh`](./demo.sh) — the runnable script, ~80 lines, no dependencies
  beyond `curl` and `jq`. Reads top-to-bottom as the story.
- [`checklist.json`](./checklist.json) — the gate definition.
- [`../../spec/schemas/rule.v1.json`](../../spec/schemas/rule.v1.json) —
  the rule DSL these checklists are written in.
- [`../../spec/openapi/governor.v1.yaml`](../../spec/openapi/governor.v1.yaml) —
  the wire format every implementation conforms to.

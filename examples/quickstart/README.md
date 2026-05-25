# Quickstart: a release-readiness checklist

End-to-end walkthrough of Governor against a freshly deployed worker.
Takes ~5 minutes. Assumes you have already deployed the reference server
following [`server/worker/README.md`](../../server/worker/README.md).

The checklist defined in [`release.json`](./release.json) has four items:

| Item | Rule | Satisfied by |
|---|---|---|
| `tests-green`     | `actor_with_role: ci`               | A token whose actor has role `ci` |
| `code-review`     | human AND `actor_with_role: reviewer` | A human actor with role `reviewer` |
| `security-review` | `actor_with_role: security-officer` | An actor with role `security-officer` |
| `two-managers`    | 2-of-3 across release/eng/cto roles | Two distinct attestations |

## 0. Environment

```
export GOV=https://governor.<your-subdomain>.workers.dev
export BOOTSTRAP="<the GOVERNOR_BOOTSTRAP_TOKEN you minted at deploy time>"
```

## 1. Sanity check

```
curl -s $GOV/v1/whoami -H "Authorization: Bearer $BOOTSTRAP" | jq
```

Expect: `{"id":"00000000-…","kind":"service","display_name":"bootstrap","roles":["admin"]}`.

## 2. Create a real admin actor + token, then stop using the bootstrap

```
ADMIN_ID=$(curl -s $GOV/v1/actors \
  -H "Authorization: Bearer $BOOTSTRAP" -H 'content-type: application/json' \
  -d '{"kind":"human","display_name":"Alice (admin)","roles":["admin"]}' \
  | jq -r .id)

ADMIN_TOKEN=$(curl -s $GOV/v1/actors/$ADMIN_ID/tokens \
  -H "Authorization: Bearer $BOOTSTRAP" -X POST | jq -r .token)
echo "ADMIN_TOKEN=$ADMIN_TOKEN     # save this; it cannot be retrieved later"
```

## 3. Create the actors that will perform the sign-offs

```
mkactor () {
  curl -s $GOV/v1/actors \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
    -d "{\"kind\":\"$1\",\"display_name\":\"$2\",\"roles\":$3}" | jq -r .id
}
mktoken () {
  curl -s -X POST $GOV/v1/actors/$1/tokens \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r .token
}

CI_ID=$(mkactor service "github-actions" '["ci"]')
REVIEWER_ID=$(mkactor human "Bob (reviewer)" '["reviewer"]')
SEC_ID=$(mkactor human "Carol (sec)"      '["security-officer"]')
RM_ID=$(mkactor human  "Dan (release-mgr)" '["release-manager"]')
EM_ID=$(mkactor human  "Eve (eng-mgr)"     '["engineering-manager"]')

CI_TOKEN=$(mktoken $CI_ID)
REVIEWER_TOKEN=$(mktoken $REVIEWER_ID)
SEC_TOKEN=$(mktoken $SEC_ID)
RM_TOKEN=$(mktoken $RM_ID)
EM_TOKEN=$(mktoken $EM_ID)
```

## 4. Open a run from the checklist

```
RUN_ID=$(curl -s $GOV/v1/runs \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d @release.json | jq -r .id)
echo "RUN_ID=$RUN_ID"
```

## 5. Check the gate before any attestations — expect `deny`

```
curl -s $GOV/v1/runs/$RUN_ID/gate -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

```json
{ "decision": "deny", "summary": { "items_total": 4, "items_satisfied": 0 }, "items": [ … ] }
```

## 6. Walk the attestations in

```
attest () {
  curl -s $GOV/v1/runs/$RUN_ID/attestations \
    -H "Authorization: Bearer $1" -H 'content-type: application/json' \
    -d "{\"item_key\":\"$2\",\"note\":\"$3\"}" > /dev/null
}

attest $CI_TOKEN       tests-green     "build #482 green"
attest $REVIEWER_TOKEN code-review     "diff LGTM"
attest $SEC_TOKEN      security-review "no new deps; no secret rotations"
attest $RM_TOKEN       two-managers    "ship it"
attest $EM_TOKEN       two-managers    "agreed"
```

## 7. Check the gate again — expect `allow`

```
curl -s $GOV/v1/runs/$RUN_ID/gate -H "Authorization: Bearer $ADMIN_TOKEN" | jq
```

```json
{
  "decision": "allow",
  "summary": { "items_total": 4, "items_satisfied": 4 },
  "items": [
    { "key": "tests-green",     "satisfied": true,  "reason": "rule satisfied" },
    { "key": "code-review",     "satisfied": true,  "reason": "rule satisfied" },
    { "key": "security-review", "satisfied": true,  "reason": "rule satisfied" },
    { "key": "two-managers",    "satisfied": true,  "reason": "rule satisfied" }
  ]
}
```

## What you just did

- Bootstrapped an org from a single root token.
- Created five actors representing CI, a reviewer, security, and two managers.
- Persisted a four-item release checklist as a run.
- Recorded five immutable attestations against it.
- Asked the same evaluator (`@governor/core`) used by every Governor
  implementation whether the run is shippable.

The wire format is documented in
[`spec/openapi/governor.v1.yaml`](../../spec/openapi/governor.v1.yaml).
The rule DSL is documented in
[`spec/schemas/rule.v1.json`](../../spec/schemas/rule.v1.json) with
language-neutral test vectors at
[`spec/conformance/rules.v1.json`](../../spec/conformance/rules.v1.json).

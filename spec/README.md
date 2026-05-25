# Governor protocol

Wire formats and behaviour every Governor implementation must agree on.

## Contents

| File | Status | Description |
|---|---|---|
| [`schemas/rule.v1.json`](./schemas/rule.v1.json) | Draft | The signoff-rule DSL. Combinators (`all_of`, `any_of`, `n_of`) over leaves (`actor`, `actor_with_role`, `actor_with_kind`, `actor_is`) |
| [`schemas/envelope.v1.json`](./schemas/envelope.v1.json) | Draft | The attestation envelope. Intended to align with the [in-toto ITE-6 Statement](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md) format |
| `openapi/governor.v1.yaml` | TODO | OpenAPI 3.1 description of the HTTP surface |
| `conformance/` | TODO | Test vectors any implementation must pass (rule + attestations → decision) |

## Versioning

Each artefact is versioned in its filename (`rule.v1.json`, `rule.v2.json`).
Breaking changes always bump the major version. Implementations declare
which versions they support; the server advertises them on a discovery
endpoint.

## Compatibility intent

The envelope format is being designed to be embeddable inside an in-toto
ITE-6 Statement `predicate` field, so that any Governor attestation can be
notarised on a Sigstore Rekor transparency log without additional
translation. This is a goal, not yet a guarantee — see the schema's
description field for the current state.

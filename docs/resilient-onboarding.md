# Assuring quality in `resilient` with Governor

This guide is for the **resilient** project's agents and engineers. It shows
how to use the Governor instance deployed at **`https://gov.rminds.app`** to
gate high-stakes work (releases, migrations, model deploys) behind
recorded, multi-party sign-off.

If you are an AI agent, run `gov llms` first — it prints a complete,
self-contained description of the tool into your context. This guide assumes
that mental model and focuses on getting `resilient` from zero to a working
quality gate.

## 1. Install the CLI

```sh
curl -fsSL https://raw.githubusercontent.com/makemore/governor/main/install.sh | sh
gov --version
```

The endpoint for this project is fixed:

```sh
export GOVERNOR_BASE_URL=https://gov.rminds.app
```

## 2. One-time bootstrap (admin only)

The first person to set up `resilient` exchanges the server's bootstrap
token for an admin persona. Ask whoever deployed the server for the
`GOVERNOR_BOOTSTRAP_TOKEN` value (it is held in Secret Manager and never
checked in).

```sh
gov bootstrap --base-url https://gov.rminds.app
# paste the bootstrap token when prompted -> saves an "admin" persona
gov whoami            # confirm: kind=human, roles=[admin]
```

Then **rotate the bootstrap token** (delete the secret version) — it can
still mint admins until you do.

## 3. Create the actors that will sign

Decide who/what attests, and give each a token. Each actor signs only as
itself; no one can attest on another's behalf.

```sh
# the CI service that runs your test suite
gov actors create --kind service --name "resilient-ci" --roles ci
gov tokens mint <actor-id> --save-as ci      # store this token in CI secrets

# an AI agent that does implementation work
gov actors create --kind agent --name "resilient-agent" --roles author
gov tokens mint <actor-id> --save-as agent

# human reviewers / release managers authenticate as themselves
gov actors create --kind human --name "Jane (reviewer)" --roles reviewer,release-manager
gov tokens mint <actor-id> --save-as jane
```

Tokens are shown **once**. `--save-as` writes them straight into your local
persona file (`0600`); for CI, copy the token into your secret store and set
`GOVERNOR_BASE_URL` + `GOVERNOR_API_KEY` in the job environment.

## 4. Define your first quality checklist

A checklist is pinned **before** work starts so the bar cannot move later.
Start small. Save this as `resilient-release.json`:

```json
{
  "checklist": {
    "key": "resilient-release-v1",
    "title": "resilient release readiness",
    "items": [
      { "key": "tests-green",
        "description": "CI confirms the suite passes on the candidate commit.",
        "rule": { "actor_with_role": "ci" } },
      { "key": "code-review",
        "description": "A human reviewer has read the diff and approves.",
        "rule": { "all_of": [
          { "actor_with_kind": "human" },
          { "actor_with_role": "reviewer" } ] } },
      { "key": "release-approved",
        "description": "A human release manager gives the final go.",
        "rule": { "all_of": [
          { "actor_with_kind": "human" },
          { "actor_with_role": "release-manager" } ] } }
    ]
  },
  "subject": { "id": "v0.1.0", "kind": "release", "label": "resilient v0.1.0" }
}
```

The two human items use `actor_with_kind: human` — they cannot be satisfied
by the agent or the CI service even if a role matches. That is intentional:
agents and services do work, humans own the go/no-go.

## 5. The flow, per release

```sh
gov runs new ./resilient-release.json          # prints <run-id>; pin it for this release

# CI, from its job, after a green build:
GOVERNOR_PERSONA=ci gov attest <run-id> tests-green -n "build 482 green"

# a human reviewer:
GOVERNOR_PERSONA=jane gov attest <run-id> code-review -n "diff LGTM"

# a human release manager (could be the same person, different role):
GOVERNOR_PERSONA=jane gov attest <run-id> release-approved -n "shipping"

gov gate <run-id>            # exit 0 = allow, exit 1 = deny
```

## 6. Enforce it in CI

`gov gate` is built for shell `&&` chains — branch on the **exit code**, not
the text. Put it in front of the deploy step:

```sh
gov gate "$RUN_ID" --quiet && ./deploy.sh || {
  echo "Governor denied the release; unsatisfied items above." >&2
  gov runs show "$RUN_ID"
  exit 1
}
```

If the gate denies, `gov runs show <run-id>` lists every item and its
attestations so you can see exactly what is still missing.

## Rules of engagement (especially for agents)

1. Never attest to something you did not actually do or verify.
2. You sign as kind `agent`. Items requiring `actor_with_kind: human` are
   not yours to satisfy — route those to a person.
3. Never edit a run's rules to force a gate green; that defeats the tool.
4. Treat `deny` as a hard stop and report what is needed to clear it.

## What to read next

- `gov llms` — the canonical agent reference (run it any time).
- `gov <command> --help` — exact flags for every command.
- `examples/agent-handoff/` in the governor repo — a runnable end-to-end demo.
- `spec/schemas/rule.v1.json` — the full rule DSL these checklists use.

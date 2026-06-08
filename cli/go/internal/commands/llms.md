# Governor — agent context (`gov llms`)

You are an AI agent working in a codebase that uses **Governor** to gate
high-stakes actions behind multi-party sign-off. This document is your
complete working knowledge of the tool. Re-read it whenever you are unsure
how to record or check an approval.

## What Governor is

Governor records who signed off on what, then answers one question on
demand: *is this allowed to proceed — yes or no?* It is an append-only
attestation ledger plus a deterministic rule evaluator. It does **not** run
your tests, deploy your code, or hold secrets. It holds **decisions** and
the evidence behind them.

## Mental model (six nouns)

- **Actor** — a principal that can sign. Has a `kind` (`human`, `agent`, or
  `service`) and zero or more `roles` (e.g. `ci`, `dba`, `release-manager`).
  You, the AI agent, are an actor of kind `agent`.
- **Checklist** — the named set of conditions that must hold. Pinned
  *before* work starts so the bar cannot move retroactively.
- **Item** — one line of a checklist, identified by `key`, governed by a `rule`.
- **Rule** — a declarative expression deciding when an item is satisfied.
- **Run** — a checklist instantiated against a concrete subject (a release,
  a migration, a PR, a model deployment).
- **Attestation** — one actor's signature on one item. Append-only: never
  deleted, never overwritten.
- **Gate** — the pure function `(checklist, attestations) -> allow | deny`.

Authority lives in the **rule**, not in who may call the API. Any
authenticated actor may record an attestation on any item; the gate only
counts the ones the rule accepts. No actor can attest on behalf of another.

## The rule DSL

Leaves:

- `{ "actor": true }` — any attestation from anyone.
- `{ "actor_with_role": "ci" }` — at least one attester holds that role.
- `{ "actor_with_kind": "human" }` — at least one attester is of that kind.
- `{ "actor_is": "<uuid>" }` — only that one specific actor.

Combinators (nest freely):

- `{ "all_of": [ <rule>, ... ] }` — every sub-rule must hold.
- `{ "any_of": [ <rule>, ... ] }` — at least one sub-rule holds.
- `{ "n_of": { "count": 2, "of": [ <rule>, ... ] } }` — at least `count` hold.

Example — "CI is green AND a human DBA approves":

```json
{ "all_of": [
  { "actor_with_role": "ci" },
  { "all_of": [ { "actor_with_kind": "human" }, { "actor_with_role": "dba" } ] }
] }
```

`actor_with_kind: human` is the one place the human/agent distinction is
material: such an item cannot be satisfied by an agent or service even if a
role matches.

## Checklist / run JSON

A run is created from a checklist plus a subject:

```json
{
  "checklist": {
    "key": "release-v1",
    "title": "Release readiness",
    "items": [
      { "key": "tests-green", "rule": { "actor_with_role": "ci" } },
      { "key": "code-review", "rule": { "actor_with_kind": "human" } }
    ]
  },
  "subject": { "id": "v1.2.3", "kind": "release", "label": "v1.2.3" }
}
```

## The CLI (`gov`)

Connection profiles ("personas") are stored in a `0600` TOML file as
`{name, base_url, api_key}` plus, for deployments behind Google Identity-Aware
Proxy (IAP), `{iap_audience, iap_service_account}`. When those are set the CLI
mints a Google OIDC token and sends it in `Authorization` (IAP consumes it),
carrying the Governor bearer in `X-Governor-Authorization`. **You do not handle
IAP tokens yourself** — `gov` does it for every command, including `report`.
Select a persona per command with `-p/--persona` or `$GOVERNOR_PERSONA`;
otherwise the default persona is used.

| Command | Purpose |
|---|---|
| `gov bootstrap` | One-time: exchange a `GOVERNOR_BOOTSTRAP_TOKEN` for an admin persona. |
| `gov whoami` | Show the actor the current persona authenticates as. |
| `gov personas add/list/show/use/remove` | Local profile management (no API calls). |
| `gov actors create --kind --name --roles` | Admin: create a human/agent/service actor. |
| `gov tokens mint <actor-id> [--save-as <name>]` | Admin: mint a bearer token. |
| `gov runs new <file.json>` | Open a run from a checklist file (`-` for stdin). |
| `gov runs list [--search <q>] [--limit N] [--offset N] [--json]` | List/search runs (most recent first) with gate decision and progress; paginated. |
| `gov runs show <run-id>` | Print a run and its attestations as JSON. |
| `gov attest <run-id> <item-key> [flags]` | Append-only signature on one item (see below). |
| `gov human attest [run-id]` | Interactive walkthrough of the items waiting on a human (for people, not you). Omit the id to pick from recent runs; switches to a human persona if the active one isn't. |
| `gov gate <run-id> [-q]` | Evaluate the gate; exit 0 = allow, 1 = deny. |
| `gov report [run-id] [flags]` | Download an md/html/pdf report (see below). |
| `gov llms` | Print this document. |

## Attestations: outcome, evidence, and the fail→pass chain

An attestation is more than a yes. Record it honestly and richly:

- `-o/--outcome` — `pass` (default), `fail`, or `waived`. A `fail` **never**
  satisfies the gate; a `waived` is a deliberate sign-off that does.
- `--severity` — `info`, `low`, `medium`, `high`, or `critical`.
- `-n/--note` — one-line summary. `-d/--detail` — long-form findings, verbatim.
- `-e/--evidence` — structured proof, **repeatable**. A bare URL is shorthand
  for `kind=url`; otherwise pass `key=value` pairs:
  - `-e https://ci.example/run/42`
  - `-e kind=hash,content_hash=sha256:ab…,media_type=application/zip`

Attestations are append-only, so progress is a **chain**: attest `fail` first,
then re-attest `pass` once fixed. Every attestation has a **stable id**, printed
by `gov attest` (`id:`) and shown in `gov runs show`. The same id appears in
every report you export over time, so a `fail` in last week's report and the
`pass` that replaced it are linkable by id — that is the audit trail.

## Reports (`gov report`)

`gov report` downloads a signed, human-readable report using the active persona
— **including its IAP token** — so authenticated deployments need no manual
token minting, redirects, or headless-browser scripting. If a request is
bounced to a sign-in page, `gov` detects it and fails with a clear message
instead of silently saving a login page.

- `gov report <run-id>` — one run. `gov report` (no id) — all recent runs.
- `-f/--format md|html|pdf` (default `pdf`). PDF is rendered locally via
  auto-detected headless Chrome/Chromium (override with `--chrome` or
  `$GOV_CHROME`); if none is found, fetch `-f html` and convert it yourself.
- `--history full|passing` — `full` (default) is the whole append-only chain
  incl. superseded fails with `supersedes` links; `passing` is the clean
  pass/waived-only record.
- `-o/--out <file>` — output path; `-` is stdout (md/html only). Omit it and
  the report is written to its own server-suggested filename.

```sh
gov report <run-id>                      # full-chain audit PDF for one run
gov report <run-id> --history passing    # clean "what was signed off" PDF
gov report -f md <run-id> -o -           # markdown to stdout, for piping
gov report --history passing             # one PDF across all runs
```

## Exit codes

- `0` — success (gate: allow).
- `1` — gate denied, or any other client/server error.
- `2` — reserved (server refused to start, e.g. durability misconfig).

`gov gate` is the command built for CI `&&` chains and step conditionals:
branch on the **exit code**, not on stdout text. `--quiet` prints only the
word `allow` / `deny`.

## Canonical flow

```sh
gov bootstrap                              # bootstrap token -> admin persona
gov whoami                                 # confirm identity + server
gov runs new ./release.json                # open a run; prints <run-id>
gov attest <run-id> code-review -n "diff LGTM"
GOVERNOR_PERSONA=ci gov attest <run-id> tests-green -n "build 482 green"
gov gate <run-id>                          # exit 0 allow / exit 1 deny
gov runs show <run-id>                      # full run + attestations (JSON)
gov report <run-id> --history passing      # clean PDF of what was signed off
```

## Rules of engagement for you, the agent

1. Never record an attestation you cannot truthfully make. Sign only for
   work you actually did or checks you actually ran.
2. You attest as kind `agent`. Items requiring `actor_with_kind: human` are
   not yours to satisfy — route those to a person. Hand them
   `gov human attest` (no id needed — they pick the run from a list): it
   signs as a human persona (offering one if their active persona is an agent)
   and walks them through exactly the items waiting on a human, so your handoff
   is one command instead of a list of hand-written `gov attest` calls.
3. The checklist is pinned before work. Do not edit a run's rules to force a
   gate to pass; that defeats the entire point of the tool.
4. Treat `deny` as a hard stop. Report which items are unsatisfied (from the
   gate table or `gov runs show`) and exactly what is needed to clear them.
5. In scripts, prefer `gov gate --quiet` and branch on the exit code.

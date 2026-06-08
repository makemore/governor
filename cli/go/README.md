# gov

Single-binary command-line client for [Governor](../../). Polished output
courtesy of [Charm](https://charm.sh) (lipgloss / huh); structured exit
codes for CI.

## Install

```sh
# macOS + Linux, prebuilt binary from the latest GitHub Release
curl -fsSL https://raw.githubusercontent.com/makemore/governor/main/install.sh | sh

# or from source (Go 1.22+)
go install github.com/makemore/governor/cli/go/cmd/gov@latest

# or from this checkout
cd governor/cli/go && go build -o gov ./cmd/gov
```

Windows: download the `gov_*_windows_*.zip` from
[Releases](https://github.com/makemore/governor/releases) and put `gov.exe`
on your `%PATH%`. Homebrew is on the roadmap.

## Configure

`gov` stores connection profiles ("personas") in a TOML file:

| Variable | Default | Purpose |
|---|---|---|
| `GOVERNOR_CONFIG` | `$XDG_CONFIG_HOME/governor/config.toml` | Config file path. |
| `GOVERNOR_PERSONA` | (default persona) | Pick a persona for one command. |
| `GOVERNOR_BASE_URL` | — | Override base URL for `bootstrap`. |
| `GOVERNOR_BOOTSTRAP_TOKEN` | — | First-admin token for `bootstrap`. |

The file is written `0600` and stores `{name, base_url, api_key, default}`
entries. The bearer token is never echoed after it's saved.

## Canonical flow

The same six commands used in the top-level README:

```sh
# 1. exchange your bootstrap token for an admin persona
gov bootstrap

# 2. confirm you're talking to the right server as the right actor
gov whoami

# 3. open a run from a checklist file
gov runs new ./release.json

# 4. (anyone) sign off on items they're authorised to
gov attest <run-id> code-review --note "diff LGTM"

# 5. (CI persona) sign off on the items it owns
GOVERNOR_PERSONA=ci gov attest <run-id> tests-green --note "build 482 green"

# 6. gate the run — exit 0 = allow, exit 1 = deny
gov gate <run-id>
```

`gate` is the one command designed for `&&` chains and CI step
conditionals: it prints a framed decision table on stdout and returns a
non-zero exit on deny. Use `--quiet` to suppress the frame and print just
the word `allow` / `deny`.

## Command reference

| Command | What it does |
|---|---|
| `gov bootstrap` | One-shot: take a `GOVERNOR_BOOTSTRAP_TOKEN`, create the first admin actor, mint its token, and save the result as a persona. Idempotent on already-bootstrapped servers (use `--display-name` + `--persona` to script). |
| `gov whoami` | Print the actor behind the current persona. Useful as a connectivity check. |
| `gov personas add / list / show / use / remove` | Local-only profile management. No API calls. `show` redacts the bearer token. |
| `gov actors create --kind --name --roles` | Admin-only. Creates a human/agent/service actor. Returns the new UUID. |
| `gov tokens mint <actor-id> [--save-as <name>]` | Admin-only. Mints a bearer token. Printed once unless `--save-as` stashes it directly into a persona. |
| `gov runs new <file.json>` | Open a run from a checklist JSON file (`-` for stdin). `--subject`, `--subject-kind`, `--subject-label` fill in fields the file omits. |
| `gov runs list [flags]` | List/search runs (most recent first) with gate decision and item progress. `--search/-q` matches subject id/label and checklist title; `--limit`/`--offset` page; `--json` prints the raw response. |
| `gov runs show <run-id>` | Print a run + its attestations as JSON. |
| `gov attest <run-id> <item-key> [--note]` | Append-only signature on a single item, by the current persona's actor. |
| `gov human attest [run-id]` | Interactive sign-off for people: omit the id to pick from recent runs, signs as a human persona (offering one if the active persona is an agent/service), lists the items still waiting on a human, and prompts for outcome/note/evidence per item — no hand-written `attest` commands. `--all` includes every unsatisfied item. |
| `gov gate <run-id> [--quiet]` | Evaluate the gate. Exit 0 on allow, exit 1 on deny. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (gate: allow). |
| `1` | Gate denied, or any other client-side / server-side error. |
| `2` | Reserved for "configuration refused to start" (durability, etc.) — currently unused by the CLI itself; the server uses it. |

## Example checklist

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

The rule DSL is defined in [`spec/schemas/rule.v1.json`](../../spec/schemas/rule.v1.json).
Primitives: `actor_with_role`, `actor_with_kind`, `actor_is`, `actor: true`.
Combinators: `all_of`, `any_of`, `n_of`. Nest freely.

## Development

```sh
go build -o gov ./cmd/gov
go test ./...                # currently smoke-tested manually against
                             # governor/server/node — see top-level README.
```

The CLI imports nothing from outside `governor/cli/go/`. The only network
dependency is the Governor HTTP API itself.

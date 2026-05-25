# Examples

Runnable walkthroughs against a deployed Governor server. Each is
self-contained, written against the public HTTP API, and assumes only
`curl` and `jq` on the host. They are also the closest thing the project
has to user-facing documentation while the spec is still settling.

| Example | What it teaches | Approx. time |
|---|---|---|
| [`quickstart/`](./quickstart) | The full surface area: actors, tokens, runs, attestations, gate. Four-item release checklist with `all_of`, `actor_with_role`, and `n_of` rules. Read this if you want to know what every endpoint does. | ~5 min |
| [`agent-handoff/`](./agent-handoff) | The single core idea: humans and agents sign attestations of the same shape, and the rule decides what counts. One concrete scenario (agent drafts a migration, humans and CI co-sign), one runnable script, with an explicit demonstration that an agent self-attesting against a human-only rule is recorded but does not pass the gate. Read this first if you want to know _why_ Governor exists. | ~3 min |

Both examples expect:

```
export GOV=https://governor.<your-subdomain>.workers.dev
export BOOTSTRAP="<bootstrap token printed at deploy time>"
```

and a server deployed per [`../server/worker/README.md`](../server/worker/README.md).

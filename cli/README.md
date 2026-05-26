# governor CLI

Command-line clients for the Governor API. Both clients (when present)
speak the same HTTP API and are exercised by the same conformance suite.

| Directory | Status | Description |
|---|---|---|
| [`go/`](./go) | ✅ Working | Single-binary CLI (`gov`) built on Cobra + Charm. Primary user-facing client. Installable today with `go install`; Homebrew / `curl \| sh` packaging on the roadmap. |
| `python/` | Deferred | The existing prototype lives at `governor-mcp/src/governor_mcp/cli.py`. It will only be ported here if there's demand the Go CLI can't cover. |

## Quick start

```sh
go install github.com/makemore/governor/cli/go/cmd/gov@latest
gov bootstrap   # exchanges your bootstrap token for an admin persona
gov whoami
```

See [`go/README.md`](./go/README.md) for the full command reference and
the canonical end-to-end flow.

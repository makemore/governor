# governor CLI

Command-line clients for the Governor API.

| Directory | Status | Description |
|---|---|---|
| `python/` | Planned | The existing `gov` CLI (currently under `governor-mcp/`) will be renamed and moved here. Useful for admin tasks and the interactive human-mode TUI |
| `go/` | Planned | Distributable single-binary CLI built on Bubble Tea + Lipgloss. Intended to become the primary user-facing client (Homebrew, apt, scoop, `curl \| sh`) |

The Go and Python CLIs will both be conformant against the same HTTP API
and the same conformance suite.

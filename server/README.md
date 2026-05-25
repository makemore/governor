# governor-server

Reference HTTP server implementations of the Governor protocol.

| Directory | Status | Description |
|---|---|---|
| `python/` | Planned | Django + DRF reference implementation, to be migrated from the existing `backend/governor/` tree in the parent repository |
| `go/` | Possible future | Not yet scoped |

The server is responsible for: storing attestations append-only, evaluating
rules via [`governor-core`](../core), authenticating actors, and serving the
[HTTP API defined in the spec](../spec).

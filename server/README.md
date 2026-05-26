# governor-server

Reference HTTP server implementations of the Governor protocol. Both
servers implement the same [OpenAPI contract](../spec/openapi/governor.v1.yaml)
and share the same SQL schema.

| Directory | Runtime | Storage | Best for |
|---|---|---|---|
| [`worker/`](./worker) | Cloudflare Workers | Cloudflare D1 | Zero-ops serverless; free tier covers most teams |
| [`node/`](./node)     | Node 20 + Docker  | SQLite on a persistent volume | Self-hosting, Render, Fly, Railway, your own VM |

A server is responsible for: storing attestations append-only, evaluating
rules via [`@governor/core`](../core/ts), authenticating actors, and serving
the [HTTP API defined in the spec](../spec).

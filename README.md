# Governor

An append-only, multi-party attestation log with a rule evaluator over it.
Designed to be embedded, self-hosted, or consumed as a hosted service.

> **Status: pre-release.** The spec is being drafted; the reference
> implementation is being extracted from an existing project. Wire formats
> and APIs may change without notice until `v0.1.0`.

## Layout

| Path | Role |
|---|---|
| [`spec/`](./spec) | The Governor protocol — wire formats, rule DSL, HTTP API, conformance suite |
| [`core/`](./core) | Pure, embeddable implementations of the rule evaluator |
| [`server/`](./server) | Reference HTTP server implementations |
| [`cli/`](./cli) | Command-line clients |
| [`mcp/`](./mcp) | Model Context Protocol surface for AI agents |
| [`sdks/`](./sdks) | Client libraries |

Each language gets its own subdirectory inside these folders — for example
`core/python/`, `cli/python/`, and later `core/go/`, `cli/go/`.

## Design principles

1. **Spec first.** Wire formats are versioned and language-neutral. The
   reference implementation must pass its own conformance suite.
2. **Append-only by default.** Attestations cannot be modified or deleted
   once written. This is enforced at the API, model, and database layers.
3. **No vendor lock-in.** Storage, identity, and notification sinks are
   pluggable. The protocol is portable across implementations.
4. **Human and machine actors are symmetric.** A signed claim is a signed
   claim regardless of who made it. The rule DSL treats them uniformly.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).

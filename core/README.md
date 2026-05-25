# governor-core

Pure, embeddable implementations of the Governor rule evaluator.

Each language has its own subdirectory; all implementations conform to the
[shared spec](../spec) and must pass the conformance suite.

| Directory | Status |
|---|---|
| [`python/`](./python) | Reference implementation. Zero runtime dependencies |
| `go/` | Planned |

The core libraries are deliberately small: they evaluate rules against
attestations and explain the result. They do not handle storage,
authentication, transport, or persistence. Hosts are expected to translate
their own records into the small data shapes the evaluator accepts.

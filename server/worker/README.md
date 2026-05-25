# @governor/worker

Reference Governor server on Cloudflare Workers + D1. Implements the
[OpenAPI contract](../../spec/openapi/governor.v1.yaml) using the pure
rule evaluator from [`@governor/core`](../../core/ts).

About 400 lines of TypeScript end-to-end.

## Deploy your own (5 minutes, free)

Prereqs: Node 18+, a free Cloudflare account.

```
cd governor/server/worker
npm install

# Create a D1 database. Copy the database_id it prints into wrangler.toml.
npx wrangler login
npm run db:create

# Apply the schema.
npm run db:migrate:remote

# Mint a long random bootstrap token and store it as a secret.
# Treat this token as root: anyone who has it can create admin actors.
openssl rand -hex 32 | npx wrangler secret put GOVERNOR_BOOTSTRAP_TOKEN

# Ship it.
npm run deploy
```

The worker is now live at `https://governor.<your-subdomain>.workers.dev`.

## Local dev

```
npm run dev                     # wrangler dev with a SQLite-backed local D1
npm run db:migrate:local        # apply migrations to the local D1 shadow
```

## Endpoints

See `governor/spec/openapi/governor.v1.yaml` for the formal contract.

| Verb | Path | Auth |
|---|---|---|
| GET  | `/v1/whoami` | any token |
| POST | `/v1/actors` | admin |
| POST | `/v1/actors/{id}/tokens` | admin or self |
| POST | `/v1/runs` | any token |
| GET  | `/v1/runs/{id}` | any token |
| POST | `/v1/runs/{id}/attestations` | any token (acts as the bearer's actor) |
| GET  | `/v1/runs/{id}/gate` | any token |

## Auth model

- `GOVERNOR_BOOTSTRAP_TOKEN` (set via `wrangler secret put`) authenticates
  as a synthetic actor with the `admin` role. Use it once to create your
  first real admin actor and mint that actor's first token, then rotate
  or revoke the bootstrap by deleting the secret.
- All other tokens are opaque strings of the form `gv_<40 hex>`. The
  server only stores their SHA-256 hash; the plaintext is returned once
  by `POST /v1/actors/{id}/tokens` and cannot be retrieved again.

## Scope deliberately omitted from v1

- Pagination on lists (no list endpoints yet)
- Webhooks / outbound notifications
- Multi-tenant org separation (one worker = one org)
- Token rotation / scopes / TTLs (use revoke + mint)
- Audit log read API (attestations themselves are the audit log)

These are explicit non-goals for the "deployable in 5 minutes" reference.
A production deployment would layer them on.

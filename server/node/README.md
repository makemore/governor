# governor-server (Node)

Portable Governor reference server: **Node 20 + Hono + SQLite**, distributed
as a Docker image. Mirrors the [Cloudflare Workers reference](../worker)
route-for-route against the same OpenAPI contract and the same SQL schema.

Use this server when you want to self-host, deploy to a generic container
platform (Render, Fly, Railway, your own VM), or avoid taking a dependency
on any specific vendor.

## Persistence — three tiers, one default-refuse

Governor stores an attestation log. Losing it silently is the worst possible
failure mode, so the server **refuses to start** unless you've made a
durability choice explicitly.

| Tier | What it is | Survives | Doesn't survive | How to enable |
|---|---|---|---|---|
| **1. Replicated** (recommended) | SQLite on local disk + Litestream streaming the WAL to an S3-compatible bucket. The official Docker image ships Litestream. | Container restarts, redeploys, full host loss, region rebuild. | Bucket deletion. | Set `GOVERNOR_REPLICATION_URL` + `LITESTREAM_*` creds (see below). |
| **2. Single-host** | SQLite on a mounted persistent volume, no off-host copy. | Container restarts, redeploys. | Disk failure, host failure, accidental volume deletion. | `GOVERNOR_ALLOW_SINGLE_HOST=true` (explicit). |
| **3. Ephemeral** | SQLite inside the container's writable layer. | Nothing. | Every restart wipes the DB. | `GOVERNOR_ALLOW_EPHEMERAL=true` (dev / CI only). |

Tier 2 and 3 print a multi-line banner at boot so you can't pretend you
didn't know. Without one of the three env signals the server exits with
code 2 and a long explanation pointing back here.

### Tier 1 setup, step by step (Backblaze B2)

B2 is the cheapest S3-compatible store as of 2026 and works identically
to S3 / Cloudflare R2 / MinIO / Wasabi — only the endpoint URL changes.

1. **Create a private bucket.** Backblaze console → Buckets → Create
   Bucket. Name it something like `governor-prod-<your-name>`. Type:
   **Private**. Default encryption: Enable (SSE-B2 is free).
2. **Create an application key scoped to that bucket.** Application Keys
   → Add a New Application Key. Allow access to the bucket you just made;
   permissions: **Read and Write**. Save the `keyID` and `applicationKey`
   it shows you — the key is shown only once.
3. **Note your endpoint.** It looks like
   `https://s3.<region>.backblazeb2.com` (the bucket details page shows
   the exact URL). The region (e.g. `us-west-002`) is in that URL too.
4. **Pass these to the container:**

   ```env
   GOVERNOR_REPLICATION_URL=s3://governor-prod-<your-name>/governor
   LITESTREAM_ACCESS_KEY_ID=<keyID>
   LITESTREAM_SECRET_ACCESS_KEY=<applicationKey>
   LITESTREAM_S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
   LITESTREAM_S3_REGION=us-west-002
   LITESTREAM_S3_FORCE_PATH_STYLE=true
   ```

5. **Boot.** The entrypoint will run `litestream restore -if-replica-exists`
   first (a no-op on the very first boot when the bucket is empty), then
   exec the Node server under `litestream replicate`, which streams every
   WAL frame to the bucket in the background.

   On disaster recovery (the box is gone), just start a fresh container
   with the same env vars pointing at the same bucket. The entrypoint
   restores the DB from the replica before the server opens it.

For **Cloudflare R2** the endpoint is
`https://<account_id>.r2.cloudflarestorage.com` and region is `auto`. For
**AWS S3** drop `LITESTREAM_S3_ENDPOINT` entirely and set
`LITESTREAM_S3_REGION` to your bucket's region.

> Aside: on Fly.io specifically, **LiteFS** is an alternative that gives
> you SQLite read-replicas across regions. It's a bigger commitment
> (separate process, FUSE mount, distinct failure modes) and is Fly-only,
> so the official image doesn't bundle it. If you outgrow Litestream,
> the Fly docs are the right place to start.

## Environment

| Var | Required | Default | Notes |
|---|---|---|---|
| `GOVERNOR_BOOTSTRAP_TOKEN` | yes (to bootstrap) | — | First-admin token. Generate with `openssl rand -hex 32`. |
| `GOVERNOR_DB_PATH` | no | `/data/governor.sqlite` | Must be on a persistent volume (Tier 1 or 2). |
| `PORT` | no | `8080` | HTTP listen port. |
| `GOVERNOR_VERSION` | no | `dev` | Surfaced at `/`. |
| **Durability** | | | |
| `GOVERNOR_REPLICATION_URL` | Tier 1 | — | `s3://bucket/prefix` for S3-compatible stores, or `gcs://bucket/prefix` for Google Cloud Storage. Enables Litestream in the official image. |
| `LITESTREAM_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Tier 1 (S3 only) | — | Required when `GOVERNOR_REPLICATION_URL` uses `s3://`. Not used for `gcs://` — see GCP section below. |
| `LITESTREAM_S3_ENDPOINT` | sometimes | — | Set for R2 / B2 / MinIO / Wasabi; omit for AWS S3. Ignored for `gcs://`. |
| `LITESTREAM_S3_REGION` | sometimes | — | Required for AWS S3; usually required for B2; `auto` for R2. Ignored for `gcs://`. |
| `LITESTREAM_S3_FORCE_PATH_STYLE` | sometimes | — | `true` for B2 / MinIO. Ignored for `gcs://`. |
| `GOVERNOR_ALLOW_SINGLE_HOST` | Tier 2 | `false` | Acknowledge running without off-host replication. |
| `GOVERNOR_ALLOW_EPHEMERAL` | Tier 3 | `false` | Acknowledge running on non-persistent storage (dev only). |
| **Public read-only view** | | | |
| `GOVERNOR_PUBLIC_ENABLED` | no | `false` | Set `true` to enable the read-only public view at `/`. |
| `GOVERNOR_BRAND_NAME` / `_ACCENT` / `_LOGO_URL` | no | — | Public view branding. |
| `GOVERNOR_PUBLIC_TITLE` / `_TAGLINE` | no | — | Public view copy. |
| `GOVERNOR_PUBLIC_HIDE_ACTOR_NAMES` | no | `false` | Public view shows role only when `true`. |
| `GOVERNOR_PUBLIC_HIDE_NOTES` | no | `false` | Public view suppresses notes when `true`. |

## Local: Docker Compose

```bash
cd governor/server/node
cp .env.example .env
# At minimum set GOVERNOR_BOOTSTRAP_TOKEN.
# Then either:
#   (Tier 1) fill in GOVERNOR_REPLICATION_URL + LITESTREAM_* creds, or
#   (Tier 2) uncomment GOVERNOR_ALLOW_SINGLE_HOST=true to accept the risk.
docker compose up --build
```

The server listens on `http://localhost:8080`. Data lives in the named
volume `governor-data` (survives `docker compose down`; nuked by
`docker compose down -v`).

## Local: bare Node (dev)

```bash
cd governor/server/node
npm install
GOVERNOR_DB_PATH=./data/governor.sqlite \
GOVERNOR_BOOTSTRAP_TOKEN=$(openssl rand -hex 32) \
GOVERNOR_ALLOW_EPHEMERAL=true \
  npm run dev
```

`GOVERNOR_ALLOW_EPHEMERAL=true` is the dev escape hatch; the relative
path lives inside the repo and isn't meant to survive anything.

## Render

A `render.yaml` blueprint lives at the repo root. Click the deploy button
in the top-level `README.md`. Render will build the Dockerfile, attach a
1 GB disk at `/data`, generate `GOVERNOR_BOOTSTRAP_TOKEN`, and **prompt
you for the five Litestream secrets** before the first deploy completes:

- `GOVERNOR_REPLICATION_URL`
- `LITESTREAM_ACCESS_KEY_ID`
- `LITESTREAM_SECRET_ACCESS_KEY`
- `LITESTREAM_S3_ENDPOINT`
- `LITESTREAM_S3_REGION`

Until those are filled in the container will exit on boot. That is
deliberate — Render disks are single-host.

## Fly.io

A `fly.toml` lives at the repo root.

```bash
flyctl launch --no-deploy --copy-config --name <your-app>
flyctl volumes create governor_data --size 1 --region lhr
flyctl secrets set \
  GOVERNOR_BOOTSTRAP_TOKEN=$(openssl rand -hex 32) \
  GOVERNOR_REPLICATION_URL=s3://your-bucket/governor \
  LITESTREAM_ACCESS_KEY_ID=... \
  LITESTREAM_SECRET_ACCESS_KEY=... \
  LITESTREAM_S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com \
  LITESTREAM_S3_REGION=us-west-002
flyctl deploy
```

## Google Cloud Run

A Terraform module + Cloud Build pipeline lives at
[`deploy/gcp/`](../../deploy/gcp/). It provisions Cloud Run, an Artifact
Registry repo, a GCS bucket for Litestream, a Secret Manager secret for
the bootstrap token, and a dedicated runtime service account — then
hands image rollouts off to Cloud Build so day-2 deploys don't need
`terraform apply`.

Two GCP-specific notes:

- **Auth is ADC, not HMAC.** When `GOVERNOR_REPLICATION_URL` starts with
  `gcs://`, the entrypoint skips the `LITESTREAM_ACCESS_KEY_ID` /
  `_SECRET_ACCESS_KEY` check and Litestream picks up Application Default
  Credentials from the Cloud Run metadata server. No long-lived keys.
- **Single instance pinned.** The Terraform sets `min=max=1` and
  always-allocated CPU. SQLite is single-writer; multiple Cloud Run
  instances would each get their own ephemeral disk and corrupt the
  shared replica bucket. See `deploy/gcp/README.md` for the rationale
  and the exact `gcloud` flags if you'd rather skip Terraform.

## DigitalOcean App Platform

A `.do/deploy.template.yaml` lives at the repo root. The deploy button
in the top-level [`README.md`](../../README.md) drops you straight into
App Platform's "Create from template" flow; DO will prompt for every
SECRET-typed env var (bootstrap token + four Litestream values) before
the first deploy completes. App Platform services have ephemeral disks,
which is intentional here: Litestream restores SQLite from your bucket
on every cold start, so the platform doesn't need to provide durability.

## Koyeb

The Koyeb button URL is pre-configured with the Dockerfile path and
HTTP port; you still need to add the bootstrap token and Litestream
secrets in the "Environment variables" panel before clicking Deploy.
Same model as DO: ephemeral disk, Litestream handles persistence.

## Railway

Railway's deploy buttons require a one-time template publication through
their web UI, so this repo doesn't ship one. The flow is:

1. In the Railway dashboard, **New Project → Deploy from GitHub repo**
   and select the published `governor` mirror.
2. **Service settings → Build → Dockerfile path:**
   `server/node/Dockerfile`.
3. **Variables:** add `GOVERNOR_BOOTSTRAP_TOKEN`,
   `GOVERNOR_REPLICATION_URL`, and the four `LITESTREAM_*` values.
4. Deploy.

## Any container host

Point the platform at this directory's `Dockerfile`, set the build context
to the repo root (the published `governor` repo, not the monorepo), and:

1. Provide `GOVERNOR_BOOTSTRAP_TOKEN` as a secret env var.
2. Provide `GOVERNOR_REPLICATION_URL` + `LITESTREAM_*` credentials.
   (Optional: attach a persistent volume at `/data`. With Litestream
   active the volume is belt-and-braces, not strictly necessary.)
3. Expose port `8080`.

If you knowingly accept that a host failure loses every attestation,
`GOVERNOR_ALLOW_SINGLE_HOST=true` is the explicit escape hatch — but
then the container *must* have a persistent volume at `/data`.

## First requests

```bash
TOKEN=...                # your GOVERNOR_BOOTSTRAP_TOKEN
HOST=http://localhost:8080

# Confirm auth works.
curl -s -H "authorization: Bearer $TOKEN" $HOST/v1/whoami

# Mint a real actor + token; from here, stop using the bootstrap token.
curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"human","display_name":"Alice","roles":["releases:approver"]}' \
  $HOST/v1/actors
```

See the [OpenAPI spec](../../spec/openapi/governor.v1.yaml) for the full
surface; the [examples directory](../../examples) has runnable walkthroughs.

## Differences from the Workers reference

There are none at the protocol level — the OpenAPI contract is identical
and the SQL schema is copied verbatim from `worker/migrations/`. The only
divergences are runtime concerns:

- `better-sqlite3` is synchronous; the worker uses async D1.
- The Node server runs migrations on boot (D1 is migrated out-of-band via
  `wrangler d1 migrations apply`).
- Bootstrap-token and brand config come from `process.env` rather than the
  Worker's `c.env` bindings.

If you change the schema, update [`migrations/0001_init.sql`](./migrations/0001_init.sql)
*and* the matching file under `../worker/migrations/`. Both must stay in sync.

# Governor on Google Cloud

A reproducible deployment of the Governor Node reference server to GCP:
**Cloud Run** for compute, **Cloud Storage** for Litestream replication,
**Secret Manager** for the bootstrap token, **Artifact Registry** for the
image, **Cloud Build** for CI.

The Terraform module here creates the infrastructure; the Cloud Build
pipeline builds and rolls out new revisions. Image rollouts are
deliberately out-of-band so day-2 deploys don't need a `terraform apply`.

## Architecture, at a glance

```
GitHub push ──▶ Cloud Build ──▶ Artifact Registry ──▶ Cloud Run (1 instance)
                                                              │
                                                              ▼ (Litestream, ADC auth)
                                                       GCS bucket (versioned)
                                                              │
                                                              ▼ on cold start
                                                       litestream restore
```

### Why max-instances = 1

The Node server uses `better-sqlite3` against a local SQLite file at
`/data/governor.sqlite`. SQLite is single-writer; two Cloud Run instances
would each open their own ephemeral `/data` and fight over the same
Litestream replica path. The Terraform pins `min=max=1` and you should
not relax it without first moving the storage layer onto Cloud SQL or
similar — see `governor/server/node/src/storage.ts`.

### Why CPU always allocated (`cpu_idle = false`)

Litestream's WAL-ship loop runs in a background goroutine. Without
always-allocated CPU it would only run during request handling, so any
writes received just before an idle period would sit unreplicated until
the next request arrived. The trade-off is a small constant cost (one
CPU billed continuously) for a much tighter durability window.

## One-time setup

You'll need: a GCP project, billing enabled, `gcloud` and `terraform`
installed locally, and `Owner` (or a curated set of admin roles) on the
project for the first apply.

```sh
cd governor/deploy/gcp/terraform
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                # set project_id, region
terraform init
terraform apply
```

The first apply creates the Artifact Registry repo, the GCS replica
bucket, the runtime service account, the Secret Manager secret, and the
Cloud Run service running the placeholder `gcr.io/cloudrun/hello` image.
The service will start but won't serve Governor until you push a real
image (next step). That's intentional: it lets Terraform own infra and
Cloud Build own image rollouts without them stepping on each other.

### Mint the bootstrap token

Secret values never go through Terraform state. Add the first version
of the secret directly:

```sh
openssl rand -hex 32 \
  | gcloud secrets versions add governor-bootstrap-token \
      --project=$PROJECT_ID --data-file=-
```

Hold on to the value you generated — it's the only way to mint the
first actor. Once you've used it to call `POST /v1/actors`, treat the
secret as cold storage.

### Build and deploy the first real image

```sh
gcloud builds submit governor \
  --project=$PROJECT_ID \
  --config=governor/deploy/gcp/cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_SERVICE=governor,_REPO=governor
```

The build runs three steps: `docker build`, `docker push`, and
`gcloud run deploy <service> --image=...`. The Cloud Run service shape
(scaling, env, secrets, SA) is *not* touched — only the live image tag.

### Day 2: hook up GitHub

In the Cloud Console: **Cloud Build → Triggers → Create trigger**.
Connect the GitHub repo, point at `governor/deploy/gcp/cloudbuild.yaml`,
filter included files to `governor/**`. Every push to `main` rolls a
new revision; rollback is `gcloud run services update-traffic`.

## Verifying durability

After the first request that writes (e.g. creating an actor), check the
replica bucket has WAL frames showing up within a couple of seconds:

```sh
gsutil ls -r gs://$PROJECT_ID-governor-replica/governor/
```

To simulate a full disaster recovery (instance gone, ephemeral disk
gone), delete the Cloud Run revision and roll a new one — the
container's entrypoint runs `litestream restore -if-replica-exists
-if-db-not-exists` before opening the DB. Worst-case data loss is the
last unflushed WAL frame (sub-second under normal load).

## Identity-Aware Proxy (optional)

You can put Google sign-in in front of the Cloud Run URL with no load
balancer required: Cloud Run has native IAP integration (GA April 2025).
This is the simplest way to keep the service private to your Workspace
domain or a specific group of users without writing any auth code.

### Prerequisite: OAuth consent screen

IAP authenticates against a project-level OAuth consent screen. Google
turned down the OAuth Admin APIs in March 2026, so this is a console-only
one-time step:

1. Open **APIs & Services → OAuth consent screen** in the Cloud Console.
2. If the project lives inside a Google Workspace organization, choose
   **Internal** user type — IAP will then auto-restrict to your domain
   and no Google verification is required.
3. Set the app name and a support email; you can skip scopes and test
   users entirely for IAP-only usage.

### Enable IAP via Terraform

Find your project number (not the project ID) and add the IAP block to
`terraform.tfvars`:

```sh
gcloud projects describe $PROJECT_ID --format='value(projectNumber)'
```

```hcl
project_number = "123456789012"
iap_enabled    = true
iap_members    = ["user:you@example.com"]   # or group:eng@example.com, domain:example.com
```

Then `terraform apply`. The module enables the IAP API, flips
`iap_enabled` on the Cloud Run service, grants `roles/run.invoker` to
the IAP service agent, and grants `roles/iap.httpsResourceAccessor` to
each listed member.

> **Heads-up on the project_number vs project_id quirk:** the underlying
> `google_iap_web_cloud_run_service_iam_member` resource silently no-ops
> when given a project ID instead of the numeric project number
> ([hashicorp/terraform-provider-google#23092][iap-bug]). The module
> guards against this with a precondition.

[iap-bug]: https://github.com/hashicorp/terraform-provider-google/issues/23092

### Verify

```sh
# Unauthenticated request: should be a 302 to accounts.google.com.
curl -sI "$(terraform output -raw service_url)" | head -5

# Authenticated via your own identity token: should be 200 (API key still
# required for the actual Governor endpoints, this just proves IAP let
# you through).
curl -sI -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  "$(terraform output -raw service_url)/healthz"
```

In a browser, opening the service URL should redirect through the
Google sign-in flow and land on the Governor UI.

## Cost shape (rough)

- **Cloud Run** ~ $10–15/month for one always-on CPU + 512 Mi
- **GCS** ~ pennies/month at attestation-log volumes (versioned storage)
- **Artifact Registry** ~ free for one image's worth of layers
- **Secret Manager** ~ free at this volume
- **Cloud Build** ~ first 120 build-minutes/day free

The dominant line item is Cloud Run's always-allocated CPU. If you're
willing to accept a wider durability window, set `cpu_idle = true` in
the Terraform and drop `min_instance_count` to 0 — but read the
trade-offs in `governor/server/node/README.md` first.

## What's deliberately not here

- **Cloud SQL.** The storage layer is SQLite; switching to Postgres is
  an engineering project, not a deploy choice. If you need multi-writer
  or multi-region active-active, that's the door.
- **Cloud Load Balancing / Cloud Armor.** Useful in front of a
  production service but orthogonal to the Governor app itself. Add
  them per your org's perimeter policy. (For lightweight access control,
  IAP — covered above — is usually enough on its own.)
- **Remote tfstate backend.** Defaults to local state; flip to a GCS
  backend when more than one operator manages the deployment.

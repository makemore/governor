#!/bin/sh
#
# Governor container entrypoint.
#
# Three durability tiers, decided by env:
#
#   replicated   GOVERNOR_REPLICATION_URL is set.
#                We run Litestream: restore from the replica on boot
#                (in case the local disk is fresh), then replicate
#                the WAL continuously while node serves.
#
#   single-host  No replication URL. We exec node directly. The node
#                process itself decides whether to start, based on
#                GOVERNOR_ALLOW_SINGLE_HOST / GOVERNOR_ALLOW_EPHEMERAL.
#                See src/storage.ts:assertDurability.
#
# We deliberately do NOT duplicate the refusal logic here: the node
# process is the single source of truth so bare-node invocations and
# containerised ones behave identically.

set -eu

DB_PATH="${GOVERNOR_DB_PATH:-/data/governor.sqlite}"

if [ -z "${GOVERNOR_REPLICATION_URL:-}" ]; then
  # Tier 2 or 3: hand straight to node. It will refuse to start unless
  # the operator has set GOVERNOR_ALLOW_SINGLE_HOST or _ALLOW_EPHEMERAL.
  exec node dist/server.js
fi

# Tier 1: Litestream-wrapped. Credentials are required.
if [ -z "${LITESTREAM_ACCESS_KEY_ID:-}" ] || [ -z "${LITESTREAM_SECRET_ACCESS_KEY:-}" ]; then
  echo "========================================================================"
  echo "  REFUSING TO START: GOVERNOR_REPLICATION_URL is set but credentials"
  echo "  are missing. Set both LITESTREAM_ACCESS_KEY_ID and"
  echo "  LITESTREAM_SECRET_ACCESS_KEY (or remove GOVERNOR_REPLICATION_URL"
  echo "  to fall back to single-host mode)."
  echo "========================================================================"
  exit 2
fi

CONFIG=/tmp/litestream.yml
{
  echo "dbs:"
  echo "  - path: ${DB_PATH}"
  echo "    replicas:"
  echo "      - url: ${GOVERNOR_REPLICATION_URL}"
  # Optional knobs for non-AWS S3-compatible providers (R2, B2, MinIO, ...).
  if [ -n "${LITESTREAM_S3_ENDPOINT:-}" ]; then
    echo "        endpoint: ${LITESTREAM_S3_ENDPOINT}"
  fi
  if [ -n "${LITESTREAM_S3_REGION:-}" ]; then
    echo "        region: ${LITESTREAM_S3_REGION}"
  fi
  if [ -n "${LITESTREAM_S3_FORCE_PATH_STYLE:-}" ]; then
    echo "        force-path-style: ${LITESTREAM_S3_FORCE_PATH_STYLE}"
  fi
} > "$CONFIG"

# Restore the DB from the remote replica only if there is no local copy
# AND a replica exists. Safe to run on every boot.
echo "governor: checking replica at ${GOVERNOR_REPLICATION_URL} ..."
litestream restore -if-replica-exists -if-db-not-exists -config "$CONFIG" "$DB_PATH" || {
  echo "governor: litestream restore failed; aborting"
  exit 2
}

# Replicate continuously while node runs. -exec wires signals through
# and exits when node exits.
echo "governor: starting node under litestream replicate -exec"
exec litestream replicate -config "$CONFIG" -exec "node dist/server.js"

#!/usr/bin/env bash
# Agent handoff demo. Walks one migration from "agent has drafted" to
# "release manager has approved" with a single human-readable trace.
#
# Prerequisites: GOV and BOOTSTRAP env vars; curl and jq on PATH.
# Idempotent only within a single run: each invocation creates fresh
# actors, tokens, and a fresh run.

set -euo pipefail

: "${GOV:?set GOV to your governor base URL, e.g. https://governor.example.workers.dev}"
: "${BOOTSTRAP:?set BOOTSTRAP to the bootstrap token printed at deploy time}"

here="$(cd "$(dirname "$0")" && pwd)"

# --- tiny wrapper so the rest of the script reads like a story --------------

gov () {                                       # gov METHOD PATH TOKEN [BODY]
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$GOV$path" \
      -H "authorization: Bearer $token" \
      -H 'content-type: application/json' \
      -d "$body"
  else
    curl -fsS -X "$method" "$GOV$path" -H "authorization: Bearer $token"
  fi
}

mk_actor () {                                  # mk_actor KIND NAME ROLE_JSON  -> id
  gov POST /v1/actors "$BOOTSTRAP" \
    "{\"kind\":\"$1\",\"display_name\":\"$2\",\"roles\":$3}" | jq -r .id
}
mk_token () {                                  # mk_token ACTOR_ID -> token
  gov POST "/v1/actors/$1/tokens" "$BOOTSTRAP" | jq -r .token
}
attest () {                                    # attest TOKEN ITEM_KEY NOTE
  gov POST "/v1/runs/$RUN_ID/attestations" "$1" \
    "{\"item_key\":\"$2\",\"note\":$(printf '%s' "$3" | jq -Rs .)}" > /dev/null
}
gate_summary () {                              # echoes "decision (n/m)"
  gov GET "/v1/runs/$RUN_ID/gate" "$BOOTSTRAP" \
    | jq -r '.decision + " (" + (.summary.items_satisfied|tostring) + "/" + (.summary.items_total|tostring) + " items satisfied)"'
}

# --- cast --------------------------------------------------------------------

echo "Creating four actors representing the parties to the handoff..."
AGENT_ID=$(mk_actor agent   "Claude (refactor agent)"      '["author"]')
CI_ID=$(mk_actor    service "github-actions"               '["ci"]')
DBA_ID=$(mk_actor   human   "Priya (DBA)"                  '["dba"]')
RM_ID=$(mk_actor    human   "Sam (release manager)"        '["release-manager"]')

AGENT_TOKEN=$(mk_token "$AGENT_ID")
CI_TOKEN=$(mk_token "$CI_ID")
DBA_TOKEN=$(mk_token "$DBA_ID")
RM_TOKEN=$(mk_token "$RM_ID")

# --- open the run from the pinned checklist ---------------------------------

echo "Opening a run from checklist.json..."
RUN_ID=$(gov POST /v1/runs "$BOOTSTRAP" "$(cat "$here/checklist.json")" | jq -r .id)
echo "    run id: $RUN_ID"
echo

# --- walk the story ---------------------------------------------------------

echo "1. gate before any attestations         -> $(gate_summary)"

attest "$AGENT_TOKEN" author-statement \
  "drafted migration 2026_05_25; touched: schema.sql, models/audit.py"
echo "2. agent attests author-statement       -> $(gate_summary)"

# --- the punchline: agent tries to self-approve. recorded, but not authoritative.
attest "$AGENT_TOKEN" schema-approved \
  "I, the agent, believe the schema is fine"
echo "3. agent ALSO attests schema-approved   -> $(gate_summary)"
echo "   (the attestation was accepted -- writes are append-only and never"
echo "    rejected -- but the rule requires actor_with_kind:human, so the"
echo "    count of satisfied items did not change.)"
echo

attest "$CI_TOKEN"    tests-green \
  "build #1729 green; 412 tests, 0 failures"
echo "4. ci attests tests-green               -> $(gate_summary)"

attest "$DBA_TOKEN"   schema-approved \
  "index on audit_log(event_at) ok; no lock risk under load"
echo "5. dba attests schema-approved          -> $(gate_summary)"
echo "   (the same item now has two attestations on it -- the agent's and"
echo "    the DBA's. The rule is satisfied because at least one of them is"
echo "    from a human with role:dba. Both are kept in the audit log.)"
echo

attest "$RM_TOKEN"    release-approved \
  "scheduled window 22:00 UTC; rollback plan attached"
echo "6. release-mgr attests release-approved -> $(gate_summary)"

echo
echo "7. gate after all attestations          -> $(gate_summary)"
echo
echo "Authority lives in the rule, not in who is allowed to type."
echo "Anyone with a token can attest; the gate decides what counts."

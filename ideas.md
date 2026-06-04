# Governor: example ideas

A brainstorm of creative and serious uses of the Governor attestation
format. The underlying primitive is:

> Before X is allowed to happen, these specific named parties must
> independently say YES on these specific items — and once started, the
> bar can't move and nothing can be quietly erased.

That shape generalises further than it looks.

## 🗳️ Votes & governance

- **OSS maintainer release vote** — `n_of: {count: 3, of: [actor_with_role: maintainer]}` before a tag is published.
- **DAO-without-tokens** — proposals where votes are identity-typed (board member, contributor, treasurer), not coin-weighted.
- **ADRs with quorum** — an architecture decision is "ratified" only after 2 staff engineers + 1 security + 1 product attest.
- **Public meeting minutes** — chair + secretary + ≥3 members sign; the minutes become canonical.
- **Open letters** — signatories attest under their real role (`actor_with_role: climate-scientist`), so "1,000 scientists agree" is verifiable, not just claimed.

## 🎲 Games

- **Async board games** — the state machine only advances when *all* players attest the previous move. No "you went out of turn."
- **Diplomacy / sealed-orders** — each player attests their hash-committed orders by a deadline; the round resolves only when N-of-N have committed.
- **Speedrun verification** — `all_of: [actor: runner, actor_with_role: verifier, actor_with_role: tool-auditor]` before a run hits the leaderboard.
- **D&D session canon** — DM + every player sign the session log; that's what's "true" in the campaign.
- **ARG / scavenger hunts** — each location is an `actor_is: <location-agent-uuid>`; "you visited all 7" is a gate, not a screenshot.
- **Co-op "ready check"** — round doesn't start until 4-of-4 attest ready, with append-only history of who held up the lobby.

## 🧠 Quizzes & education

- **Proctored exam** — `all_of: [student, proctor, id-verifier, payment-cleared]`.
- **Team quiz lock-in** — answer only counts if 4-of-4 teammates attest agreement (great for trivia nights, pub leagues).
- **PhD defense** — each chapter is a checklist item; each committee member attests per-chapter, not just the whole thesis.
- **Bootcamp graduation** — instructor + capstone judge + peer reviewer; a public Governor page replaces "trust the certificate JPEG."
- **Driving test** — examiner attests each maneuver independently; the gate is the licence.

## 🔬 Science & research

- **Pre-registration** — pin the hypothesis as the checklist *before* data collection. The bar literally can't be moved post-hoc.
- **Reproducibility badge** — original author + 2 independent reproducers + dataset-hash attestation.
- **Peer review made visible** — editor + N reviewers + ethics-check, each as a separate item, optionally pseudonymous via actor IDs.
- **Clinical trial amendments** — PI + IRB + sponsor; the audit trail *is* the regulatory artefact.

## ⚖️ Legal & civic

- **Wedding** — officiant + both partners + 2 witnesses, all attesting items like "vows exchanged", "rings exchanged".
- **Will execution** — testator + 2 witnesses + notary, append-only so contests have a real record.
- **Real-estate closing** — title, inspection, financing, insurance, walkthrough — each a separate item with its own gatekeeper.
- **Petition with teeth** — `actor_with_role: registered-voter-district-7` makes "10,000 signatures" mean something specific.

## 🛠️ Serious software

- **Prod break-glass** — requester + on-call + security-officer, with a time-boxed token. The gate *is* the access grant.
- **ML model promotion** — eval-passed (agent) + bias-reviewed (human) + product-owner (human) + dataset-card-signed.
- **Package publish** — maintainer + 2FA-verified + SBOM-scanner + license-check before `npm publish`/`pypi upload` runs.
- **Secret rotation** — rotator + verifier + 24h-soak-passed. No more "did anyone actually rotate that?"
- **Schema migration** — DBA + SRE + backup-confirmed (`actor: backup-bot`) + rollback-plan-attached.
- **Two-person rule** — `n_of: {count: 2, of: [actor_with_role: launch-officer]}` for anything where one person genuinely shouldn't be enough.

## 🤖 Multi-agent AI

- **Agent handoff** (already in `examples/agent-handoff/`) — Agent A finishes, Agent B refuses to start until A's attestation is present.
- **Tool-use audit** — agent invokes tool → tool attests "I ran with these args" → policy-checker attests "args were within policy". Three signatures for one action.
- **AI jury** — `n_of: {count: 3, of: [actor_with_kind: agent]}` across 5 different model providers before an automated decision ships. Verifiable model diversity.
- **Human-in-the-loop, provably** — any `actor_with_kind: human` requirement on an item is a gate that the agent *cannot* satisfy itself, no matter how convincing.

## 🎉 Quirky & social

- **Pizza democracy** — all 4 roommates attest the topping list before the order submits.
- **Group trip departure** — everyone attests "I'm packed" + driver attests "fuel ≥ ½" before the car leaves.
- **Promise tracker** — New Year's resolutions, witnessed by 2 friends, public Governor page on Dec 31.
- **Dare adjudication** — dare-maker + dare-doer + 2 witnesses; the gate decides whether the payout actually owes.
- **Group gift** — gift "unlocks" only after N friends each attest their contribution.
- **Concert "I was there"** — venue agent + ticket-scan + neighbour-attestation; verifiable scene cred.

## What makes a good Governor example

If picking winners for the repo, the ones that *show off* the format
best have at least 2 of these properties:

1. **Mixed actor kinds** — humans + agents + services on the same checklist (the agent-handoff demo already nails this).
2. **Heterogeneous rules per item** — e.g. one item is `actor_with_role`, another is `n_of`, another is `actor_with_kind: human`. Shows the DSL has range.
3. **A "you can't satisfy this yourself" moment** — like the agent that attests against a `kind: human` item and the gate stays denied. Teaches the principle in one beat.
4. **A pre-commit / no-moving-goalposts moment** — pre-registered hypothesis, sealed game orders, pinned release checklist.
5. **A public page worth linking to** — election certification, wedding, OSS release, exam result — anything where "here's the URL" replaces "trust me."

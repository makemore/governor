-- Rich attestation detail (v1.1). Additive and forward-only: every new
-- column is nullable, so existing rows are untouched. A NULL outcome is
-- treated as a positive ('pass') sign-off by both the serialiser and the
-- gate, preserving the original append-only semantics.
--
--   outcome   pass | fail | waived. What this sweep concluded. Validated
--             in the application layer (not a DB CHECK) so the two server
--             implementations stay the single source of truth.
--   severity  info | low | medium | high | critical. Optional weight,
--             chiefly meaningful on a fail.
--   detail    Long-form free text (markdown) describing the sweep.
--   evidence  JSON array of {kind,url,content_hash,media_type,inline_metadata}.

ALTER TABLE attestations ADD COLUMN outcome  TEXT;
ALTER TABLE attestations ADD COLUMN severity TEXT;
ALTER TABLE attestations ADD COLUMN detail   TEXT;
ALTER TABLE attestations ADD COLUMN evidence TEXT;

CREATE INDEX idx_attestations_outcome ON attestations(outcome);

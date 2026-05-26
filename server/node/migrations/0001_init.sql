-- Governor reference schema, v1.
-- All identifiers are UUIDs serialised as TEXT. Timestamps are ISO-8601 UTC.

CREATE TABLE actors (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('human','agent','service')),
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE actor_roles (
  actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  role     TEXT NOT NULL,
  PRIMARY KEY (actor_id, role)
);

CREATE TABLE tokens (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  prefix      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  subject_id      TEXT NOT NULL,
  subject_label   TEXT,
  subject_kind    TEXT,
  checklist_key   TEXT NOT NULL,
  checklist_title TEXT,
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL REFERENCES actors(id)
);
CREATE INDEX idx_runs_subject ON runs(subject_id);

CREATE TABLE run_items (
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  description TEXT,
  rule_json   TEXT NOT NULL,
  ordinal     INTEGER NOT NULL,
  PRIMARY KEY (run_id, key)
);

CREATE TABLE attestations (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  actor_id    TEXT NOT NULL REFERENCES actors(id),
  note        TEXT,
  attested_at TEXT NOT NULL,
  FOREIGN KEY (run_id, item_key) REFERENCES run_items(run_id, key) ON DELETE CASCADE
);
CREATE INDEX idx_attestations_run_item ON attestations(run_id, item_key);
CREATE INDEX idx_attestations_actor    ON attestations(actor_id);

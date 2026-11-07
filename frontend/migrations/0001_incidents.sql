CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_created_at ON incidents(created_at DESC);

CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  client_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (day, client_id)
);

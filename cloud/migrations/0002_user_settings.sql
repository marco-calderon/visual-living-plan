CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  accent TEXT NOT NULL,
  page_width TEXT NOT NULL,
  diffs_theme TEXT NOT NULL,
  wrap_code INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

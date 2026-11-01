-- One plan row for the local registry and for D1.
-- Configuration moves into meta. Document history uses body.

CREATE TABLE plans_next (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_path TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  heartbeat_at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);

INSERT INTO plans_next (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
SELECT
  id,
  user_id,
  token,
  COALESCE(title, ''),
  mode,
  CASE WHEN closed_at IS NULL THEN 'running' ELSE 'executed' END,
  NULL,
  created_at,
  closed_at,
  created_at,
  json_object('tier', tier)
FROM plans;

DROP TABLE plans;
ALTER TABLE plans_next RENAME TO plans;

CREATE INDEX IF NOT EXISTS plans_plan_path_idx ON plans (plan_path);
CREATE INDEX IF NOT EXISTS plans_started_at_idx ON plans (started_at);
CREATE INDEX IF NOT EXISTS plans_status_idx ON plans (status);
CREATE INDEX IF NOT EXISTS plans_user_idx ON plans (user_id);

CREATE TABLE plan_versions_next (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  parent_id TEXT,
  reason TEXT,
  restored_from_id TEXT,
  UNIQUE (plan_id, seq)
);

INSERT INTO plan_versions_next (id, plan_id, seq, title, body, created_at, parent_id, reason, restored_from_id)
SELECT id, plan_id, seq, title, source, created_at, NULL, NULL, NULL FROM plan_versions;

DROP TABLE plan_versions;
ALTER TABLE plan_versions_next RENAME TO plan_versions;

CREATE UNIQUE INDEX IF NOT EXISTS plan_versions_plan_seq ON plan_versions (plan_id, seq);
CREATE INDEX IF NOT EXISTS plan_versions_plan ON plan_versions (plan_id, seq);

CREATE TABLE user_settings_next (
  user_id TEXT PRIMARY KEY,
  meta TEXT NOT NULL
);

INSERT INTO user_settings_next (user_id, meta)
SELECT
  user_id,
  json_object(
    'accent', accent,
    'pageWidth', page_width,
    'diffsTheme', diffs_theme,
    'wrapCode', wrap_code != 0
  )
FROM user_settings;

DROP TABLE user_settings;
ALTER TABLE user_settings_next RENAME TO user_settings;

CREATE TABLE IF NOT EXISTS plan_runs (
  run_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  user_id TEXT,
  token TEXT,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_path TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  heartbeat_at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS plan_runs_started_at_idx ON plan_runs (started_at);
CREATE INDEX IF NOT EXISTS plan_runs_ended_at_idx ON plan_runs (ended_at);

CREATE TABLE IF NOT EXISTS plan_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);

CREATE INDEX IF NOT EXISTS plan_events_plan_id_idx ON plan_events (plan_id);
CREATE INDEX IF NOT EXISTS plan_events_plan_seq_idx ON plan_events (plan_id, seq);

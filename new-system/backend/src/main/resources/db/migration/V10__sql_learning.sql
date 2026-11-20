CREATE TABLE sql_attempts (
 id TEXT PRIMARY KEY, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 mode TEXT NOT NULL, source TEXT NOT NULL, digest TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
 report TEXT, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE TABLE sql_understanding (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES sql_attempts(id),
 rule_version TEXT NOT NULL, answers TEXT NOT NULL, passed INTEGER NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE sql_completions (
 id TEXT PRIMARY KEY, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL REFERENCES sql_attempts(id),
 understanding_id TEXT NOT NULL REFERENCES sql_understanding(id),
 digest TEXT NOT NULL, rule_version TEXT NOT NULL, completed_at TEXT NOT NULL,
 UNIQUE(course_version,stage_id)
);
CREATE TABLE sql_reset_tokens (
 token TEXT PRIMARY KEY, target TEXT NOT NULL, expires_at TEXT NOT NULL
);

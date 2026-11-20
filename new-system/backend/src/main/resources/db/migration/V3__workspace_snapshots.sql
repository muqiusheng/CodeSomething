CREATE TABLE workspace_previews (
 id TEXT PRIMARY KEY, directory TEXT NOT NULL, course_id TEXT NOT NULL, course_version TEXT NOT NULL,
 stage_id TEXT NOT NULL, digest TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE workspace_bindings (
 id TEXT PRIMARY KEY, directory TEXT NOT NULL, course_id TEXT NOT NULL, course_version TEXT NOT NULL,
 stage_id TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL
);

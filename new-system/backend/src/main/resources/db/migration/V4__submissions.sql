CREATE TABLE submissions (
 id TEXT PRIMARY KEY, binding_id TEXT NOT NULL REFERENCES workspace_bindings(id),
 course_id TEXT NOT NULL, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 digest TEXT NOT NULL, source BLOB NOT NULL, created_at TEXT NOT NULL
);

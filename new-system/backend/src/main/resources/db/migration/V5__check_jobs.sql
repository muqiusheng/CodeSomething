CREATE TABLE check_jobs (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES submissions(id),
 binding_id TEXT NOT NULL REFERENCES workspace_bindings(id), idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(binding_id,idempotency_key)
);

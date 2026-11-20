CREATE TABLE understanding_attempts (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES check_jobs(id),
 binding_id TEXT NOT NULL REFERENCES workspace_bindings(id),
 rule_version TEXT NOT NULL, answers TEXT NOT NULL, passed INTEGER NOT NULL,
 idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(binding_id,idempotency_key)
);
CREATE TABLE stage_completions (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL, course_version TEXT NOT NULL,
 stage_id TEXT NOT NULL, submission_id TEXT NOT NULL REFERENCES submissions(id),
 job_id TEXT NOT NULL REFERENCES check_jobs(id),
 understanding_id TEXT NOT NULL REFERENCES understanding_attempts(id),
 snapshot_digest TEXT NOT NULL, rule_version TEXT NOT NULL, completed_at TEXT NOT NULL,
 UNIQUE(course_id,course_version,stage_id)
);

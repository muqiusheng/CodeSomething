CREATE TABLE tutor_requests (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 help_level TEXT NOT NULL, question TEXT NOT NULL, context_manifest TEXT NOT NULL, prompt TEXT NOT NULL,
 submission_id TEXT REFERENCES submissions(id), job_id TEXT REFERENCES check_jobs(id),
 fingerprint TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 error_code TEXT, message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);

CREATE TABLE project_drafts (
 id TEXT PRIMARY KEY, interest TEXT NOT NULL, kind TEXT NOT NULL, profile_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, payload TEXT, partial TEXT NOT NULL DEFAULT '',
 report TEXT, error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE generated_courses (id TEXT PRIMARY KEY REFERENCES project_drafts(id), digest TEXT NOT NULL, payload TEXT NOT NULL, report TEXT NOT NULL, published_at TEXT NOT NULL);
CREATE TABLE generated_attempts (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES generated_courses(id), stage_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, digest TEXT NOT NULL, files TEXT NOT NULL, status TEXT NOT NULL,
 report TEXT, created_at TEXT NOT NULL
);
CREATE TABLE generated_completions (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES generated_courses(id), stage_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL REFERENCES generated_attempts(id), digest TEXT NOT NULL, help TEXT NOT NULL,
 explanation TEXT NOT NULL, completed_at TEXT NOT NULL, UNIQUE(course_id,stage_id)
);
CREATE TABLE generated_reference_views (course_id TEXT NOT NULL REFERENCES generated_courses(id),stage_id TEXT NOT NULL,viewed_at TEXT NOT NULL,PRIMARY KEY(course_id,stage_id));

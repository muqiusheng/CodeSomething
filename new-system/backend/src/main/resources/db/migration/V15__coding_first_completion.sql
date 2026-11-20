CREATE TABLE stage_completions_coding (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL, course_version TEXT NOT NULL,
 stage_id TEXT NOT NULL, submission_id TEXT NOT NULL REFERENCES submissions(id),
 job_id TEXT NOT NULL REFERENCES check_jobs(id),
 understanding_id TEXT REFERENCES understanding_attempts(id),
 snapshot_digest TEXT NOT NULL, rule_version TEXT NOT NULL, completed_at TEXT NOT NULL,
 UNIQUE(course_id,course_version,stage_id)
);
INSERT INTO stage_completions_coding SELECT * FROM stage_completions;
DROP TABLE stage_completions;
ALTER TABLE stage_completions_coding RENAME TO stage_completions;
CREATE TABLE sql_completions_coding (
 id TEXT PRIMARY KEY, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 attempt_id TEXT NOT NULL REFERENCES sql_attempts(id),
 understanding_id TEXT REFERENCES sql_understanding(id),
 digest TEXT NOT NULL, rule_version TEXT NOT NULL, completed_at TEXT NOT NULL,
 UNIQUE(course_version,stage_id)
);
INSERT INTO sql_completions_coding SELECT * FROM sql_completions;
DROP TABLE sql_completions;
ALTER TABLE sql_completions_coding RENAME TO sql_completions;

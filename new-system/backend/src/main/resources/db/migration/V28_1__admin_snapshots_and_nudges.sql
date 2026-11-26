CREATE TABLE learner_nudges (
 id TEXT PRIMARY KEY,
 target_user_id TEXT NOT NULL REFERENCES users(id),
 sender_admin_id TEXT NOT NULL REFERENCES users(id),
 sender_username TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('study','lab','exam','custom')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 500),
 created_at TEXT NOT NULL,
 acknowledged_at TEXT,
 expires_at TEXT NOT NULL
);
CREATE INDEX learner_nudges_target ON learner_nudges(target_user_id, created_at DESC);
CREATE INDEX learner_nudges_recent ON learner_nudges(created_at DESC);

ALTER TABLE check_jobs ADD COLUMN snapshot_pruned_at TEXT;
CREATE TRIGGER admin_index_check_jobs_snapshot_pruned
AFTER UPDATE OF snapshot_pruned_at ON check_jobs
WHEN OLD.snapshot_pruned_at IS NOT NEW.snapshot_pruned_at
BEGIN
 INSERT OR REPLACE INTO admin_index_changes(kind,entity_id) VALUES('check',NEW.id);
END;

ALTER TABLE sql_attempts ADD COLUMN snapshot_pruned_at TEXT;
CREATE TRIGGER admin_index_sql_attempts_snapshot_pruned
AFTER UPDATE OF snapshot_pruned_at ON sql_attempts
WHEN OLD.snapshot_pruned_at IS NOT NEW.snapshot_pruned_at
BEGIN
 INSERT OR REPLACE INTO admin_index_changes(kind,entity_id) VALUES('sql',NEW.id);
END;

ALTER TABLE portfolio_checks ADD COLUMN snapshot_pruned_at TEXT;
CREATE TRIGGER admin_index_portfolio_checks_snapshot_pruned
AFTER UPDATE OF snapshot_pruned_at ON portfolio_checks
WHEN OLD.snapshot_pruned_at IS NOT NEW.snapshot_pruned_at
BEGIN
 INSERT OR REPLACE INTO admin_index_changes(kind,entity_id) VALUES('portfolio',NEW.id);
END;

ALTER TABLE admin_job_index ADD COLUMN snapshot_pruned_at TEXT;

CREATE INDEX check_jobs_snapshot_submission ON check_jobs(submission_id, snapshot_pruned_at, status);

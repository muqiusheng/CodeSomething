-- The private runner can be released independently of the later application changes.
ALTER TABLE check_jobs ADD COLUMN remote_java INTEGER NOT NULL DEFAULT 0;
ALTER TABLE check_jobs ADD COLUMN remote_lease TEXT;
ALTER TABLE check_jobs ADD COLUMN remote_until INTEGER;

CREATE UNIQUE INDEX check_jobs_remote_java_submission ON check_jobs(submission_id) WHERE remote_java = 1;
CREATE INDEX check_jobs_remote_java_queue ON check_jobs(status, remote_until, created_at) WHERE remote_java = 1;

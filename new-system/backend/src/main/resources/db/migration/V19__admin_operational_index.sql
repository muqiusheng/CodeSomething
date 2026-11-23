ALTER TABLE users ADD COLUMN completed_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE admin_job_index (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    PRIMARY KEY(user_id, kind, id)
);
CREATE INDEX admin_jobs_id ON admin_job_index(id);
CREATE INDEX admin_jobs_submission ON admin_job_index(submission_id, created_at DESC, id);
CREATE INDEX admin_jobs_recent ON admin_job_index(created_at DESC, id, user_id, kind);
CREATE INDEX admin_jobs_status ON admin_job_index(status, created_at DESC, id);
CREATE INDEX admin_jobs_course ON admin_job_index(course_id, created_at DESC, id);
CREATE INDEX admin_jobs_owner ON admin_job_index(user_id, created_at DESC, id);
CREATE INDEX admin_jobs_queue ON admin_job_index(kind, status, created_at, user_id);

CREATE TABLE admin_submission_index (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, kind, id)
);
CREATE INDEX admin_submissions_time ON admin_submission_index(created_at);

CREATE TABLE admin_tutor_error_index (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(user_id, id)
);
CREATE INDEX admin_tutor_errors_time ON admin_tutor_error_index(created_at);

-- Durable per-file change journal. The metadata and source write commit together.
CREATE TABLE admin_index_changes (
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    PRIMARY KEY(kind, entity_id)
);

CREATE TRIGGER admin_index_check_jobs_insert AFTER INSERT ON check_jobs
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('check', NEW.id);
END;

CREATE TRIGGER admin_index_check_jobs_update AFTER UPDATE ON check_jobs WHEN OLD.status IS NOT NEW.status OR OLD.finished_at IS NOT NEW.finished_at
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('check', NEW.id);
END;

CREATE TRIGGER admin_index_check_jobs_delete AFTER DELETE ON check_jobs
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('check', OLD.id);
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'check', id FROM check_jobs;

CREATE TRIGGER admin_index_portfolio_checks_insert AFTER INSERT ON portfolio_checks
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('portfolio', NEW.id);
END;

CREATE TRIGGER admin_index_portfolio_checks_update AFTER UPDATE ON portfolio_checks WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('portfolio', NEW.id);
END;

CREATE TRIGGER admin_index_portfolio_checks_delete AFTER DELETE ON portfolio_checks
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('portfolio', OLD.id);
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'portfolio', id FROM portfolio_checks;

CREATE TRIGGER admin_index_sql_attempts_insert AFTER INSERT ON sql_attempts
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('sql', NEW.id);
END;

CREATE TRIGGER admin_index_sql_attempts_update AFTER UPDATE ON sql_attempts WHEN OLD.status IS NOT NEW.status OR OLD.finished_at IS NOT NEW.finished_at
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('sql', NEW.id);
END;

CREATE TRIGGER admin_index_sql_attempts_delete AFTER DELETE ON sql_attempts
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('sql', OLD.id);
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'sql', id FROM sql_attempts;

CREATE TRIGGER admin_index_submissions_insert AFTER INSERT ON submissions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('submission', NEW.id);
END;

CREATE TRIGGER admin_index_submissions_delete AFTER DELETE ON submissions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('submission', OLD.id);
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'submission', id FROM submissions;

CREATE TRIGGER admin_index_tutor_requests_insert AFTER INSERT ON tutor_requests
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('tutor', NEW.id);
END;

CREATE TRIGGER admin_index_tutor_requests_update AFTER UPDATE ON tutor_requests WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('tutor', NEW.id);
END;

CREATE TRIGGER admin_index_tutor_requests_delete AFTER DELETE ON tutor_requests
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('tutor', OLD.id);
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'tutor', id FROM tutor_requests;

CREATE TRIGGER admin_index_stage_completions_insert AFTER INSERT ON stage_completions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('completion', '');
END;

CREATE TRIGGER admin_index_stage_completions_delete AFTER DELETE ON stage_completions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('completion', '');
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'completion', '' FROM stage_completions;

CREATE TRIGGER admin_index_sql_completions_insert AFTER INSERT ON sql_completions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('completion', '');
END;

CREATE TRIGGER admin_index_sql_completions_delete AFTER DELETE ON sql_completions
BEGIN
    INSERT OR IGNORE INTO admin_index_changes VALUES ('completion', '');
END;
INSERT OR IGNORE INTO admin_index_changes SELECT 'completion', '' FROM sql_completions;
CREATE TABLE admin_job_retries (
    kind TEXT NOT NULL,
    original_id TEXT NOT NULL,
    retry_id TEXT NOT NULL,
    PRIMARY KEY(kind, original_id)
);

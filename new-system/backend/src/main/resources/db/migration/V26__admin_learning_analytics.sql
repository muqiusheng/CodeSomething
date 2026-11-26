-- Tenant change markers are also seeded on upgrade to backfill the central projections.
CREATE TABLE admin_school_lab_index (
    user_id TEXT NOT NULL, course_id TEXT NOT NULL, lab_id TEXT NOT NULL,
    required_completed INTEGER NOT NULL, optional_completed INTEGER NOT NULL,
    PRIMARY KEY(user_id,course_id,lab_id)
);
CREATE INDEX admin_school_lab_lookup ON admin_school_lab_index(course_id,lab_id,user_id);

CREATE TABLE admin_school_exam_index (
    user_id TEXT NOT NULL, course_id TEXT NOT NULL, id TEXT NOT NULL, paper_id TEXT NOT NULL,
    mode TEXT NOT NULL, score INTEGER NOT NULL, max_score INTEGER NOT NULL, passed INTEGER NOT NULL,
    complete_grading INTEGER NOT NULL, submitted_at INTEGER NOT NULL, elapsed_seconds INTEGER NOT NULL,
    PRIMARY KEY(user_id,course_id,id)
);
CREATE INDEX admin_school_exam_time ON admin_school_exam_index(submitted_at DESC,id);
CREATE INDEX admin_school_exam_paper ON admin_school_exam_index(course_id,paper_id,submitted_at DESC);

CREATE TABLE admin_school_mistake_index (
    user_id TEXT NOT NULL, course_id TEXT NOT NULL, question_id TEXT NOT NULL, paper_id TEXT NOT NULL,
    title TEXT NOT NULL, mistakes INTEGER NOT NULL, mastered INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,course_id,question_id)
);
CREATE INDEX admin_school_mistake_question ON admin_school_mistake_index(course_id,question_id);

CREATE TABLE admin_school_exam_draft_index (
    user_id TEXT NOT NULL, course_id TEXT NOT NULL, id TEXT NOT NULL, paper_id TEXT NOT NULL,
    PRIMARY KEY(user_id,course_id,id)
);

CREATE TABLE admin_bookmark_index (
    user_id TEXT NOT NULL, id TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    href TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,id)
);
CREATE INDEX admin_bookmark_target ON admin_bookmark_index(category,id);

CREATE TABLE admin_tutor_index (
    user_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,id)
);
CREATE INDEX admin_tutor_status ON admin_tutor_index(status,created_at);

CREATE TABLE supplemental_answer_stats (
    question_id TEXT NOT NULL, user_id TEXT NOT NULL, attempts INTEGER NOT NULL,
    correct INTEGER NOT NULL, last_answer_at TEXT NOT NULL,
    PRIMARY KEY(question_id,user_id)
);
CREATE TABLE supplemental_question_deletions (
    question_id TEXT PRIMARY KEY REFERENCES supplemental_questions(id),
    deleted_at TEXT NOT NULL
);

ALTER TABLE invitation_codes ADD COLUMN note TEXT NOT NULL DEFAULT '';
CREATE TABLE invitation_registrations (
    code TEXT NOT NULL REFERENCES invitation_codes(code),
    user_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY(code,user_id)
);

CREATE TABLE school_lab_activity (
    id TEXT PRIMARY KEY, course_id TEXT NOT NULL, lab_id TEXT NOT NULL, kind TEXT NOT NULL,
    passed INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE admin_school_lab_activity (
    user_id TEXT NOT NULL, id TEXT NOT NULL, course_id TEXT NOT NULL, lab_id TEXT NOT NULL,
    kind TEXT NOT NULL, passed INTEGER NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,id)
);
CREATE INDEX admin_school_activity_time ON admin_school_lab_activity(created_at);
CREATE INDEX admin_school_activity_lab ON admin_school_lab_activity(user_id,course_id,lab_id,created_at);

CREATE INDEX admin_users_created ON users(created_at);

CREATE TRIGGER admin_index_school_lab_insert AFTER INSERT ON school_lab_drafts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_lab',json_array(NEW.course_id,NEW.lab_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_lab_update AFTER UPDATE ON school_lab_drafts WHEN OLD.payload IS NOT NEW.payload
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_lab',json_array(NEW.course_id,NEW.lab_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_lab_delete AFTER DELETE ON school_lab_drafts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_lab',json_array(OLD.course_id,OLD.lab_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'school_lab',json_array(course_id,lab_id) FROM school_lab_drafts;

CREATE TRIGGER admin_index_school_exam_insert AFTER INSERT ON school_exam_attempts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam',json_array(NEW.course_id,NEW.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_exam_update AFTER UPDATE ON school_exam_attempts WHEN OLD.payload IS NOT NEW.payload
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam',json_array(NEW.course_id,NEW.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_exam_delete AFTER DELETE ON school_exam_attempts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam',json_array(OLD.course_id,OLD.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'school_exam',json_array(course_id,id) FROM school_exam_attempts;

CREATE TRIGGER admin_index_school_mistake_insert AFTER INSERT ON school_exam_mistakes
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_mistake',json_array(NEW.course_id,NEW.question_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_mistake_update AFTER UPDATE ON school_exam_mistakes WHEN OLD.payload IS NOT NEW.payload
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_mistake',json_array(NEW.course_id,NEW.question_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_mistake_delete AFTER DELETE ON school_exam_mistakes
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_mistake',json_array(OLD.course_id,OLD.question_id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'school_mistake',json_array(course_id,question_id) FROM school_exam_mistakes;

CREATE TRIGGER admin_index_school_exam_draft_insert AFTER INSERT ON school_exam_drafts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam_draft',json_array(NEW.course_id,NEW.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_exam_draft_update AFTER UPDATE ON school_exam_drafts WHEN OLD.paper_id IS NOT NEW.paper_id
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam_draft',json_array(NEW.course_id,NEW.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_exam_draft_delete AFTER DELETE ON school_exam_drafts
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_exam_draft',json_array(OLD.course_id,OLD.id)) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'school_exam_draft',json_array(course_id,id) FROM school_exam_drafts;

CREATE TRIGGER admin_index_bookmark_insert AFTER INSERT ON learner_bookmarks
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('bookmark',NEW.id) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_bookmark_update AFTER UPDATE ON learner_bookmarks WHEN OLD.title IS NOT NEW.title OR OLD.href IS NOT NEW.href OR OLD.category IS NOT NEW.category OR OLD.created_at IS NOT NEW.created_at
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('bookmark',NEW.id) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_bookmark_delete AFTER DELETE ON learner_bookmarks
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('bookmark',OLD.id) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'bookmark',id FROM learner_bookmarks;

CREATE TRIGGER admin_index_school_activity_insert AFTER INSERT ON school_lab_activity
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_activity',NEW.id) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

CREATE TRIGGER admin_index_school_activity_delete AFTER DELETE ON school_lab_activity
BEGIN
    INSERT INTO admin_index_changes(kind,entity_id) VALUES('school_activity',OLD.id) ON CONFLICT(kind,entity_id) DO NOTHING;
END;

INSERT OR IGNORE INTO admin_index_changes(kind,entity_id) SELECT 'tutor',id FROM tutor_requests;

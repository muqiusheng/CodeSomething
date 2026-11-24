CREATE TABLE school_exam_drafts (
    course_id TEXT NOT NULL,
    id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (course_id, id),
    UNIQUE (course_id, paper_id)
);

CREATE TABLE school_exam_attempts (
    course_id TEXT NOT NULL,
    id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (course_id, id)
);

CREATE INDEX idx_school_exam_attempts_paper ON school_exam_attempts(course_id, paper_id, submitted_at DESC);

CREATE TABLE school_exam_attempt_items (
    course_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (course_id, attempt_id, question_id),
    FOREIGN KEY (course_id, attempt_id) REFERENCES school_exam_attempts(course_id, id)
);

CREATE TABLE school_exam_mistakes (
    course_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (course_id, question_id)
);


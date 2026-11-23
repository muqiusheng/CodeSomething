CREATE TABLE school_lab_drafts (
    course_id TEXT NOT NULL,
    lab_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    payload TEXT NOT NULL,
    PRIMARY KEY (course_id, lab_id)
);

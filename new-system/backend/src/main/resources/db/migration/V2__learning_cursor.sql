CREATE TABLE learning_sessions (
    id TEXT PRIMARY KEY CHECK (id = 'local'),
    course_id TEXT NOT NULL,
    course_version TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    step TEXT NOT NULL CHECK (step IN ('teaching', 'task', 'report')),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at TEXT NOT NULL
);

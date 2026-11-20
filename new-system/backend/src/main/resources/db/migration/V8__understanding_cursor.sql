CREATE TABLE learning_sessions_v8 (
 id TEXT PRIMARY KEY CHECK (id = 'local'),
 course_id TEXT NOT NULL, course_version TEXT NOT NULL, stage_id TEXT NOT NULL,
 step TEXT NOT NULL CHECK (step IN ('teaching','task','report','understanding')),
 revision INTEGER NOT NULL CHECK (revision > 0), updated_at TEXT NOT NULL
);
INSERT INTO learning_sessions_v8 SELECT * FROM learning_sessions;
DROP TABLE learning_sessions;
ALTER TABLE learning_sessions_v8 RENAME TO learning_sessions;

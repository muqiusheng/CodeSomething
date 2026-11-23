ALTER TABLE supplemental_questions RENAME TO supplemental_questions_old;
DROP INDEX supplemental_questions_catalog;
CREATE TABLE supplemental_questions (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    prompt TEXT NOT NULL,
    options TEXT NOT NULL CHECK(json_array_length(options) BETWEEN 2 AND 6),
    answer INTEGER NOT NULL CHECK(answer >= 0 AND answer < json_array_length(options)),
    explanation TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);
CREATE INDEX supplemental_questions_catalog ON supplemental_questions(status,topic,updated_at);
INSERT INTO supplemental_questions SELECT * FROM supplemental_questions_old;
DROP TABLE supplemental_questions_old;

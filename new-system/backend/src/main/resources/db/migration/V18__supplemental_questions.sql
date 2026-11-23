CREATE TABLE supplemental_questions (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    prompt TEXT NOT NULL,
    options TEXT NOT NULL,
    answer INTEGER NOT NULL CHECK(answer BETWEEN 0 AND 3),
    explanation TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
);
CREATE INDEX supplemental_questions_catalog ON supplemental_questions(status,topic,updated_at);

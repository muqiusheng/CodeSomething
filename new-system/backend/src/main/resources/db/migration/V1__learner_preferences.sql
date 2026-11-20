CREATE TABLE learner_preferences (
    id TEXT PRIMARY KEY CHECK (id = 'local'),
    daily_minutes INTEGER NOT NULL CHECK (daily_minutes IN (30, 60, 90)),
    motion TEXT NOT NULL CHECK (motion IN ('system', 'reduce')),
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

INSERT INTO learner_preferences (id, daily_minutes, motion, revision, updated_at)
VALUES ('local', 60, 'system', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

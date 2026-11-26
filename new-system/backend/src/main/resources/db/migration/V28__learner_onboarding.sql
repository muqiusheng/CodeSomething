CREATE TABLE learner_onboarding (
    id TEXT PRIMARY KEY CHECK (id = 'local'),
    home_tour_version INTEGER NOT NULL DEFAULT 0 CHECK (home_tour_version BETWEEN 0 AND 1000),
    workbench_tour_version INTEGER NOT NULL DEFAULT 0 CHECK (workbench_tour_version BETWEEN 0 AND 1000),
    last_seen_changelog TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
INSERT INTO learner_onboarding(id, updated_at) VALUES ('local', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

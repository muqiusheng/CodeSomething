CREATE TABLE learner_corrections (
 id TEXT PRIMARY KEY, stage_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE learner_reviews (
 id TEXT PRIMARY KEY, stage_id TEXT NOT NULL, variant INTEGER NOT NULL, rule_version TEXT NOT NULL,
 status TEXT NOT NULL, help TEXT NOT NULL, answer INTEGER, passed INTEGER,
 created_at TEXT NOT NULL, finished_at TEXT, due_at TEXT NOT NULL
);
CREATE UNIQUE INDEX learner_one_open_review ON learner_reviews(stage_id) WHERE status='open';
CREATE TABLE learner_plan (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
 review_minutes INTEGER NOT NULL DEFAULT 0, focus_course TEXT NOT NULL DEFAULT ''
);
INSERT INTO learner_plan(id) VALUES('local');
CREATE TABLE learner_adjustments (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, course_id TEXT NOT NULL, status TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, applied_revision INTEGER,
 previous_minutes INTEGER NOT NULL, previous_focus TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE learner_evidence (
 id TEXT PRIMARY KEY, stage_id TEXT NOT NULL, course_id TEXT NOT NULL, course_version TEXT NOT NULL,
 source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_rule TEXT NOT NULL, digest TEXT NOT NULL,
 detail TEXT NOT NULL, occurred_at TEXT NOT NULL, observed_at TEXT NOT NULL,
 UNIQUE(stage_id,source_type,source_id)
);
CREATE TABLE learner_mastery_snapshots (
 id TEXT PRIMARY KEY, rule_version TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
 payload TEXT NOT NULL, created_at TEXT NOT NULL
);

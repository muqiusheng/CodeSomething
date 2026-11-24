CREATE TABLE interactive_learner_profile (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    placement_json TEXT NOT NULL DEFAULT '{}',
    mode TEXT NOT NULL DEFAULT 'guided' CHECK (mode IN ('guided','open')),
    xp INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_award_day TEXT,
    best_combo INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO interactive_learner_profile(singleton) VALUES (1);

CREATE TABLE interactive_lesson_progress (
    lesson_id TEXT PRIMARY KEY,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
    current_step INTEGER NOT NULL DEFAULT 0,
    best_accuracy INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    best_combo INTEGER NOT NULL DEFAULT 0,
    hints_used INTEGER NOT NULL DEFAULT 0,
    mistake_tags_json TEXT NOT NULL DEFAULT '[]',
    steps_json TEXT NOT NULL DEFAULT '[]',
    revision INTEGER NOT NULL DEFAULT 0,
    last_command TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE interactive_module_unlocks (
    module_id TEXT PRIMARY KEY,
    reason TEXT NOT NULL CHECK (reason IN ('skip_quiz','completed')),
    unlocked_at TEXT NOT NULL
);

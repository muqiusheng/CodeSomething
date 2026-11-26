CREATE TABLE site_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    author_id TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_site_announcements_status ON site_announcements(status, pinned DESC, published_at DESC, created_at DESC);

CREATE TABLE learner_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    admin_reply TEXT NOT NULL DEFAULT '',
    replied_by TEXT,
    replied_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_learner_feedback_user ON learner_feedback(user_id, created_at DESC);
CREATE INDEX idx_learner_feedback_status ON learner_feedback(status, created_at DESC);

CREATE TABLE learner_bookmarks (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('school', 'outside')),
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    href TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

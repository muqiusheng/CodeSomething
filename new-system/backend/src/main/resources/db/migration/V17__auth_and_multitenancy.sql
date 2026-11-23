CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ROLE_STUDENT', 'ROLE_ADMIN')),
    status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    password_change_required INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE user_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    refresh_token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0, 1))
);
CREATE INDEX user_tokens_user ON user_tokens(user_id);
CREATE TABLE user_activity_hourly (
    user_id TEXT NOT NULL REFERENCES users(id),
    hour TEXT NOT NULL,
    PRIMARY KEY(user_id, hour)
);
CREATE INDEX user_activity_hour ON user_activity_hourly(hour);
CREATE TABLE admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_time ON admin_audit_logs(created_at DESC, id);
CREATE TABLE invitation_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    max_uses INTEGER NOT NULL CHECK(max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count <= max_uses),
    status TEXT NOT NULL DEFAULT 'active',
    expires_at INTEGER NOT NULL
);
-- The existing tables share one owner per physical SQLite file.
-- The V16 database remains the initial administrator's learning database.
CREATE TABLE learning_data_owner (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    user_id TEXT NOT NULL
);
INSERT INTO learning_data_owner VALUES (1, 'admin');

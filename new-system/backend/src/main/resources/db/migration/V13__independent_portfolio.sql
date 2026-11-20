CREATE TABLE portfolio_works (
 id TEXT PRIMARY KEY, theme TEXT NOT NULL, domain TEXT NOT NULL, rule_version TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE, design TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0,
 transfer_at TEXT, last_step TEXT NOT NULL DEFAULT 'design', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE portfolio_previews (
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES portfolio_works(id), phase TEXT NOT NULL,
 digest TEXT NOT NULL, files TEXT NOT NULL, design_revision INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE portfolio_checks (
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES portfolio_works(id), phase TEXT NOT NULL,
 digest TEXT NOT NULL, files TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL, report TEXT, design_revision INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE portfolio_explanations (
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES portfolio_works(id), check_id TEXT NOT NULL REFERENCES portfolio_checks(id),
 digest TEXT NOT NULL, help TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(check_id)
);
CREATE TABLE portfolio_visits (
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES portfolio_works(id), observation TEXT NOT NULL,
 next_action TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL
);

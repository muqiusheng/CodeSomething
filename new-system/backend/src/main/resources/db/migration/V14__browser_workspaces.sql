CREATE TABLE browser_workspaces (
 binding_id TEXT PRIMARY KEY REFERENCES workspace_bindings(id),
 files TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);

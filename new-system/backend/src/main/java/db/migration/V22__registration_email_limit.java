package db.migration;

import java.sql.SQLException;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V22__registration_email_limit extends BaseJavaMigration {
    @Override
    public boolean canExecuteInTransaction() {
        return false;
    }

    @Override
    public void migrate(Context context) throws SQLException {
        var connection = context.getConnection();
        try (var statement = connection.createStatement()) {
            // SQLite requires rebuilding the table to remove its implicit unique email index.
            // Disable FK enforcement before the transaction so DROP preserves referencing rows.
            statement.execute("PRAGMA foreign_keys = OFF");
            try {
                connection.setAutoCommit(false);
                statement.execute("""
                    CREATE TABLE users_with_shared_email (
                        id TEXT PRIMARY KEY,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        email TEXT COLLATE NOCASE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('ROLE_STUDENT', 'ROLE_ADMIN')),
                        status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
                        failed_logins INTEGER NOT NULL DEFAULT 0,
                        locked_until INTEGER NOT NULL DEFAULT 0,
                        password_change_required INTEGER NOT NULL DEFAULT 0,
                        last_seen_at TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        completed_count INTEGER NOT NULL DEFAULT 0,
                        deleted_at TEXT
                    )
                    """);
                statement.execute("""
                    INSERT INTO users_with_shared_email (
                        id, username, email, password_hash, role, status, failed_logins, locked_until,
                        password_change_required, last_seen_at, created_at, updated_at, completed_count, deleted_at
                    )
                    SELECT id, username, email, password_hash, role, status, failed_logins, locked_until,
                           password_change_required, last_seen_at, created_at, updated_at, completed_count, deleted_at
                    FROM users
                    """);
                statement.execute("DROP TABLE users");
                statement.execute("ALTER TABLE users_with_shared_email RENAME TO users");
                statement.execute("CREATE INDEX users_email_lookup ON users(email) WHERE email IS NOT NULL");
                try (var violations = statement.executeQuery("PRAGMA foreign_key_check")) {
                    if (violations.next()) throw new SQLException("Account email migration would leave invalid foreign keys");
                }
                connection.commit();
            } catch (SQLException failure) {
                connection.rollback();
                throw failure;
            } finally {
                connection.setAutoCommit(true);
                statement.execute("PRAGMA foreign_keys = ON");
            }
        }
    }
}

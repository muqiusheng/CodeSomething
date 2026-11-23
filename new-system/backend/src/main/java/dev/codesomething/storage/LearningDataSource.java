package dev.codesomething.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import org.sqlite.SQLiteConnection;
import org.sqlite.SQLiteUpdateListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.AbstractDataSource;

/** Routes all existing learning queries and transactions to the authenticated owner's database. */
public final class LearningDataSource extends AbstractDataSource {
    private static final ThreadLocal<String> OWNER = new ThreadLocal<>();
    private final DataSource primary;
    private final Path directory;
    private final ConcurrentMap<String, DataSource> tenants = new ConcurrentHashMap<>();

    private final java.util.Set<String> indexChanges = ConcurrentHashMap.newKeySet();
    private final boolean publicMode;

    LearningDataSource(String url, Path directory, boolean publicMode) {
        this.publicMode = publicMode;
        this.primary = sqlite(url, "admin");
        this.directory = directory;
    }

    public static String owner() { return OWNER.get() == null ? "admin" : OWNER.get(); }

    public static Scope asOwner(String id) {
        String previous = OWNER.get();
        OWNER.set(id);
        return () -> {
            if (previous == null) OWNER.remove();
            else OWNER.set(previous);
        };
    }

    public static Runnable capture(Runnable operation) {
        String id = owner();
        return () -> { try (var scope = asOwner(id)) { operation.run(); } };
    }

    @FunctionalInterface
    public interface Scope extends AutoCloseable {
        @Override void close();
    }

    private SQLiteDataSource sqlite(String url, String owner) {
        var settings = new SQLiteConfig();
        settings.enforceForeignKeys(true);
        settings.setBusyTimeout(5000);
        settings.setJournalMode(SQLiteConfig.JournalMode.WAL);
        // Acquire the writer reservation before a transactional read can take a stale WAL snapshot.
        settings.setTransactionMode(SQLiteConfig.TransactionMode.IMMEDIATE);
        var source = new SQLiteDataSource(settings) {
            @Override public SQLiteConnection getConnection(String username, String password) throws SQLException {
                var connection = super.getConnection(username, password);
                if (publicMode) connection.addUpdateListener((type, database, table, rowId) -> {
                    if (type == SQLiteUpdateListener.Type.INSERT && "admin_index_changes".equals(table))
                        indexChanges.add(owner);
                });
                return connection;
            }
        };
        source.setUrl(url);
        return source;
    }

    static Flyway migrations(DataSource source) {
        return Flyway.configure().dataSource(source).locations("classpath:db/migration")
            .validateMigrationNaming(true).load();
    }

    public DataSource primary() { return primary; }

    public java.util.Set<String> indexChanges() { return indexChanges; }

    public <T> T inLearningTransaction(String id, java.util.function.Function<JdbcTemplate, T> operation) {
        var source = source(id);
        var transaction = new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.support.JdbcTransactionManager(source));
        return transaction.execute(status -> operation.apply(new JdbcTemplate(source)));
    }

    public java.util.List<String> queuedOwners(String kind) {
        return new JdbcTemplate(primary).queryForList("""
            SELECT DISTINCT j.user_id FROM admin_job_index j JOIN users u ON u.id=j.user_id
            WHERE j.kind=? AND j.status='queued' AND u.status='active' ORDER BY j.user_id
            """, String.class, kind);
    }

    public JdbcTemplate learning(String id) {
        return new JdbcTemplate(source(id));
    }

    public Path database(String id) {
        if ("admin".equals(id)) return directory.resolve("codesomething.db");
        if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Invalid learning owner");
        return directory.resolve("learners").resolve(id + ".db");
    }

    public boolean exists(String id) { return Files.isRegularFile(database(id)); }

    public java.util.List<String> owners(boolean activeOnly) {
        if (!activeOnly) return new JdbcTemplate(primary).queryForList("SELECT id FROM users ORDER BY id", String.class)
            .stream().filter(this::exists).toList();
        return new JdbcTemplate(primary).queryForList("SELECT id FROM users WHERE status='active' ORDER BY id", String.class)
            .stream().filter(this::exists).toList();
    }

    private DataSource source(String id) {
        return "admin".equals(id) ? primary : tenants.computeIfAbsent(id, this::initialize);
    }

    private DataSource initialize(String id) {
        Path file = database(id);
        try { Files.createDirectories(file.getParent()); }
        catch (IOException e) { throw new IllegalStateException("Cannot create learner data directory", e); }
        DataSource source = sqlite("jdbc:sqlite:" + file, id);
        migrations(source).migrate();
        var jdbc = new JdbcTemplate(source);
        String owner = jdbc.queryForObject("SELECT user_id FROM learning_data_owner WHERE singleton=1", String.class);
        if ("admin".equals(owner)) jdbc.update("UPDATE learning_data_owner SET user_id=? WHERE singleton=1", id);
        else if (!id.equals(owner)) throw new IllegalStateException("Learning database owner mismatch");
        return source;
    }

    @Override public Connection getConnection() throws SQLException {
        return source(owner()).getConnection();
    }

    @Override public Connection getConnection(String username, String password) throws SQLException {
        return source(owner()).getConnection(username, password);
    }
}

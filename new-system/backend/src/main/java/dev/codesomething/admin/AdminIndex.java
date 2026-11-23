package dev.codesomething.admin;

import dev.codesomething.storage.LearningDataSource;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="cs.public", havingValue="true")
final class AdminIndex implements ApplicationRunner {
    private static final int BATCH_SIZE = 256;
    private static final Map<String, String> JOB_QUERIES = Map.of(
        "check", """
            SELECT j.id, j.submission_id, s.course_id, s.stage_id, j.status, j.created_at, j.finished_at
            FROM check_jobs j JOIN submissions s ON s.id=j.submission_id WHERE j.id=?
            """,
        "portfolio", """
            SELECT id, id AS submission_id, 'portfolio' AS course_id, phase AS stage_id,
                status, created_at, NULL AS finished_at FROM portfolio_checks WHERE id=?
            """,
        "sql", """
            SELECT id, id AS submission_id, 'sql-foundations' AS course_id, stage_id,
                status, created_at, finished_at FROM sql_attempts WHERE id=?
            """);
    private final LearningDataSource storage;
    private final RunnerInventory runners;
    private final java.util.concurrent.ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private volatile Disk disk = new Disk(0, 0);
    private volatile Map<String, Object> docker = Map.of("status", "not_checked");

    record Disk(long bytes, long walBytes) {}
    private record Change(String kind, String entityId) {}

    AdminIndex(LearningDataSource storage, RunnerInventory runners) {
        this.storage = storage;
        this.runners = runners;
    }

    @Override public void run(ApplicationArguments args) {
        // Resume unacknowledged changes and backfill pre-index rows once per migration.
        refreshOwner("admin");
        for (String owner : storage.owners(false)) {
            if (!"admin".equals(owner)) refreshOwner(owner);
        }
        refreshDisk();
        worker.scheduleWithFixedDelay(this::refreshChanged, 0, 150, TimeUnit.MILLISECONDS);
        worker.scheduleWithFixedDelay(this::refreshDisk, 30, 30, TimeUnit.SECONDS);
        var probe = Executors.newSingleThreadScheduledExecutor(r -> {
            var thread = new Thread(r, "admin-docker-health");
            thread.setDaemon(true);
            return thread;
        });
        dockerProbe = probe;
        probe.scheduleWithFixedDelay(() -> docker = runners.health(), 0, 15, TimeUnit.SECONDS);
    }

    private java.util.concurrent.ScheduledExecutorService dockerProbe;

    Disk disk() { return disk; }
    Map<String, Object> docker() { return docker; }

    private void refreshChanged() {
        for (String owner : List.copyOf(storage.indexChanges())) {
            try {
                // Remove the wake-up before taking the SQLite writer reservation. Subsequent writes
                // either appear in this batch or register another wake-up.
                storage.indexChanges().remove(owner);
                if (drain(owner)) storage.indexChanges().add(owner);
            } catch (RuntimeException error) {
                storage.indexChanges().add(owner);
                LoggerFactory.getLogger(AdminIndex.class).warn("Admin index update will be retried for {}", owner, error);
            }
        }
    }

    private void refreshOwner(String owner) {
        while (drain(owner)) { /* Drain a bounded batch per transaction. */ }
    }

    private boolean drain(String owner) {
        // Runtime wakes may arrive before commit, so always reserve the writer for notified owners.
        return Boolean.TRUE.equals(storage.inLearningTransaction(owner, local -> {
            var changes = local.query("SELECT kind, entity_id FROM admin_index_changes LIMIT ?",
                (row, n) -> new Change(row.getString(1), row.getString(2)), BATCH_SIZE);
            if (changes.isEmpty()) return false;
            if ("admin".equals(owner)) project(local, local, owner, changes);
            else storage.inLearningTransaction("admin", primary -> {
                project(local, primary, owner, changes);
                return null;
            });
            // If the process dies after the projection commits, the upserts can be replayed.
            local.batchUpdate("DELETE FROM admin_index_changes WHERE kind=? AND entity_id=?",
                changes.stream().map(change -> new Object[]{change.kind(), change.entityId()}).toList());
            return changes.size() == BATCH_SIZE;
        }));
    }

    private void project(JdbcTemplate local, JdbcTemplate primary, String owner, List<Change> changes) {
        for (var change : changes) {
            String kind = change.kind(), id = change.entityId();
            if (JOB_QUERIES.containsKey(kind)) {
                var rows = local.queryForList(JOB_QUERIES.get(kind), id);
                if (rows.isEmpty()) primary.update("DELETE FROM admin_job_index WHERE user_id=? AND kind=? AND id=?", owner, kind, id);
                else {
                    var row = rows.getFirst();
                    primary.update("""
                        INSERT INTO admin_job_index(user_id,kind,id,submission_id,course_id,stage_id,status,created_at,finished_at)
                        VALUES (?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(user_id,kind,id) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at
                        """, owner, kind, id, row.get("submission_id"), row.get("course_id"), row.get("stage_id"),
                        row.get("status"), row.get("created_at"), row.get("finished_at"));
                }
                if (!"check".equals(kind)) {
                    boolean retry = local.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM admin_job_retries WHERE kind=? AND retry_id=?)",
                        Boolean.class, kind, id);
                    projectSubmission(primary, owner, kind, id, retry ? List.of() : rows);
                }
            } else if ("submission".equals(kind)) {
                projectSubmission(primary, owner, kind, id, local.queryForList("SELECT created_at FROM submissions WHERE id=?", id));
            } else if ("completion".equals(kind)) {
                int count = local.queryForObject("""
                    SELECT (SELECT count(*) FROM stage_completions) + (SELECT count(*) FROM sql_completions)
                    """, Integer.class);
                primary.update("UPDATE users SET completed_count=? WHERE id=?", count, owner);
            } else if ("tutor".equals(kind)) {
                var times = local.queryForList("SELECT created_at FROM tutor_requests WHERE id=? AND status='failed'", String.class, id);
                if (times.isEmpty()) primary.update("DELETE FROM admin_tutor_error_index WHERE user_id=? AND id=?", owner, id);
                else primary.update("INSERT OR REPLACE INTO admin_tutor_error_index VALUES (?,?,?)", owner, id, times.getFirst());
            }
        }
    }

    private static void projectSubmission(JdbcTemplate primary, String owner, String kind, String id, List<Map<String, Object>> rows) {
        if (rows.isEmpty()) primary.update("DELETE FROM admin_submission_index WHERE user_id=? AND kind=? AND id=?", owner, kind, id);
        else primary.update("INSERT OR REPLACE INTO admin_submission_index VALUES (?,?,?,?)", owner, kind, id, rows.getFirst().get("created_at"));
    }

    private void refreshDisk() {
        long bytes = size(storage.database("admin")), walBytes = size(Path.of(storage.database("admin") + "-wal"));
        Path learners = storage.database("admin").resolveSibling("learners");
        if (Files.isDirectory(learners)) try (var files = Files.newDirectoryStream(learners)) {
            for (Path file : files) {
                if (file.toString().endsWith(".db")) bytes += size(file);
                else if (file.toString().endsWith(".db-wal")) walBytes += size(file);
            }
        } catch (IOException | java.nio.file.DirectoryIteratorException error) {
            LoggerFactory.getLogger(AdminIndex.class).warn("Could not refresh admin database sizes", error);
            return;
        }
        disk = new Disk(bytes, walBytes);
    }

    private static long size(Path path) {
        try { return Files.size(path); }
        catch (IOException error) { return 0; }
    }

    @PreDestroy void close() {
        worker.shutdownNow();
        if (dockerProbe != null) dockerProbe.shutdownNow();
    }
}

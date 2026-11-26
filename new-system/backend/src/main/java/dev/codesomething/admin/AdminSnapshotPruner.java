package dev.codesomething.admin;

import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name="cs.public", havingValue="true")
final class AdminSnapshotPruner {
    private static final String FINISHED = "status NOT IN ('queued','running','cancelling','awaiting_runner')";
    private final LearningDataSource storage;
    private final AdminIndex index;
    private final int retentionHours;

    record Result(long prunedJobs, long freedBytes) {
        Result plus(Result other) {
            return new Result(prunedJobs + other.prunedJobs, freedBytes + other.freedBytes);
        }
    }

    AdminSnapshotPruner(LearningDataSource storage, AdminIndex index,
                        @Value("${cs.admin.snapshot-retention-hours:24}") int retentionHours) {
        if (retentionHours < 1) throw new IllegalArgumentException("Snapshot retention must be at least one hour");
        this.storage = storage;
        this.index = index;
        this.retentionHours = retentionHours;
    }

    int retentionHours() { return retentionHours; }

    @Scheduled(initialDelayString="${cs.admin.snapshot-initial-delay-ms:60000}", fixedDelayString="${cs.admin.snapshot-interval-ms:3600000}")
    void pruneExpired() {
        try { prune(false); }
        catch (RuntimeException failure) {
            LoggerFactory.getLogger(getClass()).warn("Scheduled job snapshot cleanup failed", failure);
        }
    }

    Result prune(boolean all) {
        var now = Instant.now();
        String cutoff = all ? null : now.minus(retentionHours, ChronoUnit.HOURS).toString();
        var owners = new ArrayList<>(storage.owners(false));
        if (!owners.contains("admin")) owners.add("admin");
        var total = new Result(0, 0);
        for (String owner : owners) {
            var result = storage.inLearningTransaction(owner, jdbc -> prune(jdbc, now.toString(), cutoff));
            if (result.prunedJobs() > 0) index.refreshOwner(owner);
            total = total.plus(result);
        }
        return total;
    }

    private static Result prune(JdbcTemplate jdbc, String now, String cutoff) {
        var result = clear(jdbc, "check_jobs", null, now, cutoff)
            .plus(clear(jdbc, "sql_attempts", "source", now, cutoff))
            .plus(clear(jdbc, "portfolio_checks", "files", now, cutoff));
        // Multiple check jobs (including retries) can reference the same submission.
        String shared = """
            FROM submissions s WHERE length(s.source)>0
              AND EXISTS(SELECT 1 FROM check_jobs p WHERE p.submission_id=s.id AND p.snapshot_pruned_at IS NOT NULL)
              AND NOT EXISTS(SELECT 1 FROM check_jobs j WHERE j.submission_id=s.id
                AND (j.snapshot_pruned_at IS NULL OR j.status IN ('queued','running','cancelling','awaiting_runner')))
            """;
        long sourceBytes = jdbc.queryForObject("SELECT coalesce(sum(length(s.source)),0) " + shared, Long.class);
        if (sourceBytes > 0)
            jdbc.update("UPDATE submissions SET source=x'' WHERE id IN (SELECT s.id " + shared + ")");
        return new Result(result.prunedJobs(), result.freedBytes() + sourceBytes);
    }

    private static Result clear(JdbcTemplate jdbc, String table, String payload, String now, String cutoff) {
        String where = " WHERE snapshot_pruned_at IS NULL AND " + FINISHED
            + (cutoff == null ? "" : " AND julianday(created_at)<julianday(?)");
        String bytes = "coalesce(length(CAST(report AS BLOB)),0)"
            + (payload == null ? "" : "+length(CAST(" + payload + " AS BLOB))");
        long removed = jdbc.queryForObject("SELECT coalesce(sum(" + bytes + "),0) FROM " + table + where,
            Long.class, cutoff == null ? new Object[0] : new Object[]{cutoff});
        int count = jdbc.update("UPDATE " + table + " SET report=NULL,snapshot_pruned_at=?"
            + (payload == null ? "" : "," + payload + "=''") + where,
            cutoff == null ? new Object[]{now} : new Object[]{now, cutoff});
        return new Result(count, removed);
    }
}

package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.portfolio.PortfolioController;
import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name="cs.public", havingValue="true")
final class AdminJobRetry {
    private static final Set<String> RETRYABLE = Set.of(
        "compile_error", "business_error", "timed_out", "timeout", "environment_error", "cancelled", "interrupted",
        "sql_error", "output_limit");
    private final LearningDataSource storage;
    private final PortfolioController portfolio;
    private final boolean enabled;
    private final int checkLimit;

    public record Result(String id, boolean created) {}

    AdminJobRetry(LearningDataSource storage, PortfolioController portfolio,
                  @Value("${cs.runner.enabled:true}") boolean enabled, @Value("${cs.runner.mode}") String mode) {
        this.storage = storage;
        this.portfolio = portfolio;
        this.enabled = enabled;
        this.checkLimit = "docker_only".equals(mode) ? 2 : 8;
    }

    Result retry(String owner, String kind, String original) {
        if (!enabled) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"RUNNER_DISABLED","评测运行器尚未启用。",Map.of());
        if (!storage.exists(owner))
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"JOB_DATABASE_UNAVAILABLE","作业所属学习库暂时不可用。",Map.of());
        String table = switch (kind) {
            case "portfolio" -> "portfolio_checks";
            case "sql" -> "sql_attempts";
            default -> "check_jobs";
        };
        Result result = storage.inLearningTransaction(owner, jdbc -> {
            boolean active = jdbcForAccount(owner, jdbc).queryForObject(
                "SELECT count(*) FROM users WHERE id=? AND status='active'", Integer.class, owner) == 1;
            if (!active) throw conflict("请先解冻此账号。");
            var previous = jdbc.queryForList("SELECT retry_id FROM admin_job_retries WHERE kind=? AND original_id=?",
                String.class, kind, original);
            if (!previous.isEmpty()) return new Result(previous.getFirst(), false);
            var statuses = jdbc.queryForList("SELECT status FROM " + table + " WHERE id=?", String.class, original);
            if (statuses.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"JOB_NOT_FOUND","作业不存在。",Map.of());
            if (!RETRYABLE.contains(statuses.getFirst())) throw conflict("只有已结束且未通过的作业可以重跑。");
            int limit = "portfolio".equals(kind) ? 1 : "sql".equals(kind) ? 2 : checkLimit;
            int queued = jdbc.queryForObject("SELECT count(*) FROM " + table
                + " WHERE status IN ('queued','running','cancelling')", Integer.class);
            if (queued >= limit) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RUNNER_BUSY","该账号的评测队列已满，请等待后重试。",Map.of());
            String id = UUID.randomUUID().toString();
            int inserted = jdbc.update(switch (kind) {
                case "portfolio" -> """
                    INSERT INTO portfolio_checks(id,work_id,phase,digest,files,idempotency_key,status,design_revision,created_at)
                    SELECT ?,c.work_id,c.phase,c.digest,c.files,?,'queued',c.design_revision,? FROM portfolio_checks c
                    JOIN portfolio_works w ON w.id=c.work_id AND w.revision=c.design_revision WHERE c.id=?
                    """;
                case "sql" -> """
                    INSERT INTO sql_attempts(id,course_version,stage_id,mode,source,digest,idempotency_key,status,created_at)
                    SELECT ?,course_version,stage_id,mode,source,digest,?,'queued',? FROM sql_attempts WHERE id=?
                    """;
                default -> """
                    INSERT INTO check_jobs(id,submission_id,binding_id,idempotency_key,status,created_at)
                    SELECT ?,submission_id,binding_id,?,'queued',? FROM check_jobs WHERE id=?
                    """;
            }, id, UUID.randomUUID().toString(), Instant.now().toString(), original);
            if (inserted != 1) throw conflict("作品设计版本已变更，请在当前版本重新提交。");
            jdbc.update("INSERT INTO admin_job_retries VALUES (?,?,?)", kind, original, id);
            return new Result(id, true);
        });
        if (result.created() && "portfolio".equals(kind)) {
            try (var scope = LearningDataSource.asOwner(owner)) {
                portfolio.enqueueCheck(result.id());
            }
        }
        return result;
    }

    private org.springframework.jdbc.core.JdbcTemplate jdbcForAccount(String owner, org.springframework.jdbc.core.JdbcTemplate local) {
        return "admin".equals(owner) ? local : new org.springframework.jdbc.core.JdbcTemplate(storage.primary());
    }

    private static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT,"JOB_NOT_RETRYABLE",message,Map.of());
    }
}

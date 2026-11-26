package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/internal/java-judge")
public class RemoteJavaJobs {
    private static final Set<String> FINAL_STATUSES = Set.of("passed", "business_error", "compile_error", "timed_out");
    private final LearningDataSource storage;
    private final byte[] token;
    private final String owner;
    private final boolean allLearners;
    private final List<Window> windows;
    private final JsonMapper json = JsonMapper.builder().build();

    RemoteJavaJobs(LearningDataSource storage, @Value("${cs.public:false}") boolean publicMode,
                   @Value("${CS_REMOTE_JAVA_TOKEN:}") String token,
                   @Value("${CS_REMOTE_JAVA_TEST_OWNER:}") String owner,
                   @Value("${CS_REMOTE_JAVA_ALL_LEARNERS:false}") boolean allLearners,
                   @Value("${CS_REMOTE_JAVA_UTC_WINDOWS:60-270,360-570,630-1020}") String schedule) {
        this.storage = storage;
        this.token = ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
        this.owner = publicMode ? owner : "admin";
        this.allLearners = publicMode && allLearners;
        windows = Arrays.stream(schedule.split(",")).map(Window::parse).toList();
    }

    private record Window(int start, int end) {
        static Window parse(String range) {
            String[] bounds = range.split("-", -1);
            if (bounds.length != 2) throw new IllegalArgumentException("Invalid Java service window");
            int start = Integer.parseInt(bounds[0]), end = Integer.parseInt(bounds[1]);
            if (start < 0 || start >= end || end > 1440) throw new IllegalArgumentException("Invalid Java service window");
            return new Window(start, end);
        }
    }

    public record Claim(String id, String owner, String lease, String source, String digest, String version, String stage,
                        String policy) {}
    public record Result(String owner, String lease, String status, CheckReport report) {}

    boolean enabled() {
        return token.length >= 39 && (allLearners || !owner.isBlank());
    }

    boolean routes(SubmissionController.Submission submission) {
        return enabled() && (allLearners || owner.equals(LearningDataSource.owner()))
            && policy(submission.courseId(), submission.courseVersion(), submission.stageId()) != null;
    }

    static String policy(String course, String version, String stage) {
        if (!"http-json-basics".equals(course)) return null;
        if (ConsoleOutputCheck.applies(course, version, stage)) return ConsoleOutputCheck.POLICY;
        if (HttpCourseChecks.textPractice(course, version, stage)) return HttpCourseChecks.TEXT_POLICY;
        return switch (stage) {
            case "run-server" -> "server-smoke-v1";
            case "transfer" -> "notes-json-v1";
            default -> "task-json-v1";
        };
    }

    private void authorize(String authorization) {
        if (!enabled() || authorization == null
            || !MessageDigest.isEqual(token, authorization.getBytes(StandardCharsets.UTF_8)))
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "接口不存在。", Map.of());
    }

    private boolean open(Instant now) {
        var utc = now.atOffset(ZoneOffset.UTC);
        int minute = utc.getHour() * 60 + utc.getMinute();
        return windows.stream().anyMatch(window -> window.start <= minute && minute < window.end);
    }

    @PostMapping("/claim")
    public ResponseEntity<Claim> claim(@RequestHeader(value="Authorization", required=false) String authorization) {
        authorize(authorization);
        Instant now = Instant.now();
        if (!open(now)) return ResponseEntity.noContent().build();
        for (String candidate : allLearners ? storage.owners(true) : List.of(owner)) {
            if (!storage.exists(candidate)) continue;
            Claim claim = claim(candidate, now);
            if (claim != null) return ResponseEntity.ok(claim);
        }
        return ResponseEntity.noContent().build();
    }

    private Claim claim(String candidate, Instant now) {
        String lease = UUID.randomUUID().toString();
        return storage.inLearningTransaction(candidate, jdbc -> {
            var ids = jdbc.query("""
                UPDATE check_jobs SET status='running', remote_lease=?, remote_until=?
                WHERE id=(SELECT id FROM check_jobs
                    WHERE remote_java=1 AND (status='queued' OR (status='running' AND remote_until<=?))
                    ORDER BY created_at, id LIMIT 1)
                RETURNING id
                """, (row, n) -> row.getString(1), lease, now.getEpochSecond() + 90, now.getEpochSecond());
            if (ids.isEmpty()) return null;
            String id = ids.getFirst();
            return jdbc.queryForObject("""
                SELECT s.source,s.digest,s.course_version,s.stage_id,s.course_id
                FROM submissions s JOIN check_jobs j ON s.id=j.submission_id WHERE j.id=?
                """, (row, n) -> new Claim(id, candidate, lease, new String(row.getBytes(1), StandardCharsets.UTF_8),
                    row.getString(2), row.getString(3), row.getString(4),
                    policy(row.getString(5), row.getString(3), row.getString(4))), id);
        });
    }

    @PostMapping("/{id}/result")
    public ResponseEntity<Void> result(@PathVariable String id, @RequestBody Result result,
                                       @RequestHeader(value="Authorization", required=false) String authorization) {
        authorize(authorization);
        if (result.owner() == null || (!owner.equals(result.owner()) && !(allLearners && isLearnerId(result.owner())))
            || result.lease() == null || result.status() == null || result.report() == null
            || !FINAL_STATUSES.contains(result.status()) || !storage.exists(result.owner()))
            throw ApiException.invalid("result", "判题结果缺少有效的任务或租约。");
        long now = Instant.now().getEpochSecond();
        boolean accepted = storage.inLearningTransaction(result.owner(), jdbc -> {
            var reports = jdbc.query("""
                SELECT j.status,j.remote_until,s.digest,s.course_version,s.stage_id,s.course_id
                FROM check_jobs j JOIN submissions s ON s.id=j.submission_id
                WHERE j.id=? AND j.remote_java=1 AND j.remote_lease=?
                """, (row, n) -> new Binding(row.getString(1), row.getLong(2), row.getString(3),
                    row.getString(4), row.getString(5), row.getString(6)), id, result.lease());
            if (reports.isEmpty()) return false;
            var binding = reports.getFirst();
            if (FINAL_STATUSES.contains(binding.status())) return binding.status().equals(result.status());
            if (!"running".equals(binding.status()) || binding.until() <= now) return false;
            CheckReport report = result.report();
            if (!binding.digest().equals(report.snapshotDigest()) || !binding.version().equals(report.courseVersion())
                || !binding.stage().equals(report.stageId())
                || !java.util.Objects.equals(policy(binding.course(), binding.version(), binding.stage()), report.policy())
                || report.functionalPassed() != "passed".equals(result.status()))
                throw ApiException.invalid("report", "判题结果与原始提交不一致。");
            return jdbc.update("UPDATE check_jobs SET status=?,report=?,finished_at=? WHERE id=?",
                result.status(), json.writeValueAsString(report), Instant.ofEpochSecond(now).toString(), id) == 1;
        });
        return ResponseEntity.status(accepted ? HttpStatus.NO_CONTENT : HttpStatus.CONFLICT).build();
    }

    private static boolean isLearnerId(String value) {
        return value.matches("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}");
    }

    private record Binding(String status, long until, String digest, String version, String stage, String course) {}
}

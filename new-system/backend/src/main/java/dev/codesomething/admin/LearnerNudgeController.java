package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.auth.AuthController;
import dev.codesomething.auth.AuthService;
import dev.codesomething.storage.LearningDataSource;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="cs.public", havingValue="true")
class LearnerNudgeController {
    private static final Set<String> KINDS = Set.of("study", "lab", "exam", "custom");
    private final JdbcTemplate db;
    private final AuthService auth;

    LearnerNudgeController(LearningDataSource storage, AuthService auth) {
        db = new JdbcTemplate(storage.primary());
        this.auth = auth;
    }

    record Input(String kind, String title, String message) {}

    @PostMapping("/api/v1/admin/users/{id}/nudge")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> send(@PathVariable String id, @RequestBody Input input, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        if (input.kind() == null || !KINDS.contains(input.kind())) throw ApiException.invalid("kind", "请选择提醒类型。");
        String title = text(input.title(), "title", "标题", 80);
        String message = text(input.message(), "message", "正文", 500);
        var now = Instant.now();
        String nudge = UUID.randomUUID().toString();
        int inserted = db.update("""
            INSERT INTO learner_nudges(id,target_user_id,sender_admin_id,sender_username,kind,title,message,created_at,expires_at)
            SELECT ?,id,?,?,?,?,?,?,? FROM users
            WHERE id=? AND role='ROLE_STUDENT' AND status='active' AND deleted_at IS NULL
            """, nudge, admin.userId(), admin.username(), input.kind(), title, message,
            now.toString(), now.plus(24, ChronoUnit.HOURS).toString(), id);
        if (inserted == 0) throw new ApiException(HttpStatus.NOT_FOUND, "ACTIVE_LEARNER_NOT_FOUND", "找不到可接收提醒的学员。", Map.of());
        auth.audit(admin.userId(), "learner_nudged", "user", id, nudge + " · " + input.kind(), request.getRemoteAddr());
        return Map.of("id", nudge);
    }

    @GetMapping("/api/v1/admin/nudges")
    List<Map<String, Object>> recent(@RequestParam(defaultValue="") String userId) {
        return db.queryForList("""
            SELECT n.*, CASE WHEN acknowledged_at IS NOT NULL THEN 'acknowledged'
                WHEN julianday(expires_at)<=julianday('now') THEN 'expired' ELSE 'unread' END AS status
            FROM learner_nudges n WHERE (?='' OR target_user_id=?)
            ORDER BY created_at DESC,id LIMIT 100
            """, userId, userId);
    }

    @GetMapping("/api/v1/nudges/unread")
    List<Map<String, Object>> unread(HttpServletRequest request) {
        var user = AuthController.principal(request).user();
        return db.queryForList("""
            SELECT id,kind,title,message,sender_username,created_at,expires_at
            FROM learner_nudges WHERE target_user_id=? AND acknowledged_at IS NULL
              AND julianday(expires_at)>julianday('now')
            ORDER BY created_at,id LIMIT 20
            """, user.userId());
    }

    @PostMapping("/api/v1/nudges/{id}/ack")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void acknowledge(@PathVariable String id, HttpServletRequest request) {
        var user = AuthController.principal(request).user();
        int updated = db.update("""
            UPDATE learner_nudges SET acknowledged_at=coalesce(acknowledged_at,?)
            WHERE id=? AND target_user_id=? AND (acknowledged_at IS NOT NULL OR julianday(expires_at)>julianday('now'))
            """, Instant.now().toString(), id, user.userId());
        if (updated == 0) throw new ApiException(HttpStatus.NOT_FOUND, "NUDGE_NOT_FOUND", "这条提醒已过期或不可用。", Map.of());
    }

    private static String text(String raw, String field, String label, int limit) {
        String value = raw == null ? "" : raw.strip();
        if (value.isEmpty() || value.indexOf(0) >= 0 || value.codePointCount(0, value.length()) > limit)
            throw ApiException.invalid(field, "请填写" + label + "（最多 " + limit + " 字）。");
        return value;
    }
}

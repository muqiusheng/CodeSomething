package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.auth.AuthController;
import dev.codesomething.auth.AuthService;
import dev.codesomething.storage.LearningDataSource;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class CommunityController {
    private static final Set<String> ANNOUNCEMENT_CATEGORIES = Set.of("feature", "notice", "maintenance", "exam");
    private static final Set<String> ANNOUNCEMENT_STATES = Set.of("draft", "published", "archived");
    private static final Set<String> FEEDBACK_CATEGORIES = Set.of("feature", "bug", "course", "chat");
    private static final Set<String> FEEDBACK_STATES = Set.of("pending", "reviewed", "planned", "replied", "closed");

    private final JdbcTemplate db;
    private final AuthService auth;

    public CommunityController(LearningDataSource storage, AuthService auth) {
        this.db = new JdbcTemplate(storage.primary());
        this.auth = auth;
    }

    public record AnnouncementInput(String title, String content, String category, Boolean pinned, String status) {}
    public record FeedbackCreate(String category, String title, String content) {}
    public record FeedbackReply(String status, String adminReply) {}
    public record Page(List<Map<String, Object>> items, int page, int size, int total) {}

    // --- Learner endpoints ---

    @GetMapping("/api/v1/announcements")
    List<Map<String, Object>> publishedAnnouncements() {
        return db.queryForList("""
            SELECT id, title, content, category, pinned, published_at, created_at, updated_at
            FROM site_announcements
            WHERE status = 'published'
            ORDER BY pinned DESC, coalesce(published_at, created_at) DESC, created_at DESC
            LIMIT 50
            """);
    }

    @GetMapping("/api/v1/feedback")
    List<Map<String, Object>> myFeedback(HttpServletRequest request) {
        var user = currentLearner(request);
        return db.queryForList("""
            SELECT id, category, title, content, status, admin_reply, replied_at, created_at, updated_at
            FROM learner_feedback
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 100
            """, user.id());
    }

    @PostMapping("/api/v1/feedback")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> createFeedback(@RequestBody FeedbackCreate input, HttpServletRequest request) {
        var user = currentLearner(request);
        String category = Objects.toString(input.category(), "").strip();
        if (!FEEDBACK_CATEGORIES.contains(category)) {
            throw ApiException.invalid("category", "请选择有效的留言分类。");
        }
        String title = requireText(input.title(), "title", 120, "请填写留言标题（最多 120 字）。");
        String content = requireText(input.content(), "content", 2000, "请填写留言内容（最多 2000 字）。");
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        db.update("""
            INSERT INTO learner_feedback(id, user_id, username, category, title, content, status, admin_reply, replied_by, replied_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', '', NULL, NULL, ?, ?)
            """, id, user.id(), user.username(), category, title, content, now, now);
        return db.queryForMap("""
            SELECT id, category, title, content, status, admin_reply, replied_at, created_at, updated_at
            FROM learner_feedback WHERE id = ?
            """, id);
    }

    @DeleteMapping("/api/v1/feedback/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteOwnFeedback(@PathVariable String id, HttpServletRequest request) {
        var user = currentLearner(request);
        var rows = db.queryForList("SELECT user_id, status FROM learner_feedback WHERE id = ?", id);
        if (rows.isEmpty() || !user.id().equals(rows.getFirst().get("user_id"))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FEEDBACK_NOT_FOUND", "留言不存在。", Map.of());
        }
        if (!"pending".equals(rows.getFirst().get("status"))) {
            throw new ApiException(HttpStatus.CONFLICT, "FEEDBACK_ALREADY_HANDLED", "管理员已处理该留言，无法撤回。", Map.of());
        }
        db.update("DELETE FROM learner_feedback WHERE id = ? AND user_id = ?", id, user.id());
    }

    // --- Admin endpoints ---

    @GetMapping("/api/v1/admin/announcements")
    Page adminAnnouncements(@RequestParam(defaultValue = "") String status,
                            @RequestParam(defaultValue = "") String category,
                            @RequestParam(defaultValue = "") String keyword,
                            @RequestParam(defaultValue = "1") int page,
                            @RequestParam(defaultValue = "20") int size) {
        validatePage(page, size);
        String kw = keyword.strip();
        String where = """
            FROM site_announcements
            WHERE (? = '' OR status = ?)
              AND (? = '' OR category = ?)
              AND (? = '' OR instr(lower(title), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0)
            """;
        int total = db.queryForObject("SELECT count(*) " + where, Integer.class,
            status, status, category, category, kw, kw, kw);
        var items = db.queryForList(
            "SELECT id, title, content, category, pinned, status, author_id, published_at, created_at, updated_at " + where
                + " ORDER BY pinned DESC, updated_at DESC, id LIMIT ? OFFSET ?",
            status, status, category, category, kw, kw, kw, size, (page - 1L) * size);
        return new Page(items, page, size, total);
    }

    @PostMapping("/api/v1/admin/announcements")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> createAnnouncement(@RequestBody AnnouncementInput input, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        String title = requireText(input.title(), "title", 120, "请填写公告标题（最多 120 字）。");
        String content = requireText(input.content(), "content", 4000, "请填写公告内容（最多 4000 字）。");
        String category = Objects.toString(input.category(), "feature").strip();
        if (!ANNOUNCEMENT_CATEGORIES.contains(category)) {
            throw ApiException.invalid("category", "请选择有效的公告分类。");
        }
        String status = Objects.toString(input.status(), "published").strip();
        if (!ANNOUNCEMENT_STATES.contains(status)) {
            throw ApiException.invalid("status", "请选择有效的公告状态。");
        }
        int pinned = Boolean.TRUE.equals(input.pinned()) ? 1 : 0;
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        String publishedAt = "published".equals(status) ? now : null;
        db.update("""
            INSERT INTO site_announcements(id, title, content, category, pinned, status, author_id, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, id, title, content, category, pinned, status, admin.userId(), publishedAt, now, now);
        auth.audit(admin.userId(), "announcement_created", "announcement", id, status + ":" + title, request.getRemoteAddr());
        return requireAnnouncement(id);
    }

    @PatchMapping("/api/v1/admin/announcements/{id}")
    Map<String, Object> updateAnnouncement(@PathVariable String id, @RequestBody AnnouncementInput input, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        var existing = requireAnnouncement(id);
        String title = input.title() != null ? requireText(input.title(), "title", 120, "请填写公告标题（最多 120 字）。") : (String) existing.get("title");
        String content = input.content() != null ? requireText(input.content(), "content", 4000, "请填写公告内容（最多 4000 字）。") : (String) existing.get("content");
        String category = input.category() != null ? input.category().strip() : (String) existing.get("category");
        if (!ANNOUNCEMENT_CATEGORIES.contains(category)) {
            throw ApiException.invalid("category", "请选择有效的公告分类。");
        }
        String status = input.status() != null ? input.status().strip() : (String) existing.get("status");
        if (!ANNOUNCEMENT_STATES.contains(status)) {
            throw ApiException.invalid("status", "请选择有效的公告状态。");
        }
        int pinned = input.pinned() != null ? (input.pinned() ? 1 : 0) : ((Number) existing.get("pinned")).intValue();
        String now = Instant.now().toString();
        String publishedAt = (String) existing.get("published_at");
        if ("published".equals(status) && (publishedAt == null || publishedAt.isBlank())) {
            publishedAt = now;
        }
        db.update("""
            UPDATE site_announcements
            SET title = ?, content = ?, category = ?, pinned = ?, status = ?, published_at = ?, updated_at = ?
            WHERE id = ?
            """, title, content, category, pinned, status, publishedAt, now, id);
        auth.audit(admin.userId(), "announcement_updated", "announcement", id, status + ":" + title, request.getRemoteAddr());
        return requireAnnouncement(id);
    }

    @DeleteMapping("/api/v1/admin/announcements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteAnnouncement(@PathVariable String id, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        var existing = requireAnnouncement(id);
        db.update("DELETE FROM site_announcements WHERE id = ?", id);
        auth.audit(admin.userId(), "announcement_deleted", "announcement", id, Objects.toString(existing.get("title"), ""), request.getRemoteAddr());
    }

    @GetMapping("/api/v1/admin/feedback")
    Map<String, Object> adminFeedback(@RequestParam(defaultValue = "") String status,
                                      @RequestParam(defaultValue = "") String category,
                                      @RequestParam(defaultValue = "") String keyword,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int size) {
        validatePage(page, size);
        String kw = keyword.strip();
        String where = """
            FROM learner_feedback
            WHERE (? = '' OR status = ?)
              AND (? = '' OR category = ?)
              AND (? = '' OR instr(lower(username), lower(?)) > 0
                   OR instr(lower(title), lower(?)) > 0
                   OR instr(lower(content), lower(?)) > 0)
            """;
        int total = db.queryForObject("SELECT count(*) " + where, Integer.class,
            status, status, category, category, kw, kw, kw, kw);
        int pendingCount = db.queryForObject("SELECT count(*) FROM learner_feedback WHERE status = 'pending'", Integer.class);
        var items = db.queryForList("""
            SELECT id, user_id, username, category, title, content, status, admin_reply, replied_by, replied_at, created_at, updated_at
            """ + where + " ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC, id LIMIT ? OFFSET ?",
            status, status, category, category, kw, kw, kw, kw, size, (page - 1L) * size);
        var result = new LinkedHashMap<String, Object>();
        result.put("items", items);
        result.put("page", page);
        result.put("size", size);
        result.put("total", total);
        result.put("pendingCount", pendingCount);
        return result;
    }

    @PatchMapping("/api/v1/admin/feedback/{id}")
    Map<String, Object> replyFeedback(@PathVariable String id, @RequestBody FeedbackReply input, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        var existing = requireFeedback(id);
        String reply = input.adminReply() != null ? input.adminReply().strip() : Objects.toString(existing.get("admin_reply"), "");
        if (reply.length() > 2000 || reply.indexOf(0) >= 0) {
            throw ApiException.invalid("adminReply", "回复内容最多 2000 字。");
        }
        String status = input.status() != null && !input.status().isBlank()
            ? input.status().strip()
            : (!reply.isEmpty() ? "replied" : (String) existing.get("status"));
        if (!FEEDBACK_STATES.contains(status)) {
            throw ApiException.invalid("status", "请选择有效的处理状态。");
        }
        String now = Instant.now().toString();
        String repliedBy = !reply.isEmpty() ? admin.username() : (String) existing.get("replied_by");
        String repliedAt = !reply.isEmpty() ? now : (String) existing.get("replied_at");
        db.update("""
            UPDATE learner_feedback
            SET status = ?, admin_reply = ?, replied_by = ?, replied_at = ?, updated_at = ?
            WHERE id = ?
            """, status, reply, repliedBy, repliedAt, now, id);
        auth.audit(admin.userId(), "feedback_replied", "feedback", id, status, request.getRemoteAddr());
        return requireFeedback(id);
    }

    @DeleteMapping("/api/v1/admin/feedback/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteFeedback(@PathVariable String id, HttpServletRequest request) {
        var admin = AuthController.principal(request).user();
        var existing = requireFeedback(id);
        db.update("DELETE FROM learner_feedback WHERE id = ?", id);
        auth.audit(admin.userId(), "feedback_deleted", "feedback", id, Objects.toString(existing.get("username"), ""), request.getRemoteAddr());
    }

    private Map<String, Object> requireAnnouncement(String id) {
        var rows = db.queryForList("""
            SELECT id, title, content, category, pinned, status, author_id, published_at, created_at, updated_at
            FROM site_announcements WHERE id = ?
            """, id);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "ANNOUNCEMENT_NOT_FOUND", "公告不存在。", Map.of());
        }
        return rows.getFirst();
    }

    private Map<String, Object> requireFeedback(String id) {
        var rows = db.queryForList("""
            SELECT id, user_id, username, category, title, content, status, admin_reply, replied_by, replied_at, created_at, updated_at
            FROM learner_feedback WHERE id = ?
            """, id);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "FEEDBACK_NOT_FOUND", "留言不存在。", Map.of());
        }
        return rows.getFirst();
    }

    private record LearnerIdentity(String id, String username) {}

    private LearnerIdentity currentLearner(HttpServletRequest request) {
        var principal = AuthController.principal(request);
        if (principal != null) {
            return new LearnerIdentity(principal.user().userId(), principal.user().username());
        }
        return new LearnerIdentity("local", "本机学习者");
    }

    private static void validatePage(int page, int size) {
        if (page < 1 || page > 1000 || size < 1 || size > 100) {
            throw ApiException.invalid("page", "分页参数无效。");
        }
    }

    private static String requireText(String value, String field, int max, String message) {
        if (value == null || value.isBlank() || value.strip().length() > max || value.indexOf(0) >= 0) {
            throw ApiException.invalid(field, message);
        }
        return value.strip();
    }
}

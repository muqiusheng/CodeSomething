package dev.codesomething.bookmarks;

import dev.codesomething.api.ApiException;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.*;

@RestController
@DependsOn("flyway")
@RequestMapping("/api/v1/bookmarks")
public class BookmarkController {
    record Target(String id, String category, String title, String source, String href) {}
    record Saved(String id, String category, String title, String source, String href, String createdAt) {}

    private static final RowMapper<Saved> SAVED = (row, index) -> new Saved(
        row.getString("id"), row.getString("category"), row.getString("title"), row.getString("source"),
        row.getString("href"), Instant.ofEpochMilli(row.getLong("created_at")).toString());
    private final JdbcTemplate jdbc;

    BookmarkController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    List<Saved> list() {
        return jdbc.query("""
            SELECT id, category, title, source, href, created_at
            FROM learner_bookmarks ORDER BY created_at DESC, id
            """, SAVED);
    }

    @PostMapping
    Saved add(@RequestBody Target target) {
        String id = validId(target.id());
        String category = target.category();
        if (!("school".equals(category) && id.startsWith("school-")
            || "outside".equals(category) && id.startsWith("outside.")))
            throw ApiException.invalid("category", "请选择有效的收藏分类。");
        String href = validHref(category, target.href());
        return jdbc.queryForObject("""
            INSERT INTO learner_bookmarks(id, category, title, source, href, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source, href=excluded.href
            RETURNING id, category, title, source, href, created_at
            """, SAVED, id, category, text("title", target.title(), 1500), text("source", target.source(), 250),
            href, System.currentTimeMillis());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable String id) {
        jdbc.update("DELETE FROM learner_bookmarks WHERE id = ?", validId(id));
    }

    private static String validId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,279}"))
            throw ApiException.invalid("id", "收藏编号无效。");
        return id;
    }

    private static String text(String field, String value, int limit) {
        if (value == null || value.isBlank() || value.length() > limit)
            throw ApiException.invalid(field, "收藏名称或来源超出可用范围。");
        return value.strip();
    }

    private static String validHref(String category, String href) {
        try {
            if (href == null || href.length() > 1000 || !href.startsWith("/") || href.startsWith("//"))
                throw new IllegalArgumentException();
            var uri = URI.create(href);
            String route = uri.getPath();
            if (uri.isAbsolute() || uri.getAuthority() != null || route == null
                || !route.matches("/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*/?")
                || java.util.Arrays.stream(route.split("/")).anyMatch(part -> part.equals(".") || part.equals(".."))
                || !("school".equals(category) ? route.startsWith("/school/")
                    : route.matches("/(?:learn|projects|portfolio)/.+") || route.equals("/portfolio")))
                throw new IllegalArgumentException();
            return href;
        } catch (IllegalArgumentException failure) {
            throw ApiException.invalid("href", "收藏必须指向有效的站内学习位置。");
        }
    }
}

package dev.codesomething.profile;

import java.time.Instant;
import java.util.Set;
import dev.codesomething.api.ApiException;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/profiles/me/preferences")
@DependsOn("flyway")
public class PreferencesController {
    private final JdbcTemplate jdbc;

    public PreferencesController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Preferences(int dailyMinutes, String motion, long revision, String updatedAt) {}
    public record PreferencePatch(Integer dailyMinutes, String motion) {}

    @GetMapping
    public Preferences read() {
        return jdbc.queryForObject("SELECT daily_minutes, motion, revision, updated_at FROM learner_preferences WHERE id='local'",
            (row, index) -> new Preferences(row.getInt(1), row.getString(2), row.getLong(3), row.getString(4)));
    }

    @PatchMapping(consumes = "application/json")
    @Transactional
    public Preferences update(@RequestBody PreferencePatch patch) {
        var previous = read();
        int minutes = patch.dailyMinutes() == null ? previous.dailyMinutes() : patch.dailyMinutes();
        String motion = patch.motion() == null ? previous.motion() : patch.motion();
        if (!Set.of(30, 60, 90).contains(minutes)) throw ApiException.invalid("dailyMinutes", "每日时长请选择30、60或90分钟。");
        if (!Set.of("system", "reduce").contains(motion)) throw ApiException.invalid("motion", "动效偏好请选择跟随系统或减少动效。");
        jdbc.update("UPDATE learner_preferences SET daily_minutes=?, motion=?, revision=revision+1, updated_at=? WHERE id='local'",
            minutes, motion, Instant.now().toString());
        return read();
    }
}

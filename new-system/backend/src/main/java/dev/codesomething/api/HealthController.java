package dev.codesomething.api;

import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate jdbc;
    private final dev.codesomething.tutor.TutorController tutor;
    public HealthController(JdbcTemplate jdbc,dev.codesomething.tutor.TutorController tutor) { this.jdbc = jdbc;this.tutor=tutor; }

    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        jdbc.queryForObject("SELECT 1", Integer.class);
        return Map.of("status", "UP", "database", Map.of("status", "UP", "engine", "sqlite"),
            "runner", Map.of("status", "not-configured"), "tutor", tutor.connection());
    }
}

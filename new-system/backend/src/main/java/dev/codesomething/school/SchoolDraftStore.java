package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
class SchoolDraftStore {
    record Execution(String sql, SchoolLabRunner.RunResult result) {}
    record Draft(long revision, Map<String, String> drafts, Map<String, Execution> executions) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;

    SchoolDraftStore(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Draft read(String course, String lab) {
        return jdbc.query("SELECT payload FROM school_lab_drafts WHERE course_id=? AND lab_id=?",
            (row, index) -> json.readValue(row.getString(1), Draft.class), course, lab)
            .stream().findFirst().orElse(new Draft(0, Map.of(), Map.of()));
    }

    Draft save(String course, String lab, long revision, Map<String, String> sql, Map<String, Execution> executions) {
        var currentResults = new LinkedHashMap<String, Execution>();
        executions.forEach((id, execution) -> {
            if (Objects.equals(sql.get(id), execution.sql())) currentResults.put(id, execution);
        });
        var draft = new Draft(revision + 1, sql, currentResults);
        var payload = json.writeValueAsString(draft);
        int changed = revision == 0
            ? jdbc.update("INSERT INTO school_lab_drafts(course_id,lab_id,revision,payload) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
                course, lab, draft.revision(), payload)
            : jdbc.update("UPDATE school_lab_drafts SET revision=?,payload=? WHERE course_id=? AND lab_id=? AND revision=?",
                draft.revision(), payload, course, lab, revision);
        if (changed != 1) throw conflict();
        return draft;
    }

    static ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "SCHOOL_DRAFT_CONFLICT", "另一页面已保存更新。请先复制当前编辑内容，再重新载入实验。", Map.of());
    }
}

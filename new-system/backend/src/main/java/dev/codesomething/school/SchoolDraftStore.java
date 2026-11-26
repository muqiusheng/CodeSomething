package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.time.Instant;
import java.util.UUID;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
class SchoolDraftStore {
    record Execution(String sql, SchoolLabRunner.RunResult result, ExamStore.Item grade) {
        Execution(String sql, SchoolLabRunner.RunResult result) { this(sql, result, null); }
        boolean completed(boolean grading) {
            return grading ? grade != null && grade.status().equals("correct") : result.status().equals("ok");
        }
    }
    record Draft(long revision, Map<String, String> drafts, Map<String, Execution> executions) {}

    private final JdbcTemplate jdbc;
    private final JsonMapper json;
    private final org.springframework.transaction.support.TransactionTemplate transactions;

    SchoolDraftStore(JdbcTemplate jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
        this.transactions = new org.springframework.transaction.support.TransactionTemplate(
            new org.springframework.jdbc.support.JdbcTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
    }

    Draft read(String course, String lab) {
        return jdbc.query("SELECT payload FROM school_lab_drafts WHERE course_id=? AND lab_id=?",
            (row, index) -> json.readValue(row.getString(1), Draft.class), course, lab)
            .stream().findFirst().orElse(new Draft(0, Map.of(), Map.of()));
    }

    Draft read(String course, SchoolCourseCatalog.Lab lab) {
        return visible(read(course, lab.id()), lab);
    }

    static Draft visible(Draft draft, SchoolCourseCatalog.Lab lab) {
        var scripts = new LinkedHashMap<String, String>();
        var executions = new LinkedHashMap<String, Execution>();
        for (var question : lab.questions()) {
            String id = question.id();
            if (draft.drafts().containsKey(id)) scripts.put(id, draft.drafts().get(id));
            var execution = draft.executions().get(id);
            if (execution != null && (execution.grade() == null
                || question.gradingRevision() == null || execution.grade().question().id().equals(question.gradingId(lab.id()))))
                executions.put(id, execution);
        }
        return new Draft(draft.revision(), scripts, executions);
    }

    Draft save(String course, SchoolCourseCatalog.Lab definition, long revision, Map<String, String> sql,
               Map<String, Execution> executions) {
        return save(course,definition,revision,sql,executions,null,false);
    }

    Draft save(String course, SchoolCourseCatalog.Lab definition, long revision, Map<String, String> sql,
               Map<String, Execution> executions,String event,boolean passed) {
        String lab = definition.id();
        var previous = read(course, lab);
        if (previous.revision() != revision) throw conflict();
        var currentSql = new LinkedHashMap<>(sql);
        var currentResults = new LinkedHashMap<String, Execution>();
        var active = definition.questions().stream().map(SchoolCourseCatalog.Question::id).collect(java.util.stream.Collectors.toSet());
        previous.drafts().forEach((id, script) -> {
            if (!active.contains(id)) currentSql.put(id, script);
        });
        var retained = new LinkedHashMap<>(previous.executions());
        retained.putAll(executions);
        retained.forEach((id, execution) -> {
            if (Objects.equals(currentSql.get(id), execution.sql())) currentResults.put(id, execution);
        });
        var draft = new Draft(revision + 1, currentSql, currentResults);
        var payload = json.writeValueAsString(draft);
        return transactions.execute(transaction -> {
            int changed = revision == 0
            ? jdbc.update("INSERT INTO school_lab_drafts(course_id,lab_id,revision,payload) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
                course, lab, draft.revision(), payload)
            : jdbc.update("UPDATE school_lab_drafts SET revision=?,payload=? WHERE course_id=? AND lab_id=? AND revision=?",
                draft.revision(), payload, course, lab, revision);
            if (changed != 1) throw conflict();
            if (event != null) activity(jdbc,course,lab,event,passed);
            return visible(draft, definition);
        });
    }

    void activity(String course,String lab,String event) {
        activity(jdbc,course,lab,event,false);
    }

    private static void activity(JdbcTemplate target,String course,String lab,String event,boolean passed) {
        target.update("INSERT INTO school_lab_activity VALUES(?,?,?,?,?,?)",UUID.randomUUID().toString(),
            course,lab,event,passed,Instant.now().toString());
    }

    static ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "SCHOOL_DRAFT_CONFLICT", "另一页面已保存更新。请先复制当前编辑内容，再重新载入实验。", Map.of());
    }
}

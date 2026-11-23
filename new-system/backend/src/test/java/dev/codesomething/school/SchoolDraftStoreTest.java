package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SchoolDraftStoreTest {
    @Test
    void draftRevisionsRejectStaleWritesAndResultsFollowTheExecutedSql() {
        try (var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            var jdbc = new JdbcTemplate(source);
            jdbc.execute("CREATE TABLE school_lab_drafts (course_id TEXT, lab_id TEXT, revision INTEGER, payload TEXT, PRIMARY KEY(course_id,lab_id))");
            var store = new SchoolDraftStore(jdbc, JsonMapper.builder().build());
            var sql = "SELECT 1";
            var result = new SchoolLabRunner.RunResult("ok", 2, null,
                List.of(new SchoolLabRunner.ResultTable(List.of("n"), List.of(List.of("1")))), null);
            var first = store.save("course", "lab", 0, Map.of("q1", sql),
                Map.of("q1", new SchoolDraftStore.Execution(sql, result)));
            assertEquals(1, first.revision());
            assertEquals(result, store.read("course", "lab").executions().get("q1").result());
            assertThrows(ApiException.class, () -> store.save("course", "lab", 0, Map.of(), Map.of()));
            store.save("course", "lab", 1, Map.of("q1", "SELECT 2"), first.executions());
            assertTrue(store.read("course", "lab").executions().isEmpty());
            assertTrue(store.read("course", "another-lab").drafts().isEmpty());
        }
    }
}

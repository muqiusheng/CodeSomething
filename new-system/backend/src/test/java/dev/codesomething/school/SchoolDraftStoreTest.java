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
            var question = new SchoolCourseCatalog.Question("q1", "查询", "运行查询", "", false, "", "", null);
            var lab = new SchoolCourseCatalog.Lab("lab", "", "", List.of(question), "", "", List.of(), "");
            var anotherLab = new SchoolCourseCatalog.Lab("another-lab", "", "", List.of(question), "", "", List.of(), "");
            var sql = "SELECT 1";
            var result = new SchoolLabRunner.RunResult("ok", 2, null,
                List.of(new SchoolLabRunner.ResultTable(List.of("n"), List.of(List.of("1")))), null);
            var first = store.save("course", lab, 0, Map.of("q1", sql),
                Map.of("q1", new SchoolDraftStore.Execution(sql, result)));
            assertEquals(1, first.revision());
            assertEquals(result, store.read("course", lab).executions().get("q1").result());
            assertThrows(ApiException.class, () -> store.save("course", lab, 0, Map.of(), Map.of()));
            store.save("course", lab, 1, Map.of("q1", "SELECT 2"), first.executions());
            assertTrue(store.read("course", lab).executions().isEmpty());
            assertTrue(store.read("course", anotherLab).drafts().isEmpty());
        }
    }
    @Test
    void keepsRetiredDraftsAndRequiresNewEvidenceForRewrittenQuestions() {
        try (var source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            var jdbc = new JdbcTemplate(source);
            jdbc.execute("CREATE TABLE school_lab_drafts (course_id TEXT, lab_id TEXT, revision INTEGER, payload TEXT, PRIMARY KEY(course_id,lab_id))");
            var store = new SchoolDraftStore(jdbc, JsonMapper.builder().build());
            var retired = new SchoolCourseCatalog.Question("q01", "查看连接", "", "", false, "", "", null);
            var old = new SchoolCourseCatalog.Question("q02", "查看建表定义", "", "", false, "", "", null);
            var original = new SchoolCourseCatalog.Lab("lab", "", "", List.of(retired, old), "", "", List.of(), "");
            var create = new SchoolCourseCatalog.Question("q02", "创建表", "", "", false, "", "", "create");
            var updated = new SchoolCourseCatalog.Lab("lab", "", "", List.of(create), "", "", List.of(), "");
            String sql = "SHOW COLUMNS FROM student;";
            var result = new SchoolLabRunner.RunResult("ok", 2, null, List.of(), null);
            var question = new ExamCatalog.VisibleQuestion("lab-q02", "sql", 10, "", "lab", List.of(), List.of(), null, 0);
            var grade = new ExamStore.Item(question, List.of(sql), 10, "correct", "", List.of(), List.of(), null, List.of(), null);
            store.save("course", original, 0, Map.of("q01", "SELECT DATABASE();", "q02", sql),
                Map.of("q02", new SchoolDraftStore.Execution(sql, result, grade)));
            var opened = store.read("course", updated);
            assertEquals(Map.of("q02", sql), opened.drafts());
            assertTrue(opened.executions().isEmpty());
            store.save("course", updated, opened.revision(), opened.drafts(), opened.executions());
            assertEquals("SELECT DATABASE();", store.read("course", original).drafts().get("q01"));
            assertEquals(10, store.read("course", original).executions().get("q02").grade().score());
        }
    }

}

package dev.codesomething.school;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class SchoolExamCatalogTest {
    @Test void databaseExamPacksHaveTheRequiredCoverageAndNoAnswerLeaksInVisibleQuestions() {
        var json = JsonMapper.builder().build();
        var courses = new SchoolCourseCatalog("../course-packs", json);
        var pack = new ExamCatalog("../course-packs", json, courses).pack("database-systems");
        var exams = pack.papers();
        assertEquals(11, exams.size());
        assertEquals(7, exams.stream().filter(p -> p.group().equals("specialty")).map(ExamCatalog.Paper::labId).distinct().count());
        assertEquals(4, exams.stream().filter(p -> p.group().equals("mock")).count());
        var promptIds = new HashMap<String, String>();
        var labPrompts = new java.util.HashSet<String>();
        var course = courses.course("database-systems");
        for (var outline : course.labs()) {
            for (var task : courses.lab(course, outline.id()).questions()) {
                labPrompts.add(normalize(task.title()));
                labPrompts.add(normalize(task.requirement()));
            }
        }
        for (var exam : exams) {
            assertEquals(25, exam.questions().size());
            for (var entry : java.util.Map.of("choice", 10L, "boolean", 5L, "blank", 5L, "sql", 5L).entrySet())
                assertEquals(entry.getValue(), exam.questions().stream().filter(q -> q.kind().equals(entry.getKey())).count());
            assertEquals(100, exam.questions().stream().mapToInt(ExamCatalog.Question::points).sum());
            if (exam.group().equals("mock"))
                assertEquals(7, exam.questions().stream().map(ExamCatalog.Question::labId).distinct().count(), exam.id());
            for (var question : exam.questions()) {
                String normalizedPrompt = normalize(question.prompt());
                assertFalse(labPrompts.contains(normalizedPrompt), question.id());
                if (question.kind().equals("sql")) {
                    assertEquals(List.of(2, 5, 3), question.checks().stream().map(ExamCatalog.Check::points).toList(), question.id());
                    assertTrue(question.prompt().contains("### 涉及数据表："), question.id());
                    assertTrue(question.prompt().contains("| 列名 | 数据类型 | 约束 / 默认值 | 含义说明 |"), question.id());
                    boolean createsTable = question.referenceSql().stripLeading().matches("(?is)^CREATE TABLE\\b.*");
                    assertTrue(createsTable ? question.prompt().contains(" · 待创建")
                        : question.prompt().contains("**数据预览"), question.id());
                }
                String previousId = promptIds.putIfAbsent(normalizedPrompt, question.id());
                assertNull(previousId, () -> "Repeated prompt: " + previousId + " / " + question.id());
                var visible = json.valueToTree(ExamCatalog.visible(question, List.of("C","D","B","A")));
                for (var secret : List.of("answer", "blanks", "explanation", "referenceSql", "setupSql", "checks"))
                    assertFalse(visible.has(secret), secret);
            }
        }
        assertEquals(275, promptIds.size());
        var current = pack.byPaperId().get("exam-lab-01");
        var historicalSql = pack.questions().get("exam-lab-01-q31");
        assertEquals(15, historicalSql.points());
        assertEquals(1, pack.origins().get(historicalSql.id()).version());
        assertFalse(current.questions().contains(historicalSql));
        var previousMock = pack.origins().get("exam-mock-01-r3-q21");
        assertEquals(3, previousMock.version());
        assertEquals(25, previousMock.questions().size());
        assertEquals(4, pack.byPaperId().get("exam-mock-01").version());
    }

    @Test void revisedLabTasksHaveOneCoreStatementAndPrivateExplanations() {
        var catalog = new SchoolCourseCatalog("../course-packs", JsonMapper.builder().build());
        var course = catalog.course("database-systems");
        for (var outline : course.labs()) {
            var lab = catalog.lab(course, outline.id());
            var rules = catalog.labChecks(course, lab);
            for (var task : lab.questions()) {
                var rule = rules.get(task.id());
                assertFalse(rule.explanation().isBlank(), rule.id());
                if ("split".equals(task.gradingRevision()))
                    assertEquals(1, ExamSqlScript.split(rule.referenceSql()).size(), rule.id());
            }
        }
    }

    private static String normalize(String prompt) {
        return Normalizer.normalize(prompt, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
    }
}

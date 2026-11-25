package dev.codesomething.school;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.util.List;

class SchoolExamRulesTest {
    @Test void returnsSolutionsOnlyForTheOwnedPracticeDraftOrSubmittedAttempt() {
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var courses = new SchoolCourseCatalog("../course-packs", json);
        var catalog = new ExamCatalog("../course-packs", json, courses);
        var store = org.mockito.Mockito.mock(ExamStore.class);
        org.mockito.Mockito.when(store.start(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any()))
            .thenAnswer(call -> call.getArgument(1));
        var controller = new SchoolExamController(catalog, store, null);
        String course = "database-systems", paper = "exam-lab-01";
        var practice = controller.start(course, paper, new SchoolExamController.Start("practice", 0, true, null, null));
        var exam = controller.start(course, paper, new SchoolExamController.Start("exam", 60, false, null, null));
        org.mockito.Mockito.when(store.draft(course, practice.draft().id())).thenReturn(practice.draft());
        org.mockito.Mockito.when(store.draft(course, exam.draft().id())).thenReturn(exam.draft());
        var index = catalog.pack(course).questions();
        for (String kind : List.of("choice", "boolean", "blank", "sql")) {
            var q = practice.questions().stream().filter(item -> item.kind().equals(kind)).findFirst().orElseThrow();
            var expected = index.get(q.id());
            var solution = controller.solution(course, paper, practice.draft().id(), q.id());
            assertEquals(expected.explanation(), solution.explanation());
            switch (kind) {
                case "choice", "boolean" -> assertEquals(List.of(expected.answer()), solution.correct());
                case "blank" -> assertEquals(expected.blanks(), solution.acceptedBlanks());
                case "sql" -> assertEquals(expected.referenceSql(), solution.referenceSql());
            }
            var denied = assertThrows(dev.codesomething.api.ApiException.class,
                () -> controller.solution(course, paper, exam.draft().id(), q.id()));
            assertEquals(org.springframework.http.HttpStatus.FORBIDDEN, denied.status);
        }
        assertThrows(dev.codesomething.api.ApiException.class,
            () -> controller.solution(course, "exam-lab-02", practice.draft().id(), practice.questions().getFirst().id()));
        assertThrows(dev.codesomething.api.ApiException.class,
            () -> controller.solution(course, paper, practice.draft().id(), "unrelated-question"));
        var item = new ExamStore.Item(exam.questions().getFirst(), List.of(), 0, "wrong", "stored explanation",
            List.of("A"), List.of(), null, List.of());
        var summary = new ExamStore.Summary(exam.draft().id(), paper, "paper", "exam", 0, 100, "待提升",
            java.util.Map.of(), 1, 1, true);
        org.mockito.Mockito.when(store.findAttempt(course, exam.draft().id(), paper))
            .thenReturn(java.util.Optional.of(new ExamStore.Attempt(summary, List.of(item))));
        assertEquals("stored explanation", controller.solution(course, paper, exam.draft().id(), item.question().id()).explanation());
    }

    @Test void labSolutionsComeFromThePrivateCheckConfiguration() {
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var catalog = new SchoolCourseCatalog("../course-packs", json);
        var controller = new SchoolCourseController(catalog, null, null, null, null, null, null);
        var solution = controller.solution("database-systems", "lab-03-single-query", "q01");
        assertEquals("SELECT * FROM student;", solution.referenceSql());
        assertFalse(solution.explanation().isBlank());
        var lab = catalog.lab(catalog.course("database-systems"), "lab-03-single-query");
        var initial = json.valueToTree(lab.questions().getFirst());
        assertFalse(initial.has("referenceSql"));
        assertFalse(initial.has("explanation"));
    }

    @Test void blanksNormalizeWithoutChangingStringLiterals() {
        assertEquals("select sno from student", ExamRules.normalize(" SELECT   \u0060Sno\u0060 FROM student ; "));
        assertNotEquals(ExamRules.normalize("'A  b'"), ExamRules.normalize("'a b'"));
    }

    @Test void blanksRecognizeMySqlTypeAndComparisonAliases() {
        assertEquals(ExamRules.normalize("Grade <> 0"), ExamRules.normalize("Grade != 0"));
        assertEquals(ExamRules.normalize("INT(11)"), ExamRules.normalize("integer ( 11 )"));
        assertEquals(ExamRules.normalize("course(Cno)"), ExamRules.normalize(" \u0060course\u0060 ( Cno ) ;"));
        assertNotEquals(ExamRules.normalize("'integer != 0'"), ExamRules.normalize("'int <> 0'"));
        assertNotEquals(ExamRules.normalize("\u0060integer\u0060"), ExamRules.normalize("int"));
        assertNotEquals(ExamRules.normalize("Grade ! = 0"), ExamRules.normalize("Grade <> 0"));
    }

    @Test void splitsDelimiterBlocksAndPreservesSourceLines() {
        var steps = ExamSqlScript.split("-- heading\nSELECT ';';\nDELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n SELECT \"$$\";\nEND$$\nDELIMITER ;\n/* x ; */ SELECT 2;");
        assertEquals(List.of(2, 4, 9), steps.stream().map(ExamSqlScript.Step::startLine).toList());
        assertEquals(7, steps.get(1).endLine());
        assertTrue(steps.get(1).sql().contains("SELECT \"$$\";"));
    }

    @Test void mapsClientAndServerErrorOffsets() {
        var error = ExamSqlScript.diagnostic("ERROR 1064 (42000) at line 3: syntax error near 'broken' at line 2", 8, 11, 2);
        assertEquals(9, error.line());
        assertTrue(error.advice().contains("SQL 语法错误"));
        assertEquals("ERROR 1064 (42000) at line 9: syntax error near 'broken' at line 9", error.raw());

        var runtime = ExamSqlScript.diagnostic("ERROR 1054 (42S22) at line 64: Unknown column 'MissingColumn' in 'field list'", 2, 2, 63);
        assertEquals(2, runtime.line());
        assertEquals("ERROR 1054 (42S22) at line 2: Unknown column 'MissingColumn' in 'field list'", runtime.raw());
    }

    @Test void givesSpecificAdviceForKnownErrorsAndNeutralAdviceForUnknownErrors() {
        var expected = java.util.Map.of(3822, "CHECK 约束名冲突", 1050, "数据表已存在", 1054, "未知列名",
            1062, "重复键值", 1064, "SQL 语法错误", 1146, "数据表不存在", 1451, "子表引用",
            1452, "父表无对应键值", 3819, "违反 CHECK", 1055, "GROUP BY");
        expected.forEach((code, advice) -> assertTrue(
            ExamSqlScript.diagnostic("ERROR " + code + " (HY000) at line 1: MySQL message", 1, 1, 0)
                .advice().contains(advice), "MySQL error " + code));
        var unknown = ExamSqlScript.diagnostic("ERROR 1213 (40001) at line 1: Deadlock found", 1, 1, 0);
        assertEquals("请结合下方 MySQL 原始报错信息，检查出错行的语法与对象定义。", unknown.advice());
    }

    @Test void differenceIgnoresColumnNameCaseWhenCheckingColumnNames() {
        var expected = List.of(new SchoolLabRunner.ResultTable(List.of("Sno", "Cno", "Chosen"), List.of(List.of("20110001", "001", "3"))));
        var lower = List.of(new SchoolLabRunner.ResultTable(List.of("sno", "cno", "chosen"), List.of(List.of("20110001", "001", "3"))));
        var wrong = List.of(new SchoolLabRunner.ResultTable(List.of("sno", "cno", "cnt"), List.of(List.of("20110001", "001", "3"))));
        var matched = ExamSqlRunner.difference(expected, lower, true, true);
        assertTrue(matched.match());
        assertFalse(matched.columnsDiffer());
        var mismatched = ExamSqlRunner.difference(expected, wrong, true, true);
        assertFalse(mismatched.match());
        assertTrue(mismatched.columnsDiffer());
    }

    @Test void deserializesLegacyItemAndCheckResultJsonWithoutNewFields() {
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        String legacy = """
            {"question":{"id":"q1","kind":"sql","points":15,"prompt":"p","labId":"lab-01-workbench","tags":["t"],"options":[],"template":null,"blankCount":0},
             "answer":["SELECT 1;"],"score":15,"status":"correct","explanation":"e","correct":[],"acceptedBlanks":[],"referenceSql":"SELECT 1;",
             "checks":[{"label":"脚本执行成功","points":3,"score":3,"status":"passed","message":"通过","diff":null,"expected":[],"actual":[]}]}
            """;
        var item = json.readValue(legacy, ExamStore.Item.class);
        assertNull(item.sqlError());
        assertEquals(1, item.checks().size());
        assertNull(item.checks().getFirst().kind());
        assertNull(item.checks().getFirst().errorLine());
        assertNull(item.checks().getFirst().advice());
    }
}

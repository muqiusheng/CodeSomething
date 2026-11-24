package dev.codesomething.school;

import dev.codesomething.sql.MysqlEnvironment;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "CS_RUN_DOCKER_TESTS", matches = "true")
class SchoolExamMysqlTest {
    @TempDir Path temporary;

    @Test void verifiesEveryReferenceAndRepresentativeFailuresInTheRealSchoolContainer() throws Exception {
        String pack = "../course-packs";
        var json = JsonMapper.builder().build();
        var courses = new SchoolCourseCatalog(pack, json);
        var catalog = new ExamCatalog(pack, json, courses);
        var storage = temporary.toString();
        var mysql = new MysqlEnvironment(null, "docker", "cs-sql-exam-test", false, storage, 0);
        var labs = new SchoolLabRunner(courses, new SchoolStudent(storage), mysql, storage, true);
        var runner = new ExamSqlRunner(courses, labs);
        var course = courses.course("database-systems");
        var container = labs.activeContainer(course);
        try {
            var initial = labs.run(course, java.util.Map.of("q", "SELECT * FROM sc ORDER BY Sno,Cno;"), null).get("q");
            assertEquals("ok", initial.status(), initial.toString());
            var seeded = labs.run(course, java.util.Map.of("q", """
                SELECT s.Sno FROM student s WHERE NOT EXISTS (
                    SELECT 1 FROM course c WHERE NOT EXISTS (
                        SELECT 1 FROM sc x WHERE x.Sno=s.Sno AND x.Cno=c.Cno
                    )
                );
                """), null).get("q");
            assertEquals(List.of(List.of("20110998")), seeded.tables().getFirst().rows());

            var questions = catalog.papers(course.id()).stream().flatMap(p -> p.questions().stream())
                .filter(q -> q.kind().equals("sql")).toList();
            assertEquals(55, questions.size());
            var failures = new java.util.ArrayList<String>();
            long firstPass = System.nanoTime();
            for (var q : questions) {
                try {
                    var result = runner.grade(course.id(), q, q.referenceSql());
                    if (result.score() != 10) failures.add(q.id() + " " + result);
                    else System.out.println(q.id() + " 10/10");
                } catch (RuntimeException e) {
                    failures.add(q.id() + " " + e);
                }
            }
            System.out.println("55 cold reference grades = " + millis(firstPass) + " ms");
            assertTrue(failures.isEmpty(), () -> String.join("\n", failures));
            var current = questions.stream().collect(java.util.stream.Collectors.toMap(ExamCatalog.Question::id, q -> q));
            var allProjects = current.get("exam-mock-04-r4-q21");
            var onlyBaseCase = "SELECT mat_num,mat_name,speci FROM Stock WHERE FALSE ORDER BY mat_num;";
            assertEquals(7, runner.grade(course.id(), allProjects, onlyBaseCase).score());
            var orderedStock = current.get("exam-lab-01-r3-q24");
            assertEquals(10, runner.grade(course.id(), orderedStock,
                "SELECT mat_num AS MAT_NUM,mat_name AS DISPLAY_NAME FROM Stock ORDER BY mat_num;").score());
            var checkedView = current.get("exam-mock-01-r4-q25");
            assertEquals(7, runner.grade(course.id(), checkedView, checkedView.referenceSql().replace(" WITH CHECK OPTION", "")).score());

            var archive = catalog.pack(course.id()).questions();
            var query = archive.get("exam-lab-03-q31");
            var coldRunner = new ExamSqlRunner(courses, labs);
            long began = System.nanoTime();
            var cold = coldRunner.grade(course.id(), query, query.referenceSql());
            System.out.println("Single SQL grade, cold reference = " + millis(began) + " ms");
            int cacheSize = coldRunner.referenceCacheSize();
            assertTrue(cacheSize > 0);
            began = System.nanoTime();
            var warm = coldRunner.grade(course.id(), query, query.referenceSql());
            System.out.println("Single SQL grade, warm reference = " + millis(began) + " ms");
            assertEquals(15, warm.score());
            assertEquals(cold, warm);
            assertEquals(cacheSize, coldRunner.referenceCacheSize());

            var empty = new ExamCatalog.Question("empty-result-test", "sql", 15, "测试", query.labId(), query.tags(),
                "测试", null, null, null, null, "SELECT Sno AS exact_label FROM student WHERE FALSE", null,
                List.of(new ExamCatalog.Check("result_set", "空结果列名", 15, null, null, null, null, null, true, true, null)));
            assertEquals(15, runner.grade(course.id(), empty, empty.referenceSql()).score());
            var wrongAlias = runner.grade(course.id(), empty, empty.referenceSql().replace("exact_label", "wrong_label"));
            assertEquals(0, wrongAlias.score());
            assertTrue(wrongAlias.checks().getFirst().diff().columnsDiffer());

            var audit = archive.get("exam-lab-07-q32");
            began = System.nanoTime();
            var schema = runner.debug(course.id(), audit, "", "schema", 0);
            System.out.println("Schema preview, cold = " + millis(began) + " ms");
            assertEquals("ok", schema.status(), schema.toString());
            assertTrue(schema.steps().stream().anyMatch(step -> step.summary().contains("grade_audit")));
            assertSame(schema, runner.debug(course.id(), audit, "", "schema", 0));
            var admissions = archive.get("exam-mock-03-q32");
            var schemas = runner.debug(course.id(), admissions, "", "schema", 0);
            assertTrue(schemas.steps().stream().anyMatch(step -> step.summary().contains("audit_insert")), schemas.toString());

            began = System.nanoTime();
            var tracedAudit = runner.debug(course.id(), audit, """
                INSERT INTO grade_audit VALUES ('20110001','001',70,80);
                CREATE TABLE trace_added (ID INT PRIMARY KEY);
                ALTER TABLE trace_added ADD COLUMN memo VARCHAR(24);
                INSERT INTO trace_added VALUES (1,'preview row');
                """, "trace", 0);
            System.out.println("Four-step dynamic debug = " + millis(began) + " ms");
            assertEquals("ok", tracedAudit.status(), tracedAudit.toString());
            assertEquals("grade_audit", tracedAudit.steps().get(0).changes().getFirst().table());
            assertEquals("trace_added", tracedAudit.steps().get(1).changes().getFirst().table());
            assertEquals(List.of("ID", "memo"), tracedAudit.steps().get(2).changes().getFirst().preview().columns());
            assertEquals(List.of(List.of("1", "preview row")), tracedAudit.steps().get(3).changes().getFirst().preview().rows());

            var byId = archive;
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-03-q31"),
                "SELECT sno, cno, grade FROM sc WHERE grade>=80 ORDER BY grade DESC, sno, cno;").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-03-q32"),
                "SELECT cno, COUNT(*) AS chosen, COUNT(grade) AS graded FROM sc GROUP BY cno HAVING COUNT(*)>=3 ORDER BY cno;").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-mock-01-q31"),
                "SELECT c.cno, c.cname, COUNT(x.sno) AS chosen, COUNT(CASE WHEN x.grade>=60 THEN 1 END) AS passed FROM course c LEFT JOIN sc x ON x.cno=c.cno GROUP BY c.cno, c.cname ORDER BY chosen DESC, c.cno;").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-01-q32"),
                "CREATE TABLE enrollment_note (sno CHAR(8), cno CHAR(3), note VARCHAR(50), PRIMARY KEY(sno, cno), FOREIGN KEY(sno, cno) REFERENCES sc(sno, cno));").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-02-q31"),
                "ALTER TABLE course ADD COLUMN note VARCHAR(40); UPDATE course SET note='期末复习' WHERE cno='006';").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-05-q31"),
                "CREATE VIEW v_cs AS SELECT sno, sname, sdept FROM student WHERE sdept='计算机系' WITH CHECK OPTION;").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-05-q32"),
                "CREATE VIEW v_course_counts AS SELECT c.cno, COUNT(x.sno) AS chosen, COUNT(x.grade) AS graded FROM course c LEFT JOIN sc x ON x.cno=c.cno GROUP BY c.cno;").score());
            assertEquals(15, runner.grade(course.id(), byId.get("exam-lab-07-q31"),
                "DELIMITER $$\nCREATE TRIGGER GRADE_GATE BEFORE INSERT ON sc FOR EACH ROW\nBEGIN\n IF NEW.grade<60 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='分数低于登记下限'; END IF;\nEND$$\nDELIMITER ;").score());

            began = System.nanoTime();
            assertEquals("ok", runner.debug(course.id(), query, "SELECT Sno,Grade FROM sc WHERE Cno='001'", "run", 0).status());
            System.out.println("Single statement debug = " + millis(began) + " ms");
            var syntaxErr = runner.grade(course.id(), query, "SELECT Sno FROM sc;\nSELEC Sno FROM sc;");
            assertEquals(0, syntaxErr.score());
            assertEquals(2, syntaxErr.errorLine());
            assertNotNull(syntaxErr.error());
            assertEquals(2, syntaxErr.error().line());
            assertTrue(syntaxErr.error().raw().contains("at line 2:"), syntaxErr.error().raw());
            assertTrue(syntaxErr.error().advice().contains("DELIMITER"), syntaxErr.error().advice());
            assertTrue(syntaxErr.checks().stream().allMatch(check -> Integer.valueOf(2).equals(check.errorLine()) && check.advice() != null));
            var unknownColErr = runner.grade(course.id(), query, "SELECT Sno FROM sc;\nSELECT UnknownColumn FROM sc;");
            assertEquals(0, unknownColErr.score());
            assertEquals(2, unknownColErr.errorLine());
            assertEquals(1054, unknownColErr.error().code());
            assertTrue(unknownColErr.error().raw().contains("at line 2:"), unknownColErr.error().raw());
            assertEquals(3, runner.grade(course.id(), query,
                "SELECT Sno,Cno,Grade FROM sc WHERE Grade>=80 ORDER BY Grade,Sno,Cno;").score());
            assertEquals(3, runner.grade(course.id(), query,
                "SELECT Sno,Cno,Grade FROM sc WHERE Grade>=90 ORDER BY Grade DESC,Sno,Cno;").score());
            assertEquals(3, runner.grade(course.id(), query,
                "SELECT Sno,Cno,Grade FROM sc WHERE Grade>=70 ORDER BY Grade DESC,Sno,Cno;").score());
            assertEquals(11, runner.grade(course.id(), query, query.referenceSql().replace("WHERE Grade>=80", "WHERE Grade>=80 AND Sno<>'20110008'")).score());
            var view = archive.get("exam-lab-05-q31");
            assertEquals(11, runner.grade(course.id(), view, view.referenceSql().replace(" WITH CHECK OPTION", "")).score());
            var trigger = archive.get("exam-lab-07-q31");
            assertEquals(11, runner.grade(course.id(), trigger, trigger.referenceSql().replace("NEW.Grade<60", "NEW.Grade<59")).score());

            var trace = runner.debug(course.id(), query,
                "START TRANSACTION;\nUPDATE sc SET Grade=90 WHERE Sno='20110001' AND Cno='001';\nROLLBACK;\nSELECT MissingColumn FROM sc;", "trace", 0);
            assertEquals("sql_error", trace.status(), trace.toString());
            assertEquals(4, trace.error().line(), trace.toString());
            assertEquals(1054, trace.error().code());
            assertTrue(trace.error().raw().contains("at line 4:"), trace.error().raw());
            assertEquals(1L, trace.steps().get(1).affectedRows());
            assertEquals("sc", trace.steps().get(1).changes().getFirst().table(), trace.toString());
            assertEquals(trace.steps().get(1).changes().getFirst().before(), trace.steps().get(2).changes().getFirst().after());
            var priorRows = runner.debug(course.id(), query, "UPDATE sc SET Grade=90 WHERE Sno='20110001' AND Cno='001';\nSELECT ROW_COUNT() AS changed;", "run", 0);
            assertEquals("ok", priorRows.status(), priorRows.toString());
            assertEquals(List.of(List.of("1")), priorRows.steps().get(1).tables().getFirst().rows(), priorRows.toString());
            var echoed = runner.debug(course.id(), query,
                "SET @text='first line\n--------------\n<?xml version=\"1.0\"?><resultset></resultset>'; SELECT 1 AS actual;",
                "run", 0);
            assertEquals("ok", echoed.status(), echoed.toString());
            assertTrue(echoed.steps().getFirst().tables().isEmpty(), echoed.toString());
            assertEquals(List.of("actual"), echoed.steps().get(1).tables().getFirst().columns());
            var explain = runner.debug(course.id(), query, "SELECT * FROM sc WHERE Sno='20110001';", "explain", 0);
            assertTrue(explain.steps().getFirst().tables().getFirst().columns().containsAll(List.of("type", "possible_keys", "key", "rows", "filtered", "Extra")));
            var denied = runner.debug(course.id(), query, "DELETE FROM student_inf_practice.sc;", "run", 0);
            assertEquals("sql_error", denied.status());
            var capped = runner.debug(course.id(), query, "SELECT REPEAT('x', 65540);", "run", 0);
            assertEquals("output_limit", capped.status(), capped.toString());
            assertEquals(initial.tables(), labs.run(course, java.util.Map.of("q", "SELECT * FROM sc ORDER BY Sno,Cno;"), null).get("q").tables());
            assertEquals(List.of("0", "0"), command("exec", container, "mysql", "-N", "-uroot", "-e",
                "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name LIKE 'cs_exam_%'; SELECT COUNT(*) FROM mysql.user WHERE user LIKE 'cs_exam_%';")
                .strip().lines().toList());
        } finally {
            command("rm", "-f", container);
            command("volume", "rm", container + "-data");
        }
    }

    @Test void previewsBitColumnsInBothRoutes() throws Exception {
        String pack = "../course-packs";
        var json = JsonMapper.builder().build();
        var courses = new SchoolCourseCatalog(pack, json);
        var catalog = new ExamCatalog(pack, json, courses);
        var storage = temporary.toString();
        var mysql = new MysqlEnvironment(null, "docker", "cs-sql-exam-test", false, storage, 0);
        var labs = new SchoolLabRunner(courses, new SchoolStudent(storage), mysql, storage, true);
        var runner = new ExamSqlRunner(courses, labs);
        var course = courses.course("database-systems");
        var container = labs.activeContainer(course);
        try {
            var preview = labs.run(course, java.util.Map.of("q", """
                SELECT prj_status FROM Salvaging WHERE prj_num='20110001';
                """), null).get("q");
            assertEquals("ok", preview.status(), preview.toString());
            assertEquals(List.of(List.of("0x01")), preview.tables().getFirst().rows());

            var question = catalog.pack(course.id()).questions().get("exam-mock-02-r4-q21");
            var schema = runner.debug(course.id(), question, "", "schema", 0);
            assertEquals("ok", schema.status(), schema.toString());
            assertTrue(schema.steps().stream().anyMatch(step -> step.summary().equals("SELECT * FROM `salvaging` LIMIT 5")
                || step.summary().equals("SELECT * FROM `Salvaging` LIMIT 5")));
        } finally {
            command("rm", "-f", container);
            command("volume", "rm", container + "-data");
        }
    }

    private static long millis(long began) { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - began); }

    private static String command(String... arguments) throws Exception {
        var args = new java.util.ArrayList<>(List.of("docker"));
        args.addAll(List.of(arguments));
        var process = new ProcessBuilder(args).redirectErrorStream(true).start();
        assertTrue(process.waitFor(25, TimeUnit.SECONDS));
        var result = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(0, process.exitValue(), result);
        return result;
    }
}

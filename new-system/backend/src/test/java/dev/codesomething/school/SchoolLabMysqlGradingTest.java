package dev.codesomething.school;

import dev.codesomething.sql.MysqlEnvironment;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "CS_RUN_DOCKER_TESTS", matches = "true")
class SchoolLabMysqlGradingTest {
    @TempDir java.nio.file.Path temporary;

    @Test void gradesEachLabScriptAndKeepsTheWorkbenchDataIsolated() throws Exception {
        var courses = new SchoolCourseCatalog("../course-packs", JsonMapper.builder().build());
        var course = courses.course("database-systems");
        var storage = temporary.toString();
        var mysql = new MysqlEnvironment(null, "docker", "cs-sql-lab-grading-test", false, storage, 0);
        var labs = new SchoolLabRunner(courses, new SchoolStudent(storage), mysql, storage, true);
        var grader = new ExamSqlRunner(courses, labs);
        var container = labs.activeContainer(course);
        try {
            var before = labs.run(course, Map.of("probe", "SELECT * FROM sc ORDER BY Sno,Cno;"), null);
            var questions = course.labs().stream().flatMap(outline ->
                courses.labChecks(course, courses.lab(course, outline.id())).values().stream()).toList();
            assertEquals(101, questions.size());
            var failures = new ArrayList<String>();
            for (var question : questions) {
                try {
                    var grade = grader.grade(course.id(), question, question.referenceSql());
                    if (grade.score() == 10) System.out.println(question.id() + " 10/10");
                    else failures.add(question.id() + " " + grade);
                } catch (RuntimeException failure) {
                    failures.add(question.id() + " " + failure);
                }
            }
            assertTrue(failures.isEmpty(), () -> String.join("\n", failures));
            var query = questions.stream().filter(q -> q.id().equals("lab-03-single-query-q02")).findFirst().orElseThrow();
            var wrong = grader.grade(course.id(), query, "SELECT Sno AS 学号,Sname AS 学生,Home_addr AS 家庭地址 FROM student WHERE FALSE;");
            assertEquals(2, wrong.score());
            assertFalse(wrong.checks().get(1).diff().missing().isEmpty());
            var deletion = questions.stream().filter(q -> q.id().equals("lab-02-ddl-tables-q07")).findFirst().orElseThrow();
            assertEquals(2, grader.grade(course.id(), deletion, "DELETE FROM sc;").score());
            assertEquals(10, grader.grade(course.id(), deletion, deletion.referenceSql()).score());
            assertEquals(before.get("probe").tables(),
                labs.run(course, Map.of("probe", "SELECT * FROM sc ORDER BY Sno,Cno;"), null).get("probe").tables());
        } finally {
            docker("rm", "-f", container);
            docker("volume", "rm", container + "-data");
        }
    }

    private static void docker(String... arguments) throws Exception {
        var command = new ArrayList<>(List.of("docker"));
        command.addAll(List.of(arguments));
        var process = new ProcessBuilder(command).redirectErrorStream(true).start();
        assertTrue(process.waitFor(25, TimeUnit.SECONDS));
        assertEquals(0, process.exitValue(), new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
    }
}

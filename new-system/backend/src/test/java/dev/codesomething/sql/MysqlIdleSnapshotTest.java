package dev.codesomething.sql;

import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "CS_RUN_DOCKER_TESTS", matches = "true")
class MysqlIdleSnapshotTest {
    @TempDir Path data;

    @Test void idleSchoolSandboxReleasesItsSlotAndRestoresLearnerDatabaseObjects() throws Exception {
        var clock = new AtomicLong();
        var activityPool = new MysqlPoolActivity(clock::get, Duration.ofMinutes(30));
        var pool = new MysqlEnvironment(new SqlCourse("../course-packs"), "docker", "cs-sql-snapshot-test",
            true, data.toString(), 1, activityPool);
        var first = pool.schoolInstance(MysqlEnvironment.digest(data + "first").substring(0, 24));
        var second = pool.learnerInstance(MysqlEnvironment.digest(data + "second").substring(0, 24));
        long idle = Duration.ofMinutes(31).toMillis();
        try {
            try (var activity = first.activity()) {
                first.prepareSchool(List.of("student_inf_practice"), "CREATE TABLE student (id INT PRIMARY KEY);", false);
                first.grantSchoolDatabase("lab_extra");
                first.schoolQuery(null, "CREATE DATABASE lab_extra; USE lab_extra; CREATE TABLE marks (id INT); INSERT INTO marks VALUES (7); CREATE VIEW v_marks AS SELECT id FROM marks;");
                first.schoolQuery("lab_extra", "CREATE PROCEDURE read_marks() SELECT id AS score FROM v_marks;");
                clock.addAndGet(idle);
                second.start();
                assertEquals("environment_error", second.status().status());
                assertTrue(second.status().message().contains("没有可回收"));
                assertTrue(first.schoolQuery("lab_extra", "CALL read_marks();").contains("score"));
            }
            clock.addAndGet(idle);
            second.start();
            assertEquals("hibernated", first.status().status());
            assertEquals("ready", second.status().status(), second.status().message());
            try (var activity = second.activity()) {
                second.practice("UPDATE tasks SET title='kept after sleep' WHERE id=1;", () -> false);
            }
            clock.addAndGet(idle);
            first.prepareSchool(List.of("student_inf_practice"), "CREATE TABLE student (id INT PRIMARY KEY);", false);
            assertEquals("hibernated", second.status().status());
            assertTrue(first.schoolQuery("lab_extra", "CALL read_marks();").contains("<field name=\"score\">7</field>"));
            // A foreground SQL operation normally refreshes this lease on entry and exit.
            first.touch();
            clock.addAndGet(idle);
            second.start();
            assertEquals("ready", second.status().status(), second.status().message());
            assertEquals(List.of(List.of("kept after sleep")),
                second.practice("SELECT title FROM tasks WHERE id=1;", () -> false).rows());
        } finally {
            remove(first);
            remove(second);
        }
    }

    private static void remove(MysqlEnvironment environment) throws Exception {
        var process = new ProcessBuilder("docker", "rm", "-f", environment.status().container())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        process.waitFor();
    }
}

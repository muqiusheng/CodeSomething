package dev.codesomething.sql;

import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.List;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "CS_RUN_DOCKER_TESTS", matches = "true")
class MysqlIdleSnapshotTest {
    @TempDir Path data;

    @Test void manualReleaseRejectsBusySandboxAndRestoresDataAfterRemoval() throws Exception {
        var pool = new MysqlEnvironment(new SqlCourse("../course-packs"), "docker", "cs-sql-release-test",
            true, data.toString(), 1);
        var sandbox = pool.schoolInstance(MysqlEnvironment.digest(data.toString()).substring(0, 24));
        String name = sandbox.status().container();
        try {
            String id;
            try (var lease = sandbox.activity()) {
                sandbox.prepareSchool(List.of("student_inf_practice"), "CREATE TABLE marks (id INT);", false);
                sandbox.schoolQuery("student_inf_practice", "INSERT INTO marks VALUES (27);");
                id = docker("inspect", "--format", "{{.Id}}", name).strip();
                assertTrue(pool.publicActivity(name).busy());
                assertFalse(pool.releasePublic(name, id, false));
            }
            assertFalse(pool.publicActivity(name).busy());
            assertTrue(pool.releasePublic(name, id, false));
            assertEquals("hibernated", sandbox.status().status());
            sandbox.prepareSchool(List.of("student_inf_practice"), "CREATE TABLE marks (id INT);", false);
            assertTrue(sandbox.schoolQuery("student_inf_practice", "SELECT id FROM marks;").contains(">27</field>"));
        } finally {
            remove(sandbox);
        }
    }

    @Test void configuredQuotaMustNotFallBackToAnUnboundedVolume() {
        var pool = new MysqlEnvironment(null, "docker", "cs-sql-quota-test", true,
            data.toString(), new MysqlEnvironment.PoolSettings(1, 1, true),
            new MysqlPoolActivity(() -> 0L, Duration.ofMinutes(30)));
        org.springframework.test.util.ReflectionTestUtils.setField(pool, "diskVolumePrefix",
            "cs-mysql-slot-missing-" + MysqlEnvironment.digest(data.toString()).substring(0,12));
        var sandbox = pool.schoolInstance(MysqlEnvironment.digest(data + "quota").substring(0,24));
        sandbox.start();
        assertEquals("environment_error", sandbox.status().status());
        assertTrue(sandbox.status().message().contains("定额磁盘卷"), sandbox.status().message());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void idleSchoolSandboxReleasesItsSlotAndRestoresLearnerDatabaseObjects(boolean disk) throws Exception {
        var clock = new AtomicLong();
        var activityPool = new MysqlPoolActivity(clock::get, Duration.ofMinutes(30));
        var pool = new MysqlEnvironment(new SqlCourse("../course-packs"), "docker", "cs-sql-snapshot-test",
            true, data.toString(), new MysqlEnvironment.PoolSettings(1, 1, disk), activityPool);
        var first = pool.schoolInstance(MysqlEnvironment.digest(data + "first").substring(0, 24));
        var second = pool.learnerInstance(MysqlEnvironment.digest(data + "second").substring(0, 24));
        long idle = Duration.ofMinutes(31).toMillis();
        try {
            try (var activity = first.activity()) {
                first.prepareSchool(List.of("student_inf_practice"), "CREATE TABLE student (id INT PRIMARY KEY);", false);
                if (disk) {
                    var mounts = tools.jackson.databind.json.JsonMapper.builder().build()
                        .readTree(docker("inspect", "--format", "{{json .Mounts}}", first.status().container()));
                    assertTrue(mounts.valueStream().anyMatch(mount ->
                        "volume".equals(mount.path("Type").asText()) &&
                        "/var/lib/mysql".equals(mount.path("Destination").asText())));
                }
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
            if (disk) {
                assertNotEquals(0, new ProcessBuilder("docker", "inspect", first.status().container())
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start().waitFor());
            }
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
            if (disk) {
                second.practice("UPDATE tasks SET title='newer than the snapshot' WHERE id=1;", () -> false);
                docker("stop", second.status().container());
                second.start();
                assertEquals(List.of(List.of("newer than the snapshot")),
                    second.practice("SELECT title FROM tasks WHERE id=1;", () -> false).rows());
            }
        } finally {
            remove(first);
            remove(second);
        }
    }

    private static void remove(MysqlEnvironment environment) throws Exception {
        var process = new ProcessBuilder("docker", "rm", "-fv", environment.status().container())
            .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        process.waitFor();
    }

    private static String docker(String... args) throws Exception {
        var command = new java.util.ArrayList<>(List.of("docker"));
        command.addAll(List.of(args));
        var process = new ProcessBuilder(command).redirectErrorStream(true).start();
        var output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(0, process.waitFor(), output);
        return output;
    }
}

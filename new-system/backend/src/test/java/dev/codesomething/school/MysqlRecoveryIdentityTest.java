package dev.codesomething.school;

import dev.codesomething.sql.MysqlEnvironment;
import dev.codesomething.sql.SqlLearningController;
import dev.codesomething.storage.LearningDataSource;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class MysqlRecoveryIdentityTest {
    @TempDir Path directory;

    @Test void bothPracticeRoutesFindTheSameSnapshotAfterChangingMachineDataPaths() {
        var source = directory.resolve("source").toString();
        var target = directory.resolve("target").toString();
        var courses = new SchoolCourseCatalog("../course-packs", JsonMapper.builder().build());
        var course = courses.course("database-systems");
        var sourcePool = new MysqlEnvironment(null, "docker", "cs-sql-source", true, source, 1);
        var targetPool = new MysqlEnvironment(null, "docker", "cs-sql-target", true, target, 1);
        var sourceLabs = school(courses, sourcePool, source);
        var targetLabs = school(courses, targetPool, target);
        String owner = "9875bc5f-efa2-4acb-af4a-3f5a1938abb6";
        var sourceSql = new SqlLearningController(null, sourcePool, null, true, null, true, source);
        var targetSql = new SqlLearningController(null, targetPool, null, true, null, true, target);

        try (var scope = LearningDataSource.asOwner(owner)) {
            assertNotEquals(sourceLabs.activeContainer(course), targetLabs.activeContainer(course));
            assertNotEquals(sourceSql.publicContainer(owner), targetSql.publicContainer(owner));
            ReflectionTestUtils.setField(targetPool, "configuredIdentityRoot", source);
            assertEquals(sourceLabs.activeContainer(course), targetLabs.activeContainer(course));
            assertEquals(sourceSql.publicContainer(owner), targetSql.publicContainer(owner));
        }
    }

    private static SchoolLabRunner school(SchoolCourseCatalog courses, MysqlEnvironment pool, String data) {
        var lab = new SchoolLabRunner(courses, new SchoolStudent(data), pool, data, true);
        ReflectionTestUtils.setField(lab, "publicMode", true);
        return lab;
    }
}

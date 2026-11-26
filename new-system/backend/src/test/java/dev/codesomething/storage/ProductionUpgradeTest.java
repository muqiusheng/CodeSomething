package dev.codesomething.storage;

import java.nio.file.Path;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.sqlite.SQLiteDataSource;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ProductionUpgradeTest {
    @Test
    void upgradesReleaseThatShippedBookmarksBeforeInteractiveLessons(@TempDir Path directory) {
        var source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + directory.resolve("release.db"));
        Flyway.configure().dataSource(source).target("25.1").load().migrate();
        var jdbc = new JdbcTemplate(source);
        // Recreate the deployed 25.1 history, whose release artifact excluded V24.
        jdbc.execute("DROP TABLE interactive_module_unlocks");
        jdbc.execute("DROP TABLE interactive_lesson_progress");
        jdbc.execute("DROP TABLE interactive_learner_profile");
        jdbc.update("DELETE FROM flyway_schema_history WHERE version='24'");
        int previousChecksum = jdbc.queryForObject(
            "SELECT checksum FROM flyway_schema_history WHERE version='25.1'", Integer.class);

        LearningDataSource.migrations(source).migrate();
        assertEquals(0, LearningDataSource.migrations(source).migrate().migrationsExecuted);
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM interactive_learner_profile", Integer.class));
        assertEquals(previousChecksum, jdbc.queryForObject(
            "SELECT checksum FROM flyway_schema_history WHERE version='25.1'", Integer.class));
        assertEquals(1, jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version='28.1' AND success", Integer.class));
    }
}

package dev.codesomething.school;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SchoolDatabaseSqlTest {
    @Test
    void identifiesNativeCreateAtTheStartOfAScript() {
        assertEquals("study_test", SchoolDatabaseSql.creationTarget(
            "CREATE DATABASE IF NOT EXISTS `study_test` DEFAULT CHARACTER SET utf8mb4;\nUSE study_test;"));
        assertNull(SchoolDatabaseSql.creationTarget("SELECT 'CREATE DATABASE unrelated';"));
        assertNull(SchoolDatabaseSql.creationTarget("CREATE DATABASE `study%test`;"));
    }
}

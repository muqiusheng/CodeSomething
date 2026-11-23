package dev.codesomething.school;

import java.util.regex.Pattern;

final class SchoolDatabaseSql {
    private static final Pattern CREATE = Pattern.compile(
        "\\A\\s*CREATE\\s+(?:DATABASE|SCHEMA)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"
        + "(?:\u0060([a-z][a-z0-9_]{0,63})\u0060|([a-z][a-z0-9_]{0,63}))"
        + "(?:\\s+(?:DEFAULT\\s+)?(?:CHARACTER\\s+SET|CHARSET|COLLATE)(?:\\s*=\\s*|\\s+)[a-z0-9_]+)*\\s*(?:;|\\z)",
        Pattern.CASE_INSENSITIVE);

    private SchoolDatabaseSql() {}

    static String creationTarget(String sql) {
        var statement = CREATE.matcher(sql);
        return statement.find() ? (statement.group(1) == null ? statement.group(2) : statement.group(1)) : null;
    }
}

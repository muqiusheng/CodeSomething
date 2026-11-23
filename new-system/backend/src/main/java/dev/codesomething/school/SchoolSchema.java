package dev.codesomething.school;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

record SchoolSchema(String database, List<DbTable> tables, List<View> views, List<String> procedures) {
    record DbTable(String name, String engine, List<Column> columns, List<ForeignKey> foreignKeys, List<Trigger> triggers) {}
    record Column(String name, String type, boolean primaryKey, boolean nullable, String defaultValue, String extra) {}
    record View(String name, List<Column> columns) {}
    record ForeignKey(String name, List<KeyColumn> columns, String onUpdate, String onDelete) {}
    record KeyColumn(String column, String referencedSchema, String referencedTable, String referencedColumn) {}
    record Trigger(String name, String timing, String event) {}

    static final String QUERY = """
        SELECT TABLE_NAME, TABLE_TYPE, ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION;
        SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA, k.REFERENCED_TABLE_NAME,
               k.REFERENCED_COLUMN_NAME, r.UPDATE_RULE, r.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE k
        JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA
          AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;
        SELECT EVENT_OBJECT_TABLE, TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION
        FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME;
        SELECT ROUTINE_NAME FROM information_schema.ROUTINES
        WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_TYPE='PROCEDURE' ORDER BY ROUTINE_NAME;
        """;

    static SchoolSchema from(String database, List<SchoolLabRunner.ResultTable> results) {
        var objects = results.get(0).rows();
        var columns = results.get(1).rows();
        var keys = results.get(2).rows();
        var triggers = results.get(3).rows();
        var tables = objects.stream().filter(row -> "BASE TABLE".equals(row.get(1))).map(row -> {
            String name = row.getFirst();
            return new DbTable(name, row.get(2), columnsFor(columns, name), keysFor(keys, name),
                triggers.stream().filter(trigger -> name.equals(trigger.getFirst()))
                    .map(trigger -> new Trigger(trigger.get(1), trigger.get(2), trigger.get(3))).toList());
        }).toList();
        var views = objects.stream().filter(row -> "VIEW".equals(row.get(1)) || "SYSTEM VIEW".equals(row.get(1)))
            .map(row -> new View(row.getFirst(), columnsFor(columns, row.getFirst()))).toList();
        return new SchoolSchema(database, tables, views, results.get(4).rows().stream().map(List::getFirst).toList());
    }

    private static List<Column> columnsFor(List<List<String>> columns, String table) {
        return columns.stream().filter(row -> table.equals(row.getFirst()))
            .map(row -> new Column(row.get(1), row.get(2), "PRI".equals(row.get(3)), "YES".equals(row.get(4)),
                row.get(5), row.get(6))).toList();
    }

    private static List<ForeignKey> keysFor(List<List<String>> keys, String table) {
        Map<String, List<List<String>>> groups = new LinkedHashMap<>();
        keys.stream().filter(row -> table.equals(row.getFirst()))
            .forEach(row -> groups.computeIfAbsent(row.get(1), name -> new java.util.ArrayList<>()).add(row));
        return groups.entrySet().stream().map(group -> {
            var rules = group.getValue().getFirst();
            return new ForeignKey(group.getKey(), group.getValue().stream()
                .map(row -> new KeyColumn(row.get(2), row.get(3), row.get(4), row.get(5))).toList(),
                rules.get(6), rules.get(7));
        }).toList();
    }
}

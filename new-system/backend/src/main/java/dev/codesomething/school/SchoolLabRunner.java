package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import dev.codesomething.sql.MysqlEnvironment;
import dev.codesomething.sql.SqlPolicy;
import java.io.StringReader;
import java.nio.file.Path;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

@Component
public class SchoolLabRunner {
    public record ResultTable(List<String> columns, List<List<String>> rows) {}
    public record RunResult(String status, long elapsedMs, Long affectedRows, List<ResultTable> tables, String message, String database) {
        public RunResult(String status, long elapsedMs, Long affectedRows, List<ResultTable> tables, String message) {
            this(status, elapsedMs, affectedRows, tables, message, null);
        }
    }

    private final SchoolCourseCatalog catalog;
    private final SchoolStudent student;
    private final MysqlEnvironment environment;
    private final String workspace;
    private final boolean enabled;
    @Value("${cs.public:false}") private boolean publicMode;
    private final Map<String, MysqlEnvironment> instances = new java.util.concurrent.ConcurrentHashMap<>();

    SchoolLabRunner(SchoolCourseCatalog catalog, SchoolStudent student, MysqlEnvironment environment,
                    @Value("${cs.data-directory}") String dataDirectory, @Value("${cs.runner.enabled:true}") boolean enabled) {
        this.catalog = catalog;
        this.student = student;
        this.environment = environment;
        this.workspace = Path.of(dataDirectory).toAbsolutePath().normalize().toString();
        this.enabled = enabled;
    }

    String database(SchoolCourseCatalog.Course course) {
        if (!"mysql".equals(course.engine())) return null;
        var id = student.identity().number();
        return course.database().replace("{studentId}", id.matches("[0-9]{1,16}") ? id : "practice");
    }

    private List<String> schemas(SchoolCourseCatalog.Course course) {
        var schemas = new ArrayList<String>();
        schemas.add(database(course));
        if (course.extraDatabases() != null) schemas.addAll(course.extraDatabases());
        return schemas;
    }

    private MysqlEnvironment instance(SchoolCourseCatalog.Course course, boolean reset, boolean empty) {
        if (!enabled) throw new MysqlEnvironment.Failure("environment_error", "当前服务已停用隔离运行。");
        var schemas = schemas(course);
        String owner = publicMode ? "\n" + dev.codesomething.storage.LearningDataSource.owner() : "";
        String key = MysqlEnvironment.digest(workspace + owner + "\n" + course.id() + "\n" + String.join(",", schemas)).substring(0, 24);
        var instance = instances.computeIfAbsent(key, environment::schoolInstance);
        instance.prepareSchool(schemas, empty ? "" : catalog.seed(course), reset);
        return instance;
    }

    String activeContainer(SchoolCourseCatalog.Course course) {
        String owner = publicMode ? "\n" + dev.codesomething.storage.LearningDataSource.owner() : "";
        String key = MysqlEnvironment.digest(workspace + owner + "\n" + course.id() + "\n" + String.join(",", schemas(course))).substring(0, 24);
        return environment.schoolInstance(key).status().container();
    }

    Map<String, RunResult> run(SchoolCourseCatalog.Course course, Map<String, String> scripts, String selectedDatabase) {
        requireMysql(course);
        scripts.values().forEach(SqlPolicy::validateSize);
        var result = new LinkedHashMap<String, RunResult>();
        var instance = instance(course, false, false);
        String current = selectedDatabase == null ? database(course) : validatedDatabase(selectedDatabase);
        for (var script : scripts.entrySet()) {
            long start = System.nanoTime();
            try {
                String marker = "cs_rows_" + UUID.randomUUID().toString().replace("-", "");
                String input = "SET SESSION max_execution_time=1500; SET SESSION sql_select_limit=101;\n"
                    + script.getValue() + "\n;\nDELIMITER ;\nSELECT ROW_COUNT() AS " + marker + ", DATABASE() AS current_database;\n";
                var target = SchoolDatabaseSql.creationTarget(script.getValue());
                if (target != null) instance.grantSchoolDatabase(target);
                var outcome = parse(instance.schoolQuery(current, input), marker, start, 100);
                result.put(script.getKey(), outcome);
                if ("ok".equals(outcome.status())) current = outcome.database();
            } catch (MysqlEnvironment.Failure e) {
                result.put(script.getKey(), new RunResult(e.status, elapsed(start), null, List.of(), e.getMessage()));
                if (Set.of("environment_error", "timeout", "output_limit").contains(e.status)) break;
            }
        }
        return result;
    }

    List<String> databases(SchoolCourseCatalog.Course course) {
        requireMysql(course);
        var instance = instance(course, false, false);
        String marker = "cs_databases_end";
        var result = parse(instance.schoolQuery(null, "SHOW DATABASES; SELECT 0 AS " + marker + ";"),
            marker, System.nanoTime(), Integer.MAX_VALUE);
        if (!"ok".equals(result.status()) || result.tables().size() != 1)
            throw new MysqlEnvironment.Failure("result_error", "无法读取数据库列表，请刷新后重试。");
        return result.tables().getFirst().rows().stream().map(List::getFirst).toList();
    }

    void createDatabase(SchoolCourseCatalog.Course course, String name) {
        requireMysql(course);
        var instance = instance(course, false, false);
        instance.grantSchoolDatabase(name);
        instance.schoolQuery(null, "CREATE DATABASE IF NOT EXISTS `" + name + "`;");
    }

    private static String validatedDatabase(String selected) {
        if (selected.isEmpty()) return null;
        if (!MysqlEnvironment.schoolDatabaseName(selected)) throw ApiException.invalid("database", "数据库名称无效。");
        return selected;
    }

    SchoolSchema schema(SchoolCourseCatalog.Course course, String selectedDatabase) {
        requireMysql(course);
        var instance = instance(course, false, false);
        var name = selectedDatabase == null ? database(course) : validatedDatabase(selectedDatabase);
        if (name == null) throw ApiException.invalid("database", "请先选择数据库。");
        boolean system = Set.of("information_schema", "performance_schema").contains(name);
        String connection = system ? null : name;
        String query = system ? SchoolSchema.QUERY.replace("DATABASE()", "'" + name + "'") : SchoolSchema.QUERY;
        try {
            return SchoolSchema.from(name, metadata(instance, connection, query, 5));
        } catch (MysqlEnvironment.Failure failure) {
            if (!"output_limit".equals(failure.status)) throw failure;
            var tables = new ArrayList<ResultTable>();
            for (String statement : query.strip().split(";")) {
                var rows = new ArrayList<List<String>>();
                List<String> columns = List.of();
                for (int offset = 0; ; offset += 60) {
                    var page = metadata(instance, connection, statement.strip() + " LIMIT 60 OFFSET " + offset + ";", 1).getFirst();
                    if (!page.rows().isEmpty()) columns = page.columns();
                    rows.addAll(page.rows());
                    if (page.rows().size() < 60) break;
                }
                tables.add(new ResultTable(columns, rows));
            }
            return SchoolSchema.from(name, tables);
        }
    }

    private static List<ResultTable> metadata(MysqlEnvironment instance, String connection, String query, int expectedTables) {
        String marker = "cs_schema_end";
        var result = parse(instance.schoolQuery(connection, query + "\nSELECT 0 AS " + marker + ";"),
            marker, System.nanoTime(), Integer.MAX_VALUE);
        if (!"ok".equals(result.status()) || result.tables().size() != expectedTables)
            throw new MysqlEnvironment.Failure("result_error", "无法读取数据库对象，请刷新后重试。");
        return result.tables();
    }

    void reset(SchoolCourseCatalog.Course course, boolean empty) {
        requireMysql(course);
        instance(course, true, empty);
    }

    private static void requireMysql(SchoolCourseCatalog.Course course) {
        if (!"mysql".equals(course.engine())) throw ApiException.invalid("engine", "该课程使用手动记录。");
    }

    private static RunResult parse(String output, String marker, long start, int rowLimit) {
        try {
            var xml = DocumentBuilderFactory.newInstance();
            xml.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            var sets = xml.newDocumentBuilder().parse(new InputSource(new StringReader(
                "<results>" + output.replaceAll("(?m)^<\\?xml [^\\r\\n]*\\?>", "") + "</results>"))).getDocumentElement()
                .getElementsByTagName("resultset");
            var tables = new ArrayList<ResultTable>();
            Long affected = null;
            String database = null;
            boolean finished = false;
            for (int i = 0; i < sets.getLength(); i++) {
                var rows = ((Element) sets.item(i)).getElementsByTagName("row");
                var columns = new ArrayList<String>();
                var values = new ArrayList<List<String>>();
                for (int j = 0; j < Math.min(rows.getLength(), rowLimit); j++) {
                    var row = new ArrayList<String>();
                    var fields = ((Element) rows.item(j)).getElementsByTagName("field");
                    for (int k = 0; k < fields.getLength(); k++) {
                        var field = (Element) fields.item(k);
                        if (j == 0) columns.add(field.getAttribute("name"));
                        row.add(field.hasAttribute("xsi:nil") ? null : field.getTextContent());
                    }
                    values.add(row);
                }
                if (!columns.isEmpty() && columns.getFirst().equals(marker)) {
                    var value = values.getFirst();
                    long count = Long.parseLong(value.getFirst());
                    affected = count >= 0 ? count : null;
                    if (value.size() == 2) database = value.get(1);
                    finished = true;
                } else {
                    tables.add(new ResultTable(columns, values));
                }
            }
            if (!finished) return new RunResult("sql_error", elapsed(start), null, tables, "脚本没有正常结束。请核对语句结束符和 DELIMITER 设置。");
            return new RunResult("ok", elapsed(start), affected, tables,
                rowLimit == 100 && tables.stream().anyMatch(table -> table.rows().size() == 100) ? "每个结果集最多显示 100 行。" : null,
                database);
        } catch (Exception e) {
            return new RunResult("result_error", elapsed(start), null, List.of(), "MySQL 已运行，但输出无法读取。请缩小结果范围再试。");
        }
    }

    private static long elapsed(long start) {
        return (System.nanoTime() - start) / 1_000_000;
    }
}

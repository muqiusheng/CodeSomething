package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import dev.codesomething.sql.MysqlEnvironment;
import dev.codesomething.sql.SqlPolicy;
import java.io.StringReader;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import tools.jackson.databind.json.JsonMapper;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;

@Component
class ExamSqlRunner {
    record TraceStep(int startLine, int endLine, String summary, String status, Long elapsedMs, Long affectedRows,
                     List<SchoolLabRunner.ResultTable> tables, List<TableChange> changes) {}
    record TableChange(String table, String before, String after, SchoolLabRunner.ResultTable preview) {}
    record Debug(String status, long elapsedMs, List<TraceStep> steps, ExamSqlScript.Diagnostic error) {}
    record Diff(boolean match, boolean columnsDiffer, boolean orderDiffers, List<List<String>> missing, List<List<String>> extra) {}
    record CheckResult(String label, int points, int score, String status, String message, Diff diff,
                       List<SchoolLabRunner.ResultTable> expected, List<SchoolLabRunner.ResultTable> actual,
                       String kind, Integer errorLine, String advice) {
        CheckResult(String label, int points, int score, String status, String message, Diff diff,
                    List<SchoolLabRunner.ResultTable> expected, List<SchoolLabRunner.ResultTable> actual) {
            this(label, points, score, status, message, diff, expected, actual, null, null, null);
        }
    }
    record Grade(String status, int score, List<CheckResult> checks, Integer errorLine, ExamSqlScript.Diagnostic error) {
        Grade(String status, int score, List<CheckResult> checks) {
            this(status, score, checks, null, null);
        }
    }
    private record Evidence(Debug run, List<SchoolLabRunner.ResultTable> tables, boolean accepted) {}
    private record ReferenceKey(String course, String mode, String seedDigest, String checksDigest) {}
    private record SchemaKey(String course, String mode, String seedDigest) {}
    private record Probe(List<Integer> query, List<Integer> positive, List<Integer> negative, List<Integer> after) {}
    private record Observation(Debug run, List<Evidence> checks) {}
    private record State(String rows, String fingerprint, List<String> columns, List<List<String>> preview) {
        boolean sameData(State other) {
            return other != null && Objects.equals(fingerprint, other.fingerprint) && columns.equals(other.columns);
        }
    }
    private record BatchStep(ExamSqlScript.Step step, int line, int stateLine) {}

    static final String LIMITS = "SET SESSION max_execution_time=1500; SET SESSION sql_select_limit=101;\n";
    static final Pattern XML = Pattern.compile("<\\?xml .*?\\?>\\s*(<resultset\\b.*?</resultset>)", Pattern.DOTALL);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final Map<ReferenceKey, List<Observation>> references = new ConcurrentHashMap<>();
    private final Map<SchemaKey, Debug> schemas = new ConcurrentHashMap<>();
    private final SchoolCourseCatalog courses;
    private final SchoolLabRunner labs;

    ExamSqlRunner(SchoolCourseCatalog courses, SchoolLabRunner labs) {
        this.courses = courses;
        this.labs = labs;
    }

    Debug debug(String courseId, ExamCatalog.Question q, String sql, String mode, int offset) {
        if (!Set.of("run", "selection", "trace", "explain", "schema", "tables", "reset").contains(mode))
            throw ApiException.invalid("mode", "请选择一种 SQL 调试操作。");
        if (mode.equals("reset")) return new Debug("ok", 0, List.of(), null);
        boolean tablePreview = mode.equals("tables");
        if (!mode.equals("schema") && !tablePreview) SqlPolicy.validateSize(sql);
        if (mode.equals("explain")) {
            var steps = ExamSqlScript.split(sql);
            if (steps.size() != 1 || !steps.getFirst().sql().matches("(?is)^(SELECT|WITH)\\b.*"))
                throw ApiException.invalid("sql", "请选择一条 SELECT 或 WITH 查询。");
            sql = "EXPLAIN " + steps.getFirst().sql();
            offset += steps.getFirst().startLine() - 1;
        }
        var course = courses.course(courseId);
        final String script = sql;
        final int sourceOffset = offset;
        try {
            var env = labs.examEnvironment(course);
            try (var activity = env.activity()) {
                String seed = seed(course, q);
                if (mode.equals("schema") || tablePreview) {
                    var key = new SchemaKey(courseId, mode, MysqlEnvironment.digest(seed));
                    return schemas.computeIfAbsent(key, unused -> env.withSchoolExam(seed, session -> schema(session, tablePreview)));
                }
                long started = System.nanoTime();
                var result = env.withSchoolExam(seed,
                    session -> execute(session, script, mode.equals("trace"), sourceOffset));
                return new Debug(result.status(), elapsed(started), result.steps(), result.error());
            }
        } catch (MysqlEnvironment.Failure failure) {
            return new Debug(failure.status, 0, List.of(), new ExamSqlScript.Diagnostic(0, 0, failure.getMessage(),
                failure.status.equals("environment_error") ? "隔离 MySQL 不可用，请稍后重试。" : "请缩小数据范围后再运行。"));
        }
    }

    Grade grade(String courseId, ExamCatalog.Question q, String sql) {
        if (sql.isBlank()) return new Grade("unanswered", 0, List.of());
        var course = courses.course(courseId);
        try {
            var env = labs.examEnvironment(course);
            try (var activity = env.activity()) {
                SqlPolicy.validateSize(sql);
                var results = new ArrayList<CheckResult>();
                var byVariant = new LinkedHashMap<String, List<ExamCatalog.Check>>();
                q.checks().forEach(check -> byVariant.computeIfAbsent(Objects.toString(check.variantSql(), ""), key -> new ArrayList<>()).add(check));
                var completed = new IdentityHashMap<ExamCatalog.Check, CheckResult>();
                var groups = List.copyOf(byVariant.values());
                String base = seed(course, q);
                var seeds = byVariant.keySet().stream().map(variant -> base + "\n" + variant).toList();
                var actualRuns = observeAll(env, seeds, sql, groups);
                List<Observation> expectedRuns = List.of();
                if (actualRuns.stream().anyMatch(actual -> actual.run().status().equals("ok"))) {
                    var key = new ReferenceKey(courseId, q.id(), MysqlEnvironment.digest(seeds.toString()),
                        MysqlEnvironment.digest(q.referenceSql() + "\n" + q.checks()));
                    expectedRuns = references.computeIfAbsent(key, unused -> {
                        var reference = observeAll(env, seeds, q.referenceSql(), groups);
                        if (reference.stream().anyMatch(result -> !result.run().status().equals("ok")
                                || result.checks().stream().anyMatch(e -> !e.accepted())))
                            throw new IllegalStateException("Invalid reference checkpoint: " + q.id() + " " + reference);
                        return List.copyOf(reference);
                    });
                }
                ExamSqlScript.Diagnostic sqlError = null;
                for (int group = 0; group < groups.size(); group++) {
                    var checks = groups.get(group);
                    var actual = actualRuns.get(group);
                    if (!actual.run().status().equals("ok")) {
                        var diag = actual.run().error();
                        if (sqlError == null && diag != null) sqlError = diag;
                        Integer errorLine = diag != null && diag.line() > 0 ? diag.line() : null;
                        String advice = diag != null ? diag.advice() : null;
                        String message = diag != null ? diag.raw() : description(actual.run());
                        for (var check : checks) completed.put(check, new CheckResult(check.label(), check.points(),
                            0, "failed", message, null, List.of(), List.of(), check.kind(), errorLine, advice));
                        continue;
                    }
                    var expected = expectedRuns.get(group).checks();
                    for (int i = 0; i < checks.size(); i++) {
                        var check = checks.get(i);
                        var a = actual.checks().get(i);
                        var e = expected.get(i);
                        var diff = difference(e.tables(), a.tables(), check.ordered(), check.named());
                        boolean pass = a.accepted() && diff.match();
                        var probeError = !a.accepted() ? a.run().error() : null;
                        String message = pass ? "通过" : a.accepted() ? "查询结果或对象状态与要求不符。"
                            : probeError != null ? probeError.raw() : description(a.run());
                        String advice = probeError != null ? probeError.advice() : null;
                        completed.put(check, new CheckResult(check.label(), check.points(), pass ? check.points() : 0,
                            pass ? "passed" : "failed", message, diff, e.tables(), a.tables(), check.kind(), null, advice));
                    }
                }
                q.checks().forEach(check -> results.add(completed.get(check)));
                Integer errorLine = sqlError != null && sqlError.line() > 0 ? sqlError.line() : null;
                return new Grade("graded", results.stream().mapToInt(CheckResult::score).sum(), results, errorLine, sqlError);
            }
        } catch (MysqlEnvironment.Failure e) {
            if ("environment_error".equals(e.status)) return new Grade("unavailable", 0, List.of());
            String advice = "请缩小数据范围或简化查询后再重试。";
            var diag = new ExamSqlScript.Diagnostic(0, 0, e.getMessage(), advice);
            return new Grade("graded", 0, q.checks().stream().map(check -> new CheckResult(check.label(), check.points(),
                0, e.status, e.getMessage(), null, List.of(), List.of(), check.kind(), null, advice)).toList(), null, diag);
        } catch (ApiException e) {
            String advice = "请检查 SQL 长度、语句数量及 DELIMITER 写法。";
            var diag = new ExamSqlScript.Diagnostic(0, 0, e.getMessage(), advice);
            return new Grade("graded", 0, q.checks().stream().map(check -> new CheckResult(check.label(), check.points(),
                0, "invalid_sql", e.getMessage(), null, List.of(), List.of(), check.kind(), null, advice)).toList(), null, diag);
        }
    }

    int referenceCacheSize() { return references.size(); }

    private List<Observation> observeAll(MysqlEnvironment env, List<String> seeds, String script, List<List<ExamCatalog.Check>> groups) {
        return env.withSchoolExams(seeds, sessions -> {
            var results = new ArrayList<Observation>();
            for (int i = 0; i < sessions.size(); i++)
                results.add(observe(env, sessions.get(i), seeds.get(i), script, groups.get(i)));
            return results;
        });
    }

    private Observation observe(MysqlEnvironment env, MysqlEnvironment.ExamSession session,
                                String seed, String script, List<ExamCatalog.Check> checks) {
        var source = new ExamSqlBatch();
        var indices = source.add(script);
        if (indices.isEmpty()) throw ApiException.invalid("sql", "请输入至少一条 SQL 语句。");
        var steps = source.run(session, false);
        var run = source.report(steps, indices, 0);
        if (!run.status().equals("ok")) return new Observation(run, List.of());
        var probes = new ExamSqlBatch();
        var plan = new ArrayList<Probe>();
        var named = new HashSet<Integer>();
        for (var check : checks) {
            switch (check.kind()) {
                case "execution", "result_set" -> plan.add(new Probe(List.of(), List.of(), List.of(), List.of()));
                case "negative_check" -> {
                    var positive = probes.add(check.positiveSql());
                    probes.add("ROLLBACK");
                    var query = probes.add(check.sql());
                    probes.add("ROLLBACK");
                    var negative = probes.add(check.negativeSql());
                    probes.add("ROLLBACK");
                    var after = probes.add(check.sql());
                    probes.add("ROLLBACK");
                    named.addAll(query);
                    named.addAll(after);
                    plan.add(new Probe(query, positive, negative, after));
                }
                default -> {
                    var query = probes.add(check.sql());
                    probes.add("ROLLBACK");
                    if (check.named()) named.addAll(query);
                    plan.add(new Probe(query, List.of(), List.of(), List.of()));
                }
            }
        }
        var results = plan.stream().anyMatch(p -> !p.query().isEmpty()) ? probes.run(session, true) : List.<TraceStep>of();
        var emptySource = checks.stream().anyMatch(c -> c.kind().equals("result_set") && c.named()) ? emptySets(steps, indices) : Set.<Integer>of();
        var emptyProbes = emptySets(results, named);
        // MySQL XML omits field metadata for empty result sets. Replay only when a
        // column-sensitive check encounters one, on fresh data to preserve script semantics.
        if (!emptySource.isEmpty()) {
            var metadata = env.withSchoolExam(seed, replay -> source.columns(replay, false, emptySource));
            run = fillColumns(run, indices, metadata);
        }
        if (!emptyProbes.isEmpty()) {
            var metadata = env.withSchoolExam(seed, replay -> {
                source.run(replay, false);
                return probes.columns(replay, true, emptyProbes);
            });
            var numbered = java.util.stream.IntStream.range(0, results.size()).boxed().toList();
            results = fillColumns(new Debug("ok", 0, results, null), numbered, metadata).steps();
        }
        var evidence = new ArrayList<Evidence>();
        for (int i = 0; i < checks.size(); i++) {
            var check = checks.get(i);
            var probe = plan.get(i);
            evidence.add(switch (check.kind()) {
                case "execution" -> new Evidence(run, List.of(), true);
                case "result_set" -> new Evidence(run, tables(run), !tables(run).isEmpty());
                case "negative_check" -> negative(check, probes, results, probe);
                default -> evidence(probes.report(results, probe.query(), 0));
            });
        }
        return new Observation(run, evidence);
    }

    private static Set<Integer> emptySets(List<TraceStep> steps, Collection<Integer> indices) {
        var empty = new HashSet<Integer>();
        for (int index : indices)
            if (index < steps.size() && steps.get(index).tables().stream().anyMatch(t -> t.columns().isEmpty())) empty.add(index);
        return empty;
    }

    private static Debug fillColumns(Debug run, List<Integer> indices, Map<Integer, List<List<String>>> metadata) {
        var steps = new ArrayList<TraceStep>();
        for (int i = 0; i < run.steps().size(); i++) {
            var step = run.steps().get(i);
            var columns = metadata.getOrDefault(indices.get(i), List.of());
            var tables = new ArrayList<SchoolLabRunner.ResultTable>();
            for (int j = 0; j < step.tables().size(); j++) {
                var table = step.tables().get(j);
                tables.add(table.columns().isEmpty() && j < columns.size()
                    ? new SchoolLabRunner.ResultTable(columns.get(j), table.rows()) : table);
            }
            steps.add(new TraceStep(step.startLine(), step.endLine(), step.summary(), step.status(), step.elapsedMs(),
                step.affectedRows(), tables, step.changes()));
        }
        return new Debug(run.status(), run.elapsedMs(), steps, run.error());
    }

    private Evidence negative(ExamCatalog.Check check, ExamSqlBatch batch, List<TraceStep> results, Probe probe) {
        var positive = batch.report(results, probe.positive(), 0);
        var before = evidence(batch.report(results, probe.query(), 0));
        var negative = batch.report(results, probe.negative(), 0);
        var after = evidence(batch.report(results, probe.after(), 0));
        var codes = check.expectedErrorCodes();
        boolean pass = positive.status().equals("ok") && before.accepted() && after.accepted() && negative.error() != null
            && codes.contains(negative.error().code()) && difference(before.tables(), after.tables(), true, true).match();
        String reason = !positive.status().equals("ok") ? "正例失败：" + description(positive)
            : !before.accepted() ? description(before.run())
            : !after.accepted() ? description(after.run())
            : negative.error() == null ? "反例执行成功，未被拦截。"
            : negative.error().raw() + (codes.contains(negative.error().code()) ? "。反例执行后状态已改变。" : "");
        var report = pass ? after.run() : new Debug("check_failed", 0, List.of(),
            new ExamSqlScript.Diagnostic(0, negative.error() == null ? 0 : negative.error().code(),
                "预期错误码 " + codes + "。实际：" + reason, "确认非法语句被指定约束拦截，且数据保持不变。"));
        return new Evidence(report, after.tables(), pass);
    }

    private static Evidence evidence(Debug run) { return new Evidence(run, tables(run), run.status().equals("ok")); }
    private static List<SchoolLabRunner.ResultTable> tables(Debug run) {
        return run.steps().stream().flatMap(step -> step.tables().stream()).toList();
    }

    private String seed(SchoolCourseCatalog.Course course, ExamCatalog.Question q) {
        return courses.seed(course) + "\n" + Objects.toString(q.setupSql(), "");
    }

    private static String description(Debug run) {
        if (run.error() == null) return "没有生成所需结果或对象。";
        return run.error().raw() + " " + run.error().advice();
    }

    static Debug execute(MysqlEnvironment.ExamSession session, String source, boolean trace, int offset) {
        var steps = ExamSqlScript.split(source);
        if (steps.isEmpty()) throw ApiException.invalid("sql", "请输入至少一条 SQL 语句。");
        String marker = "cs_" + UUID.randomUUID().toString().replace("-", "");
        String delimiter = "$$" + marker.substring(3, 13) + "$$";
        if (!trace) {
            var batch = new ExamSqlBatch();
            var indices = steps.stream().map(step -> batch.add(step, offset)).toList();
            long started = System.nanoTime();
            var result = batch.run(session, false);
            return batch.report(result, indices, elapsed(started));
        }
        StringBuilder batch = new StringBuilder(LIMITS).append("DELIMITER ").append(delimiter).append('\n');
        int line = 3;
        if (trace) line += append(batch, snapshot(marker, delimiter));
        var locations = new ArrayList<BatchStep>();
        for (var step : steps) {
            int first = line;
            line += append(batch, "SET @" + marker + "_started = NOW(6)" + delimiter);
            first++;
            line += append(batch, step.sql() + "\n" + delimiter);
            line += append(batch, "SELECT ROW_COUNT() AS " + marker + ", TIMESTAMPDIFF(MICROSECOND, @" + marker
                + "_started, NOW(6)) DIV 1000 AS elapsed" + delimiter);
            locations.add(new BatchStep(step, first, line - 1));
            if (trace) line += append(batch, snapshot(marker, delimiter));
        }
        long start = System.nanoTime();
        var output = session.query(batch.toString(), false, false, false);
        var tables = parse(output.transcript());
        String raw = output.errors().isEmpty() ? null : output.errors().getFirst();
        int errorAt = raw == null ? 0 : java.util.regex.Pattern.compile(" at line (\\d+):").matcher(raw).results()
            .findFirst().map(match -> Integer.parseInt(match.group(1))).orElse(0);
        var result = new ArrayList<TraceStep>();
        var pending = new ArrayList<SchoolLabRunner.ResultTable>();
        Map<String, State> before = Map.of();
        int stepIndex = 0;
        int current = -1;
        for (var table : tables) {
            if (table.columns().contains(marker + "_table")) {
                var after = states(table);
                if (current >= 0) {
                    var prior = result.get(current);
                    result.set(current, new TraceStep(prior.startLine(), prior.endLine(), prior.summary(), prior.status(),
                        prior.elapsedMs(), prior.affectedRows(), prior.tables(), changes(before, after)));
                }
                before = after;
            } else if (!table.columns().isEmpty() && table.columns().getFirst().equals(marker) && stepIndex < steps.size()) {
                var row = table.rows().getFirst();
                long count = Long.parseLong(row.get(0));
                result.add(step(steps.get(stepIndex++), offset, "ok", row.get(1) == null ? null : Long.parseLong(row.get(1)),
                    count < 0 ? null : count, List.copyOf(pending)));
                current = result.size() - 1;
                pending.clear();
            } else pending.add(table);
        }
        ExamSqlScript.Diagnostic error = null;
        if (raw != null || stepIndex != steps.size()) {
            int failed = Math.min(stepIndex, steps.size() - 1);
            var location = locations.get(failed);
            if (errorAt != 0) {
                for (int i = 0; i < locations.size(); i++) {
                    var candidate = locations.get(i);
                    if (errorAt >= candidate.line() && errorAt <= candidate.stateLine()) { location = candidate; break; }
                }
            }
            var step = location.step();
            error = ExamSqlScript.diagnostic(raw == null ? "脚本未正常结束，请检查引号、注释及 DELIMITER。" : raw,
                step.startLine() + offset, step.endLine() + offset, location.line() - 1);
            if (stepIndex < steps.size()) result.add(step(step, offset, "error", null, null, pending));
        }
        return new Debug(error == null ? "ok" : "sql_error", (System.nanoTime() - start) / 1_000_000, result, error);
    }

    private static long elapsed(long start) { return (System.nanoTime() - start) / 1_000_000; }

    private static int append(StringBuilder batch, String line) {
        batch.append(line).append('\n');
        return (int) line.chars().filter(c -> c == '\n').count() + 1;
    }

    private static Debug schema(MysqlEnvironment.ExamSession session, boolean tablePreview) {
        long start = System.nanoTime();
        var objects = execute(session, """
            SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE IN ('BASE TABLE','VIEW') ORDER BY TABLE_NAME
            """, false, 0);
        if (!objects.status().equals("ok"))
            throw new MysqlEnvironment.Failure("result_error", "无法读取隔离库对象。");
        var batch = new ExamSqlBatch();
        var indices = new ArrayList<Integer>();
        for (var table : tables(objects)) {
            for (var row : table.rows()) {
                String name = quoteIdentifier(row.getFirst());
                indices.addAll(batch.add(tablePreview ? "DESCRIBE " + name
                    : "SHOW CREATE " + (row.get(1).equals("VIEW") ? "VIEW " : "TABLE ") + name));
                indices.addAll(batch.add("SELECT * FROM " + name + (tablePreview ? " LIMIT 3" : " LIMIT 5")));
            }
        }
        if (indices.isEmpty()) return new Debug("ok", elapsed(start), List.of(), null);
        var result = batch.run(session, false);
        var report = batch.report(result, indices, elapsed(start));
        if (!report.status().equals("ok"))
            throw new MysqlEnvironment.Failure("result_error", description(report));
        return report;
    }

    private static String quoteIdentifier(String value) {
        return "`" + value.replace("`", "``") + "`";
    }

    private static Map<String, State> states(SchoolLabRunner.ResultTable table) {
        var states = new LinkedHashMap<String, State>();
        for (var row : table.rows()) {
            if (row.getFirst() == null) continue;
            var columns = JSON.readTree(row.get(3)).valueStream().map(value -> value.asText()).toList();
            var preview = JSON.readTree(row.get(4)).valueStream().map(values ->
                values.valueStream().map(value -> value.isNull() ? null : value.asText()).toList()).toList();
            states.put(row.getFirst(), new State(row.get(1), row.get(2), columns, preview));
        }
        return states;
    }

    private static List<TableChange> changes(Map<String, State> before, Map<String, State> after) {
        var names = new TreeSet<>(before.keySet());
        names.addAll(after.keySet());
        var changes = new ArrayList<TableChange>();
        for (var name : names) {
            var old = before.get(name);
            var next = after.get(name);
            if (old != null && old.sameData(next)) continue;
            var preview = next == null ? null : new SchoolLabRunner.ResultTable(next.columns(), next.preview());
            changes.add(new TableChange(name, label(old), label(next), preview));
        }
        return changes;
    }

    private static String label(State state) {
        return state == null ? "不存在" : state.rows() + " 行 · " + Objects.toString(state.fingerprint(), "空") + "/" + state.columns().size();
    }

    private static String snapshot(String marker, String delimiter) {
        String query = """
            WITH fields AS (
                SELECT c.TABLE_NAME,
                       CONCAT('`',REPLACE(c.TABLE_NAME,'`','``'),'`') AS tab,
                       CONCAT('`',REPLACE(c.COLUMN_NAME,'`','``'),'`') AS col,
                       c.COLUMN_NAME,c.ORDINAL_POSITION
                FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
                  ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
                WHERE c.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE'
            ), objects AS (
                SELECT TABLE_NAME, tab,
                    GROUP_CONCAT(CONCAT('HEX(CAST(',col,' AS BINARY))') ORDER BY ORDINAL_POSITION) AS signature,
                    GROUP_CONCAT(CONCAT('LEFT(CONVERT(',col,' USING utf8mb4),64)') ORDER BY ORDINAL_POSITION) AS preview,
                    CONCAT('[',GROUP_CONCAT(JSON_QUOTE(COLUMN_NAME) ORDER BY ORDINAL_POSITION),']') AS names
                FROM fields GROUP BY TABLE_NAME,tab
            )
            SELECT GROUP_CONCAT(CONCAT(
                'SELECT CONVERT(0x',HEX(TABLE_NAME),' USING utf8mb4) AS %s_table, COUNT(*) AS n, ',
                'CONCAT(COUNT(*),''/'', BIT_XOR(CAST(CONV(LEFT(SHA2(JSON_ARRAY(',signature,
                '),256),16),16,10) AS UNSIGNED)),''/'',SUM(CRC32(JSON_ARRAY(',signature,')))) AS fingerprint, ',
                'CONVERT(0x',HEX(names),' USING utf8mb4) AS columns_json, ',
                'COALESCE((SELECT JSON_ARRAYAGG(sample) FROM (SELECT JSON_ARRAY(',preview,') AS sample FROM ',
                tab,' LIMIT 3) AS sample_rows),JSON_ARRAY()) AS preview_json FROM ',tab
            ) ORDER BY TABLE_NAME SEPARATOR ' UNION ALL ') FROM objects
            """.formatted(marker);
        String fallback = "SELECT NULL AS " + marker + "_table, 0, NULL, NULL, NULL";
        return "SET SESSION group_concat_max_len=65535" + delimiter + "\n"
            + "SET @" + marker + "_snapshot = COALESCE((" + query + "),'" + fallback + "')" + delimiter + "\n"
            + "PREPARE " + marker + " FROM @" + marker + "_snapshot" + delimiter + "\n"
            + "EXECUTE " + marker + delimiter + "\nDEALLOCATE PREPARE " + marker + delimiter;
    }

    static TraceStep step(ExamSqlScript.Step step, int offset, String status, Long elapsed, Long rows,
                                  List<SchoolLabRunner.ResultTable> tables) {
        String summary = step.sql().replaceAll("\\s+", " ");
        return new TraceStep(step.startLine() + offset, step.endLine() + offset,
            summary.substring(0, Math.min(120, summary.length())), status, elapsed, rows, tables, List.of());
    }

    static List<SchoolLabRunner.ResultTable> parse(String output) {
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            var xml = new StringBuilder("<results>");
            XML.matcher(output).results().forEach(match -> xml.append(match.group(1)));
            var sets = factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml.append("</results>").toString())))
                .getDocumentElement().getElementsByTagName("resultset");
            var tables = new ArrayList<SchoolLabRunner.ResultTable>();
            for (int i = 0; i < sets.getLength(); i++) {
                var columns = new ArrayList<String>();
                var values = new ArrayList<List<String>>();
                var rows = ((Element) sets.item(i)).getElementsByTagName("row");
                if (rows.getLength() > 100) throw new MysqlEnvironment.Failure("output_limit", "每个结果集最多 100 行。");
                for (int j = 0; j < rows.getLength(); j++) {
                    var row = new ArrayList<String>();
                    var fields = ((Element) rows.item(j)).getElementsByTagName("field");
                    for (int k = 0; k < fields.getLength(); k++) {
                        var field = (Element) fields.item(k);
                        if (j == 0) columns.add(field.getAttribute("name"));
                        row.add(field.hasAttribute("xsi:nil") ? null : field.getTextContent());
                    }
                    values.add(row);
                }
                tables.add(new SchoolLabRunner.ResultTable(columns, values));
            }
            return tables;
        } catch (MysqlEnvironment.Failure e) {
            throw e;
        } catch (Exception e) {
            throw new MysqlEnvironment.Failure("result_error", "MySQL 输出无法读取。");
        }
    }

    static Diff difference(List<SchoolLabRunner.ResultTable> expected, List<SchoolLabRunner.ResultTable> actual,
                           boolean ordered, boolean named) {
        boolean columns = false, order = false;
        var missing = new ArrayList<List<String>>();
        var extra = new ArrayList<List<String>>();
        for (int i = 0; i < Math.max(expected.size(), actual.size()); i++) {
            var e = i < expected.size() ? expected.get(i) : new SchoolLabRunner.ResultTable(List.of(), List.of());
            var a = i < actual.size() ? actual.get(i) : new SchoolLabRunner.ResultTable(List.of(), List.of());
            columns |= e.columns().size() != a.columns().size()
                || named && (e.columns().isEmpty() || !normalizeColumns(e.columns()).equals(normalizeColumns(a.columns())));
            var ar = a.rows().stream().map(ExamSqlRunner::normalize).toList();
            var er = e.rows().stream().map(ExamSqlRunner::normalize).toList();
            var unmatched = new ArrayList<>(ar);
            for (int j = 0; j < er.size(); j++) if (!unmatched.remove(er.get(j))) missing.add(e.rows().get(j));
            unmatched = new ArrayList<>(er);
            for (int j = 0; j < ar.size(); j++) if (!unmatched.remove(ar.get(j))) extra.add(a.rows().get(j));
            order |= ordered && ar.size() == er.size() && !ar.equals(er);
        }
        return new Diff(expected.size() == actual.size() && !columns && !order && missing.isEmpty() && extra.isEmpty(),
            columns, order && missing.isEmpty() && extra.isEmpty(), missing, extra);
    }

    private static List<String> normalizeColumns(List<String> columns) {
        return columns.stream().map(column -> column == null ? null : column.toLowerCase(Locale.ROOT)).toList();
    }

    private static List<String> normalize(List<String> row) {
        return row.stream().map(value -> value != null && value.matches("-?(0|[1-9]\\d*)(\\.\\d+)?")
            ? new BigDecimal(value).stripTrailingZeros().toPlainString() : value).toList();
    }
}

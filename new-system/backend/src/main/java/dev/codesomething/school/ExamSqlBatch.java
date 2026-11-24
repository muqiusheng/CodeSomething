package dev.codesomething.school;

import dev.codesomething.sql.MysqlEnvironment;
import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Pattern;

final class ExamSqlBatch {
    private record Entry(ExamSqlScript.Step step, int offset, int line) {}
    private record Response(String text, String error) {}

    private static final Pattern AFFECTED = Pattern.compile("(?m)^Query OK, (\\d+) rows? affected[^\\r\\n]*");
    private static final Pattern TIMING = Pattern.compile("\\((\\d+(?:\\.\\d+)?) sec\\)\\s*$");
    private static final Pattern ERROR_LINE = Pattern.compile(" at line (\\d+):");
    private static final Pattern FIELD = Pattern.compile("(?m)^Field\\h+(\\d+):\\h+\u0060([\\s\\S]*?)\u0060\\RCatalog:\\h+");

    private final String marker = "cs_" + UUID.randomUUID().toString().replace("-", "");
    private final String delimiter = "$$" + marker.substring(3, 13) + "$$";
    private final StringBuilder sql = new StringBuilder(ExamSqlRunner.LIMITS).append("DELIMITER ").append(delimiter).append('\n');
    private final List<Entry> entries = new ArrayList<>();
    private Map<Integer, Response> responses = Map.of();
    private int line = 3;

    int add(ExamSqlScript.Step step, int offset) {
        int index = entries.size();
        entries.add(new Entry(step, offset, line));
        String block = "/*" + marker + "_" + index + "*/ " + step.sql()
            + "\n/*" + marker + "_end_" + index + "*/" + delimiter + "\n";
        sql.append(block);
        line += (int) block.chars().filter(c -> c == '\n').count();
        return index;
    }

    List<Integer> add(String script) {
        return ExamSqlScript.split(script).stream().map(step -> add(step, 0)).toList();
    }

    private Map<Integer, Response> query(MysqlEnvironment.ExamSession session, boolean force, boolean metadata) {
        var output = session.query(sql.toString(), force, metadata, true);
        var byStep = new HashMap<Integer, String>();
        for (var error : output.errors()) {
            var index = ERROR_LINE.matcher(error);
            if (!index.find()) throw new MysqlEnvironment.Failure("result_error", "MySQL 未返回可识别的语句位置。");
            int at = Integer.parseInt(index.group(1));
            for (int i = entries.size() - 1; i >= 0; i--) {
                if (at >= entries.get(i).line()) {
                    byStep.putIfAbsent(i, error);
                    break;
                }
            }
        }
        String raw = output.transcript();
        var pattern = Pattern.compile("(?m)^--------------\\R/\\*\\h*" + marker + "_(\\d+)\\*/");
        var headers = pattern.matcher(raw).results().toList();
        var result = new HashMap<Integer, Response>();
        for (int i = 0; i < headers.size(); i++) {
            var header = headers.get(i);
            int index = Integer.parseInt(header.group(1));
            String statementAndResult = raw.substring(header.end(), i + 1 == headers.size() ? raw.length() : headers.get(i + 1).start());
            var separator = Pattern.compile("(?m)^/\\*" + marker + "_end_" + index + "\\*/\\h*\\R--------------\\R").matcher(statementAndResult);
            result.put(index, new Response(separator.find() ? statementAndResult.substring(separator.end()) : "", byStep.get(index)));
        }
        byStep.forEach((index, error) -> result.putIfAbsent(index, new Response("", error)));
        return result;
    }

    List<ExamSqlRunner.TraceStep> run(MysqlEnvironment.ExamSession session, boolean force) {
        responses = query(session, force, false);
        var steps = new ArrayList<ExamSqlRunner.TraceStep>();
        for (int index = 0; index < entries.size(); index++) {
            var entry = entries.get(index);
            var response = responses.get(index);
            if (response == null || response.error() != null) {
                steps.add(ExamSqlRunner.step(entry.step(), entry.offset(), "error", null, null,
                    response == null ? List.of() : ExamSqlRunner.parse(response.text())));
                if (!force) break;
                continue;
            }
            String stats = ExamSqlRunner.XML.matcher(response.text()).replaceAll("");
            var affected = AFFECTED.matcher(stats);
            Long count = affected.find() ? Long.parseLong(affected.group(1)) : null;
            var timing = stats.lines().map(TIMING::matcher).filter(java.util.regex.Matcher::find)
                .map(match -> new BigDecimal(match.group(1)).movePointRight(3).longValue()).reduce(Long::sum).orElse(null);
            steps.add(ExamSqlRunner.step(entry.step(), entry.offset(), "ok", timing, count, ExamSqlRunner.parse(response.text())));
        }
        return steps;
    }

    ExamSqlRunner.Debug report(List<ExamSqlRunner.TraceStep> all, List<Integer> indices, long elapsed) {
        var steps = new ArrayList<ExamSqlRunner.TraceStep>();
        for (int index : indices) {
            var entry = entries.get(index);
            if (index < all.size()) {
                var result = all.get(index);
                steps.add(result);
                if (result.status().equals("ok")) continue;
            }
            String raw = Optional.ofNullable(responses.get(index)).map(Response::error)
                .orElse("脚本未正常结束，请检查引号、注释及 DELIMITER。");
            var error = ExamSqlScript.diagnostic(raw, entry.step().startLine() + entry.offset(), entry.step().endLine() + entry.offset(),
                entry.line() - 1);
            return new ExamSqlRunner.Debug("sql_error", elapsed, steps, error);
        }
        return new ExamSqlRunner.Debug("ok", elapsed, steps, null);
    }

    Map<Integer, List<List<String>>> columns(MysqlEnvironment.ExamSession session, boolean force, Set<Integer> wanted) {
        var result = new HashMap<Integer, List<List<String>>>();
        var replies = query(session, force, true);
        for (int index : wanted) {
            var response = replies.get(index);
            if (response == null || response.error() != null) continue;
            var sets = new ArrayList<List<String>>();
            List<String> columns = new ArrayList<>();
            var fields = FIELD.matcher(response.text());
            while (fields.find()) {
                if (fields.group(1).equals("1") && !columns.isEmpty()) {
                    sets.add(List.copyOf(columns));
                    columns.clear();
                }
                columns.add(fields.group(2));
            }
            if (!columns.isEmpty()) sets.add(List.copyOf(columns));
            result.put(index, List.copyOf(sets));
        }
        return result;
    }
}

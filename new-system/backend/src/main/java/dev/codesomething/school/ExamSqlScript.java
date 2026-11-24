package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.util.*;
import java.util.regex.Pattern;

final class ExamSqlScript {
    record Step(String sql, int startLine, int endLine) {}
    record Diagnostic(int line, int code, String raw, String advice) {}
    private static final Pattern DELIMITER = Pattern.compile("(?i)^[\\t ]*DELIMITER[\\t ]+(\\S+)[\\t ]*$");
    private static final Pattern ERROR = Pattern.compile("ERROR (\\d+).*?(?: at line (\\d+):|:)");
    private static final Pattern INNER = Pattern.compile(" at line (\\d+)\\s*$");

    private ExamSqlScript() {}

    static List<Step> split(String source) {
        String sql = source.replace("\r\n", "\n").replace('\r', '\n');
        var steps = new ArrayList<Step>();
        String delimiter = ";";
        int line = 1, start = -1, startLine = 1, endLine = 1;
        char quote = 0;
        for (int i = 0; i < sql.length();) {
            char c = sql.charAt(i);
            if (quote == 0) {
                if ((i == 0 || sql.charAt(i - 1) == '\n') && start < 0) {
                    int end = sql.indexOf('\n', i);
                    if (end < 0) end = sql.length();
                    var directive = DELIMITER.matcher(sql.substring(i, end));
                    if (directive.matches()) {
                        delimiter = directive.group(1);
                        if (!delimiter.matches("[A-Za-z0-9;$|/@!%~^:+=?._-]{1,15}") || delimiter.startsWith("/*") || delimiter.startsWith("--"))
                            throw ApiException.invalid("sql", "DELIMITER 请使用 1–15 个英文字母、数字或标点字符。");
                        i = end;
                        continue;
                    }
                }
                if (sql.startsWith(delimiter, i)) {
                    if (start >= 0) steps.add(new Step(sql.substring(start, i).stripTrailing(), startLine, endLine));
                    start = -1;
                    i += delimiter.length();
                    continue;
                }
                if (c == '#' || sql.startsWith("--", i) && (i + 2 == sql.length() || Character.isWhitespace(sql.charAt(i + 2)))) {
                    int end = sql.indexOf('\n', i);
                    i = end < 0 ? sql.length() : end;
                    continue;
                }
                if (sql.startsWith("/*", i) && !sql.startsWith("/*!", i)) {
                    int end = sql.indexOf("*/", i + 2);
                    if (end >= 0) {
                        while (i < end + 2) if (sql.charAt(i++) == '\n') line++;
                        continue;
                    }
                }
                if (c == '\'' || c == '"' || c == '\u0060') quote = c;
            } else if (c == '\\' && quote != '\u0060' && i + 1 < sql.length()) {
                if (sql.charAt(i + 1) == '\n') line++;
                i += 2;
                endLine = line;
                continue;
            } else if (c == quote) {
                if (i + 1 < sql.length() && sql.charAt(i + 1) == quote) {
                    i += 2;
                    continue;
                }
                quote = 0;
            }
            if (!Character.isWhitespace(c)) {
                if (start < 0) { start = i; startLine = line; }
                endLine = line;
            }
            if (c == '\n') line++;
            i++;
        }
        if (start >= 0) steps.add(new Step(sql.substring(start).stripTrailing(), startLine, endLine));
        if (steps.size() > 32) throw ApiException.invalid("sql", "每次最多执行 32 条语句。");
        return steps;
    }

    static Diagnostic diagnostic(String raw, int start, int end, int prefix) {
        var error = ERROR.matcher(raw);
        boolean matched = error.find();
        int code = matched ? Integer.parseInt(error.group(1)) : 0;
        int line = matched && error.group(2) != null ? start + Math.max(0, Integer.parseInt(error.group(2)) - prefix - 1) : start;
        var inner = INNER.matcher(raw);
        boolean hasInner = code == 1064 && inner.find();
        if (hasInner) line += Integer.parseInt(inner.group(1)) - 1;
        int sourceLine = Math.clamp(line, start, end);
        String displayRaw = normalizeErrorLine(raw, matched ? error : null, hasInner ? inner : null, sourceLine);
        String advice = switch (code) {
            case 3822 -> "CHECK 约束名冲突。若要重建已存在的表，请先执行 DROP TABLE IF EXISTS；也可以为约束指定唯一名称。";
            case 1050 -> "数据表已存在。如需重建，请先执行 DROP TABLE IF EXISTS 表名;";
            case 1054 -> "未知列名。请核对左侧表结构中的字段拼写与别名。";
            case 1062 -> "主键或唯一约束冲突，存在重复键值。";
            case 1064 -> "SQL 语法错误。请检查报错行及上一行的逗号、括号、分号或关键字。";
            case 1146 -> "数据表不存在。请核对表名拼写。";
            case 1451 -> "外键参照完整性冲突，父表记录正被子表引用。";
            case 1452 -> "外键参照完整性冲突，父表无对应键值。";
            case 3819 -> "违反 CHECK 检查约束。请核对字段取值范围。";
            case 1055 -> "GROUP BY 规则冲突。SELECT 中的非聚合列须参与分组，或由分组键唯一确定。";
            default -> "请结合下方 MySQL 原始报错信息，检查出错行的语法与对象定义。";
        };
        return new Diagnostic(sourceLine, code, displayRaw, advice);
    }

    private static String normalizeErrorLine(String raw, java.util.regex.Matcher error, java.util.regex.Matcher inner, int sourceLine) {
        if (sourceLine <= 0) return raw;
        String value = Integer.toString(sourceLine);
        var normalized = new StringBuilder(raw);
        int outerEnd = error != null && error.group(2) != null ? error.end(2) : -1;
        if (inner != null && inner.start(1) >= outerEnd) {
            normalized.replace(inner.start(1), inner.end(1), value);
        }
        if (error != null && error.group(2) != null) {
            normalized.replace(error.start(2), error.end(2), value);
        }
        return normalized.toString();
    }
}

package dev.codesomething.school;

import java.util.*;
import java.util.regex.Pattern;

final class ExamRules {
    private static final Pattern TOKENS = Pattern.compile("'(?:''|\\\\.|[^'\\\\])*'|\"(?:\"\"|\\\\.|[^\"\\\\])*\"|\u0060(?:\u0060\u0060|[^\u0060])*\u0060|[\\p{L}_$][\\p{L}\\p{N}_$]*|[0-9]+(?:\\.[0-9]+)?|<=>|<>|>=|<=|!=|\\S");
    private ExamRules() {}

    static String normalize(String sql) {
        var matcher = TOKENS.matcher(sql.strip().replaceFirst(";\\s*$", ""));
        var tokens = new StringJoiner(" ");
        while (matcher.find()) {
            String token = matcher.group();
            if (token.startsWith("'") || token.startsWith("\"")) {
                tokens.add(token);
                continue;
            }
            boolean identifier = token.length() >= 2 && token.startsWith("\u0060") && token.endsWith("\u0060");
            String word = token.toLowerCase(Locale.ROOT);
            if (identifier) tokens.add(word.substring(1, word.length() - 1));
            else tokens.add(switch (word) {
                case "!=" -> "<>";
                case "integer" -> "int";
                default -> word;
            });
        }
        return tokens.toString();
    }

    static int objective(ExamCatalog.Question question, List<String> answer) {
        return objective(question.kind(), question.points(), question.answer() == null ? List.of() : List.of(question.answer()),
            question.blanks(), answer);
    }

    static int objective(String kind, int points, List<String> correct, List<List<String>> blanks, List<String> answer) {
        if (kind.equals("blank")) {
            int earned = 0;
            for (int i = 0; i < Math.min(answer.size(), blanks.size()); i++) {
                String value = normalize(answer.get(i));
                if (blanks.get(i).stream().anyMatch(key -> normalize(key).equals(value)))
                    earned += points / blanks.size();
            }
            return earned;
        }
        return answer.equals(correct) ? points : 0;
    }
}

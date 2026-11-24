package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class ExamCatalog {
    record Paper(String id, String title, String group, String labId, List<Question> questions, Integer revision) {
        int version() { return revision == null ? 1 : revision; }
    }
    record Question(String id, String kind, int points, String prompt, String labId, List<String> tags,
                    String explanation, Map<String, String> options, String answer, List<List<String>> blanks,
                    String template, String referenceSql, String setupSql, List<Check> checks) {}
    record Check(String kind, String label, int points, String sql, String variantSql, String positiveSql,
                 String negativeSql, Integer errorCode, Boolean orderMatters, Boolean checkColumnNames,
                 List<Integer> errorCodes) {
        boolean ordered() { return Boolean.TRUE.equals(orderMatters); }
        boolean named() { return Boolean.TRUE.equals(checkColumnNames); }
        List<Integer> expectedErrorCodes() {
            var codes = new LinkedHashSet<Integer>();
            if (errorCode != null) codes.add(errorCode);
            if (errorCodes != null) codes.addAll(errorCodes);
            return new ArrayList<>(codes);
        }
    }
    record VisibleQuestion(String id, String kind, int points, String prompt, String labId, List<String> tags,
                           List<Option> options, String template, int blankCount) {}
    record Option(String id, String text) {}
    record Pack(List<Paper> papers, Map<String, Paper> byPaperId, Map<String, Question> questions,
                Map<String, Paper> origins, Map<String, String> labTitles) {}
    private record FileVersion(Path path, long size, FileTime modified) {}
    private record CachedPack(FileVersion course, List<FileVersion> papers, Pack pack) {}
    private static final Pattern PAPER_FILENAME = Pattern.compile("[a-z0-9-]+\\.json");

    private final Path root;
    private final JsonMapper json;
    private final SchoolCourseCatalog courses;
    private final Map<String, CachedPack> cache = new ConcurrentHashMap<>();

    ExamCatalog(@Value("${cs.course-directory:course-packs}") String path, JsonMapper json, SchoolCourseCatalog courses) {
        this.root = Path.of(path).toAbsolutePath().resolve("school");
        this.json = json;
        this.courses = courses;
    }

    List<Paper> papers(String courseId) {
        return pack(courseId).papers();
    }

    public boolean requiresSqlCheck(String courseId, String questionId) {
        var question = pack(courseId).questions().get(questionId);
        return question != null && question.kind().equals("sql");
    }

    Pack pack(String courseId) {
        return cache.compute(SchoolCourseCatalog.slug(courseId), this::refresh).pack();
    }

    private CachedPack refresh(String courseId, CachedPack previous) {
        var coursePath = root.resolve(courseId).resolve("course.json");
        var directory = coursePath.resolveSibling("exams");
        if (!Files.isRegularFile(coursePath)) throw missing();
        try {
            var course = version(coursePath);
            var files = new ArrayList<FileVersion>();
            if (Files.isDirectory(directory)) {
                try (var paths = Files.list(directory)) {
                    for (var file : paths.filter(path -> PAPER_FILENAME.matcher(path.getFileName().toString()).matches()).sorted().toList())
                        files.add(version(file));
                }
            }
            var archive = directory.resolve("archive");
            if (Files.isDirectory(archive)) {
                try (var paths = Files.list(archive)) {
                    for (var file : paths.filter(path -> PAPER_FILENAME.matcher(path.getFileName().toString()).matches()).sorted().toList())
                        files.add(version(file));
                }
            }
            if (previous != null && previous.course().equals(course) && previous.papers().equals(files)) return previous;
            var labs = new LinkedHashMap<String, String>();
            courses.course(courseId).labs().forEach(lab -> labs.put(lab.id(), lab.title()));
            var labIds = List.copyOf(labs.keySet());
            var byPaperId = new LinkedHashMap<String, Paper>();
            var questions = new HashMap<String, Question>();
            var origins = new HashMap<String, Paper>();
            for (var file : files) {
                var paper = json.readValue(file.path().toFile(), Paper.class);
                boolean historical = file.path().getParent().equals(archive);
                var filename = file.path().getFileName().toString();
                if (!filename.equals(paper.id() + ".json")
                    && !(historical && filename.equals(paper.id() + "-r" + paper.version() + ".json")))
                    throw new IllegalStateException("Exam ID mismatch: " + file.path());
                validate(paper, labIds, historical);
                if (!historical) byPaperId.put(paper.id(), paper);
                for (var question : paper.questions()) {
                    if (questions.putIfAbsent(question.id(), question) != null)
                        throw new IllegalStateException("Duplicate exam question ID: " + question.id());
                    origins.put(question.id(), paper);
                }
            }
            return new CachedPack(course, List.copyOf(files), new Pack(List.copyOf(byPaperId.values()), Map.copyOf(byPaperId),
                Map.copyOf(questions), Map.copyOf(origins), Collections.unmodifiableMap(labs)));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read exam packs", e);
        }
    }

    private static FileVersion version(Path file) throws IOException {
        var attributes = Files.readAttributes(file, BasicFileAttributes.class);
        return new FileVersion(file, attributes.size(), attributes.lastModifiedTime());
    }

    static void validate(Paper paper, List<String> labs) {
        validate(paper, labs, false);
    }

    private static void validate(Paper paper, List<String> labs, boolean historical) {
        require(paper, present(paper.title()) && Set.of("specialty", "mock").contains(paper.group()) && paper.version() > 0);
        if (paper.group().equals("specialty")) require(paper, labs.contains(paper.labId()));
        boolean original = historical && paper.questions().size() == 32;
        var kinds = original ? Map.of("choice", 15L, "boolean", 10L, "blank", 5L, "sql", 2L)
            : Map.of("choice", 10L, "boolean", 5L, "blank", 5L, "sql", 5L);
        var points = Map.of("choice", 2, "boolean", 2, "blank", 4, "sql", original ? 15 : 10);
        require(paper, paper.questions().size() == (original ? 32 : 25));
        for (var kind : kinds.entrySet())
            require(paper, paper.questions().stream().filter(q -> kind.getKey().equals(q.kind())).count() == kind.getValue());
        for (var q : paper.questions()) {
            require(paper, q.id().matches("[a-z0-9-]{1,64}") && q.points() == points.get(q.kind()) && present(q.prompt())
                && present(q.explanation()) && labs.contains(q.labId()) && !q.tags().isEmpty() && q.tags().stream().allMatch(ExamCatalog::present));
            switch (q.kind()) {
                case "choice" -> require(paper, q.options().keySet().equals(Set.of("A", "B", "C", "D"))
                    && q.options().containsKey(q.answer()) && q.options().values().stream().allMatch(ExamCatalog::present)
                    && new HashSet<>(q.options().values()).size() == 4);
                case "boolean" -> require(paper, Set.of("true", "false").contains(q.answer()));
                case "blank" -> {
                    require(paper, present(q.template()) && Set.of(1, 2, 4).contains(q.blanks().size()));
                    for (int i = 0; i < q.blanks().size(); i++) {
                        String token = "{{" + (i + 1) + "}}";
                        require(paper, q.template().indexOf(token) >= 0 && q.template().indexOf(token) == q.template().lastIndexOf(token)
                            && !q.blanks().get(i).isEmpty() && q.blanks().get(i).stream().allMatch(ExamCatalog::present));
                    }
                }
                case "sql" -> {
                    require(paper, present(q.referenceSql()) && q.checks().stream().mapToInt(Check::points).sum() == q.points());
                    if (!original) require(paper, q.checks().size() == 3
                        && q.checks().stream().anyMatch(c -> c.kind().equals("execution") && c.points() == 2 && !present(c.variantSql()))
                        && q.checks().stream().anyMatch(c -> !c.kind().equals("execution") && c.points() == 5 && !present(c.variantSql()))
                        && q.checks().stream().anyMatch(c -> !c.kind().equals("execution") && c.points() == 3 && present(c.variantSql())));
                    for (var check : q.checks()) {
                        require(paper, check.points() > 0 && present(check.label()));
                        switch (check.kind()) {
                            case "execution", "result_set" -> {}
                            case "post_query", "state_check" -> require(paper, present(check.sql()));
                            case "negative_check" -> require(paper, present(check.sql()) && present(check.positiveSql())
                                && present(check.negativeSql()) && !check.expectedErrorCodes().isEmpty()
                                && check.expectedErrorCodes().stream().allMatch(code -> code != null && code > 0));
                            default -> require(paper, false);
                        }
                    }
                }
            }
        }
    }

    private static boolean present(String text) { return text != null && !text.isBlank(); }

    private static void require(Paper paper, boolean condition) {
        if (!condition) throw new IllegalStateException("Invalid exam pack: " + paper.id());
    }

    static VisibleQuestion visible(Question q, List<String> order) {
        return new VisibleQuestion(q.id(), q.kind(), q.points(), q.prompt(), q.labId(), q.tags(),
            q.options() == null ? List.of() : order.stream().map(id -> new Option(id, q.options().get(id))).toList(),
            q.template(), q.blanks() == null ? 0 : q.blanks().size());
    }

    static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "SCHOOL_EXAM_NOT_FOUND", "找不到这份试卷、作答或错题。", Map.of());
    }
}

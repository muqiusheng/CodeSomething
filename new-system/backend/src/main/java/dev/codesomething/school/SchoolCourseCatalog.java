package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
class SchoolCourseCatalog {
    record Course(String id, String title, String term, String termTitle, int termOrder, String school,
                  String major, String summary, String engine, String database, List<String> extraDatabases,
                  List<LabOutline> labs) {}
    record LabOutline(String id, String title) {}
    record Lab(String id, String objective, String requirements, List<Question> questions,
               String originalObjective, String originalNotes, List<SourceTable> sourceTables, String fixtureSql) {}
    record SourceTable(String title, List<String> columns, List<List<String>> rows) {}
    record Question(String id, String title, String requirement, String hint, boolean optional, String starterSql,
                    String originalText) {}

    record LabCheck(String id, String referenceSql, String setupSql, List<ExamCatalog.Check> checks) {}

    private final Path directory;
    private final JsonMapper json;

    SchoolCourseCatalog(@Value("${cs.course-directory:course-packs}") String directory, JsonMapper json) {
        this.directory = Path.of(directory).toAbsolutePath().resolve("school");
        this.json = json;
    }

    List<Course> courses() {
        if (!Files.isDirectory(directory)) return List.of();
        try (var entries = Files.list(directory)) {
            return entries.filter(entry -> Files.isRegularFile(entry.resolve("course.json")))
                .map(entry -> course(entry.getFileName().toString()))
                .sorted(Comparator.comparingInt(Course::termOrder).thenComparing(Course::title)).toList();
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read school packs", e);
        }
    }

    Course course(String id) {
        var path = directory.resolve(slug(id)).resolve("course.json");
        if (!Files.isRegularFile(path)) throw missing();
        var course = json.readValue(path.toFile(), Course.class);
        if (!id.equals(course.id()) || !Set.of("mysql", "manual").contains(course.engine())
            || course.labs().isEmpty() || course.labs().stream().map(LabOutline::id).distinct().count() != course.labs().size())
            throw new IllegalStateException("Invalid school course: " + id);
        return course;
    }

    LabOutline outline(Course course, String labId) {
        return course.labs().stream().filter(lab -> lab.id().equals(labId)).findFirst().orElseThrow(SchoolCourseCatalog::missing);
    }

    Lab lab(Course course, String labId) {
        outline(course, labId);
        var lab = json.readValue(directory.resolve(course.id()).resolve("labs").resolve(slug(labId) + ".json").toFile(), Lab.class);
        if (!labId.equals(lab.id()) || lab.questions().isEmpty()
            || lab.questions().stream().map(Question::id).distinct().count() != lab.questions().size())
            throw new IllegalStateException("Invalid school lab: " + labId);
        lab.questions().forEach(question -> slug(question.id()));
        return lab;
    }

    private Path labCheckPath(Course course, Lab lab) {
        return directory.resolve(course.id()).resolve("labs/checks").resolve(slug(lab.id()) + ".json");
    }

    boolean hasLabChecks(Course course, Lab lab) {
        return Files.isRegularFile(labCheckPath(course, lab));
    }

    Map<String, ExamCatalog.Question> labChecks(Course course, Lab lab) {
        var path = labCheckPath(course, lab);
        if (!Files.isRegularFile(path)) return Map.of();
        var definitions = new LinkedHashMap<String, LabCheck>();
        for (var check : json.readValue(path.toFile(), LabCheck[].class)) {
            if (definitions.putIfAbsent(check.id(), check) != null || check.referenceSql().isBlank()
                || !check.checks().stream().map(ExamCatalog.Check::points).toList().equals(List.of(2, 5, 3))
                || !check.checks().getFirst().kind().equals("execution")
                || check.checks().getLast().variantSql() == null || check.checks().getLast().variantSql().isBlank())
                throw new IllegalStateException("Invalid lab check: " + check.id());
        }
        if (!definitions.keySet().equals(new HashSet<>(lab.questions().stream().map(Question::id).toList())))
            throw new IllegalStateException("Incomplete lab checks: " + lab.id());
        var questions = new LinkedHashMap<String, ExamCatalog.Question>();
        for (var question : lab.questions()) {
            var definition = definitions.get(question.id());
            questions.put(question.id(), new ExamCatalog.Question(lab.id() + "-" + question.id(), "sql",
                10, question.requirement(), lab.id(), List.of(question.title()), "", null, null, null,
                null, definition.referenceSql(), definition.setupSql(), definition.checks()));
        }
        return Collections.unmodifiableMap(questions);
    }

    String seed(Course course) {
        try { return Files.readString(directory.resolve(course.id()).resolve("seed.sql")); }
        catch (IOException e) { throw new IllegalStateException("Cannot read school seed: " + course.id(), e); }
    }

    static String slug(String id) {
        if (id == null || !id.matches("[a-z0-9][a-z0-9-]{0,63}")) throw missing();
        return id;
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "SCHOOL_PACK_NOT_FOUND", "找不到这门课程或实验。", Map.of());
    }
}

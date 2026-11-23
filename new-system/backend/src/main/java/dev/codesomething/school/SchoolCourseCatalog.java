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

    String seed(Course course) {
        try { return Files.readString(directory.resolve(course.id()).resolve("seed.sql")); }
        catch (IOException e) { throw new IllegalStateException("Cannot read school seed: " + course.id(), e); }
    }

    private static String slug(String id) {
        if (id == null || !id.matches("[a-z0-9][a-z0-9-]{0,63}")) throw missing();
        return id;
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "SCHOOL_PACK_NOT_FOUND", "找不到这门课程或实验。", Map.of());
    }
}

package dev.codesomething.school;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class SchoolExamPackCacheTest {
    @TempDir Path packRoot;

    @Test void reusesParsedPapersAndRefreshesAfterAnEditedOrRemovedFile() throws Exception {
        String courseId = "database-systems";
        var source = Path.of("../course-packs/school", courseId);
        var temporaryCourse = packRoot.resolve("school").resolve(courseId);
        Files.createDirectories(temporaryCourse.resolve("exams"));
        Files.copy(source.resolve("course.json"), temporaryCourse.resolve("course.json"));
        var paperFile = temporaryCourse.resolve("exams/exam-lab-01.json");
        Files.copy(source.resolve("exams/exam-lab-01.json"), paperFile);

        var json = JsonMapper.builder().build();
        var catalog = new ExamCatalog(packRoot.toString(), json, new SchoolCourseCatalog(packRoot.toString(), json));
        var original = catalog.pack(courseId);
        assertSame(original, catalog.pack(courseId));
        assertEquals(25, original.questions().size());
        assertTrue(catalog.requiresSqlCheck(courseId, "exam-lab-01-r3-q21"));
        assertFalse(catalog.requiresSqlCheck(courseId, "exam-lab-01-r3-q01"));

        var content = json.readTree(paperFile.toFile());
        var updated = (tools.jackson.databind.node.ObjectNode) content;
        updated.put("title", "替换后的实验一专项试卷标题");
        Files.writeString(paperFile, json.writeValueAsString(updated));
        var reloaded = catalog.pack(courseId);
        assertEquals("替换后的实验一专项试卷标题", reloaded.byPaperId().get("exam-lab-01").title());
        assertEquals(25, reloaded.questions().size());
        assertSame(reloaded, catalog.pack(courseId));

        Files.delete(paperFile);
        assertTrue(catalog.papers(courseId).isEmpty());
        assertFalse(catalog.requiresSqlCheck(courseId, "exam-lab-01-r3-q21"));
    }
}

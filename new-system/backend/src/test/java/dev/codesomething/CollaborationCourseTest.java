package dev.codesomething;

import dev.codesomething.boot.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CollaborationCourseTest {
    @Test void projectBPublishesEightProgressiveStagesWithoutExposingFormalAnswers() {
        assertTrue(BootCourses.supports("collaboration"));
        var courses=new BootCourses(Path.of("../course-packs").toAbsolutePath().toString());
        var project=courses.project("collaboration");
        var chapters=(java.util.List<?>)project.get("chapters");
        assertEquals(8,chapters.size());
        assertFalse(project.toString().contains("formalAnswer"));
        for(String stage:BootCourses.stages("collaboration")) {
            assertTrue(BootCourses.jdbc(stage));
            assertEquals(2,courses.questions(stage).size());
            assertEquals(2,courses.solution(stage).size());
            assertDoesNotThrow(()->BootProjectSnapshot.capture(Path.of("../course-packs/collaboration/1.0.0/"+stage+"/reference").toAbsolutePath().normalize(),true));
        }
    }
}

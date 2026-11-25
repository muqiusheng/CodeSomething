package dev.codesomething.school;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Short solution URLs alongside the existing course-scoped workspace URLs. */
@RestController
class SchoolSolutionRoutes {
    private final SchoolCourseController labs;
    private final SchoolExamController exams;

    SchoolSolutionRoutes(SchoolCourseController labs, SchoolExamController exams) {
        this.labs = labs;
        this.exams = exams;
    }

    @GetMapping("/api/school/{courseId}/labs/{labId}/questions/{questionId}/solution")
    SchoolCourseController.LabSolution lab(@PathVariable String courseId, @PathVariable String labId,
                                           @PathVariable String questionId) {
        return labs.solution(courseId, labId, questionId);
    }

    @GetMapping("/api/school/{courseId}/exams/{paperId}/drafts/{draftId}/questions/{questionId}/solution")
    SchoolExamController.Solution exam(@PathVariable String courseId, @PathVariable String paperId,
                                      @PathVariable String draftId, @PathVariable String questionId) {
        return exams.solution(courseId, paperId, draftId, questionId);
    }
}

package dev.codesomething.learning;

import dev.codesomething.courses.CourseController;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/learning")
@DependsOn("flyway")
public class LearningProgressController {
    private final JdbcTemplate jdbc;
    private final CourseController courses;
    public LearningProgressController(JdbcTemplate jdbc,CourseController courses){this.jdbc=jdbc;this.courses=courses;}
    public record Completion(String id,String courseId,String courseVersion,String stageId,String submissionId,String jobId,String understandingId,String snapshotDigest,String ruleVersion,String completedAt) {}
    public record Progress(String courseId,String courseVersion,List<Completion> completions,int completedCount,int totalCodeStages,boolean projectCompleted,String nextCodeStage,List<String> passedPractices) {}
    @GetMapping("/progress/{course}/{version}")
    public Progress read(@PathVariable String course,@PathVariable String version) {
        if(dev.codesomething.sql.SqlCourse.ID.equals(course)&&dev.codesomething.sql.SqlCourse.VERSION.equals(version)) {
            var results=jdbc.query("SELECT * FROM sql_completions WHERE course_version=? ORDER BY completed_at",(r,n)->new Completion(r.getString("id"),course,version,r.getString("stage_id"),r.getString("attempt_id"),r.getString("attempt_id"),r.getString("understanding_id"),r.getString("digest"),r.getString("rule_version"),r.getString("completed_at")),version);
            var completed=results.stream().map(Completion::stageId).toList();
            String next=dev.codesomething.sql.SqlCourse.STAGES.stream().filter(s->!completed.contains(s)).findFirst().orElse(null);
            return new Progress(course,version,results,results.size(),6,next==null,next,List.of());
        }
        courses.requirePublished(course,version,dev.codesomething.boot.BootCourses.supports(course)?dev.codesomething.boot.BootCourses.stages(course).getFirst():"1.0.0".equals(version)?"json-task-response":"workspace");
        var results=jdbc.query("SELECT * FROM stage_completions WHERE course_id=? AND course_version=? ORDER BY completed_at",(r,n)->new Completion(r.getString("id"),r.getString("course_id"),r.getString("course_version"),r.getString("stage_id"),r.getString("submission_id"),r.getString("job_id"),r.getString("understanding_id"),r.getString("snapshot_digest"),r.getString("rule_version"),r.getString("completed_at")),course,version);
        var stages=dev.codesomething.boot.BootCourses.supports(course)?dev.codesomething.boot.BootCourses.stages(course):"1.1.0".equals(version)?UnderstandingRules.CODE_STAGES:List.<String>of();
        var completed=results.stream().map(Completion::stageId).toList();
        String next=stages.stream().filter(stage->!completed.contains(stage)).findFirst().orElse(null);
        var passedPractices=dev.codesomething.workspaces.ConsoleOutputCheck.applies(course,version,"workspace")?jdbc.queryForList("""
            SELECT DISTINCT s.stage_id FROM check_jobs j JOIN submissions s ON s.id=j.submission_id
            WHERE s.course_id=? AND s.course_version=? AND s.stage_id IN ('workspace','workspace-http-text') AND j.status='passed' ORDER BY s.stage_id
            """,String.class,course,version):List.<String>of();
        return new Progress(course,version,results,results.size(),stages.size(),!stages.isEmpty()&&next==null,next,passedPractices);
    }
    public boolean completed(String course,String version,String stage){return jdbc.queryForObject("SELECT count(*) FROM stage_completions WHERE course_id=? AND course_version=? AND stage_id=?",Integer.class,course,version,stage)>0;}
}

package dev.codesomething.learning;

import dev.codesomething.api.ApiException;
import dev.codesomething.courses.CourseController;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.List;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/learning")
@DependsOn("flyway")
public class LearningSessionController {
    private final JdbcTemplate jdbc;
    private final CourseController courses;
    private final LearningProgressController progress;
    public static final List<String> CHAPTERS=List.of("workspace","request","response","json","run-server","trace","fix-response","transfer");
    public LearningSessionController(JdbcTemplate jdbc,CourseController courses,LearningProgressController progress) { this.jdbc = jdbc;this.courses=courses;this.progress=progress; }

    public record Session(String id, String courseId, String courseVersion, String stageId, String step, long revision, String updatedAt) {}
    public record SessionWrite(String courseId, String courseVersion, String stageId, String step, Long expectedRevision) {}
    public record ContinueResponse(Session session, String nextAction, boolean checksAvailable,String nextStageId,LearningProgressController.Progress progress) {}

    private Session current() {
        var rows = jdbc.query("SELECT id, course_id, course_version, stage_id, step, revision, updated_at FROM learning_sessions WHERE id='local'",
            (row, index) -> new Session(row.getString(1), row.getString(2), row.getString(3), row.getString(4), row.getString(5), row.getLong(6), row.getString(7)));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @GetMapping("/continue")
    public ContinueResponse resume() {
        var session = current();
        boolean sql=session!=null&&dev.codesomething.sql.SqlCourse.ID.equals(session.courseId());
        boolean boot=session!=null&&dev.codesomething.boot.BootCourses.supports(session.courseId());
        var state=progress.read(sql||boot?session.courseId():"http-json-basics",sql||boot?session.courseVersion():"1.1.0");
        if(session==null)return new ContinueResponse(null,"choose-course",true,"workspace",state);
        boolean code=sql||boot||UnderstandingRules.VERSION.equals(session.courseVersion())&&UnderstandingRules.CODE_STAGES.contains(session.stageId());
        String next=null,action="resume";
        if(code&&state.completions().stream().anyMatch(c->c.stageId().equals(session.stageId()))) {
            var chapters=boot?dev.codesomething.boot.BootCourses.stages(session.courseId()):sql?dev.codesomething.sql.SqlCourse.STAGES:CHAPTERS;
            int position=chapters.indexOf(session.stageId());next=position<chapters.size()-1?chapters.get(position+1):null;
            action=next==null?"project-summary":"next-stage";
        } else if(code) {
            var statuses=sql?jdbc.queryForList("SELECT status FROM sql_attempts WHERE course_version=? AND stage_id=? AND mode='check' ORDER BY created_at DESC LIMIT 1",String.class,session.courseVersion(),session.stageId()):jdbc.queryForList("SELECT j.status FROM check_jobs j JOIN submissions s ON s.id=j.submission_id WHERE s.course_id=? AND s.course_version=? AND s.stage_id=? ORDER BY j.created_at DESC LIMIT 1",String.class,session.courseId(),session.courseVersion(),session.stageId());
            if(!statuses.isEmpty()&&"passed".equals(statuses.getFirst()))action="verify-understanding";
        }
        return new ContinueResponse(session,action,code,next,state);
    }

    @PutMapping(value = "/sessions/local", consumes = "application/json")
    @Transactional
    public Session save(@RequestBody SessionWrite write) {
        if (write.courseId() == null || !write.courseId().matches("[a-z][a-z0-9-]{0,63}")) throw ApiException.invalid("courseId", "课程标识格式不正确。");
        if (write.stageId() == null || !write.stageId().matches("[a-z][a-z0-9-]{0,63}")) throw ApiException.invalid("stageId", "关卡标识格式不正确。");
        if (write.courseVersion() == null || write.courseVersion().length() > 32 || !write.courseVersion().matches("[0-9]+(\\.[0-9]+){1,2}")) throw ApiException.invalid("courseVersion", "课程版本格式不正确。");
        if (write.step() == null || !Set.of("teaching", "task", "report","understanding").contains(write.step())) throw ApiException.invalid("step", "学习位置格式不正确。");
        if (write.expectedRevision() == null || write.expectedRevision() < 0) throw ApiException.invalid("expectedRevision", "请提供当前学习位置版本。");
        courses.requirePublished(write.courseId(),write.courseVersion(),write.stageId());
        if(dev.codesomething.boot.BootCourses.supports(write.courseId())) {
            var state=progress.read(write.courseId(),write.courseVersion());var stages=dev.codesomething.boot.BootCourses.stages(write.courseId());
            if(state.nextCodeStage()!=null&&stages.indexOf(write.stageId())>stages.indexOf(state.nextCodeStage()))throw new ApiException(HttpStatus.CONFLICT,"PREVIEW_ONLY","预览中，正式续学位置保持不变。",Map.of());
        } else if(dev.codesomething.sql.SqlCourse.ID.equals(write.courseId())) {
            var state=progress.read(write.courseId(),write.courseVersion());
            if(state.nextCodeStage()!=null&&dev.codesomething.sql.SqlCourse.STAGES.indexOf(write.stageId())>dev.codesomething.sql.SqlCourse.STAGES.indexOf(state.nextCodeStage()))throw new ApiException(HttpStatus.CONFLICT,"PREVIEW_ONLY","正在预览后续章节，正式续学位置保持不变。",Map.of("nextCodeStage",state.nextCodeStage()));
        } else if("1.1.0".equals(write.courseVersion())) {
            var state=progress.read(write.courseId(),write.courseVersion());
            if(state.nextCodeStage()!=null&&CHAPTERS.indexOf(write.stageId())>CHAPTERS.indexOf(state.nextCodeStage()))
                throw new ApiException(HttpStatus.CONFLICT,"PREVIEW_ONLY","正在预览后续章节，正式续学位置保持不变。",Map.of("nextCodeStage",state.nextCodeStage()));
            if("understanding".equals(write.step())&&!UnderstandingRules.CODE_STAGES.contains(write.stageId()))throw ApiException.invalid("step","阅读章节使用随堂练习，无正式理解验证步骤。");
        }
        var existing = current();
        long revision = existing == null ? 0 : existing.revision();
        if (write.expectedRevision() != revision) throw conflict(revision);
        String now = Instant.now().toString();
        if (existing == null) {
            jdbc.update("INSERT INTO learning_sessions(id, course_id, course_version, stage_id, step, revision, updated_at) VALUES('local',?,?,?,?,1,?)",
                write.courseId(), write.courseVersion(), write.stageId(), write.step(), now);
        } else {
            int changed = jdbc.update("UPDATE learning_sessions SET course_id=?, course_version=?, stage_id=?, step=?, revision=revision+1, updated_at=? WHERE id='local' AND revision=?",
                write.courseId(), write.courseVersion(), write.stageId(), write.step(), now, revision);
            if (changed != 1) throw conflict(revision);
        }
        return current();
    }

    private ApiException conflict(long revision) {
        return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "学习位置已更新，请重新读取后再保存。", Map.of("currentRevision", revision));
    }
}

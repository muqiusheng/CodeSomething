package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1")
@DependsOn("flyway")
public class CheckJobController {
    private final JdbcTemplate jdbc;
    private final SubmissionController submissions;
    private final WorkspaceController workspaces;
    private final boolean enabled;
    @org.springframework.beans.factory.annotation.Value("${cs.runner.mode:local_first}") private String runnerMode;
    private final JsonMapper json=JsonMapper.builder().build();
    public CheckJobController(JdbcTemplate jdbc,SubmissionController submissions,WorkspaceController workspaces,@Value("${cs.runner.enabled:true}") boolean enabled) {this.jdbc=jdbc;this.submissions=submissions;this.workspaces=workspaces;this.enabled=enabled;}
    public record JobWrite(String submissionId,String idempotencyKey) {}
    public record Job(String id,String submissionId,String status,String createdAt,String message,CheckReport report,boolean stale,String freshness,CheckProgress.Progress progress) {}
    @PostMapping(value="/check-jobs",consumes="application/json")
    @Transactional
    public Job create(@RequestBody JobWrite write,@RequestHeader(value="Authorization",required=false) String authorization) {
        var submission=submissions.read(write.submissionId(),authorization);
        if(!"http-json-basics".equals(submission.courseId())&&!dev.codesomething.boot.BootCourses.supports(submission.courseId()))throw ApiException.invalid("courseId","此作业接口只运行HTTP/JSON课程；SQL请使用SQL提交入口。");
        if(!dev.codesomething.boot.BootCourses.supports(submission.courseId())&&!ConsoleOutputCheck.applies(submission.courseId(),submission.courseVersion(),submission.stageId())&&!HttpCourseChecks.textPractice(submission.courseId(),submission.courseVersion(),submission.stageId())&&!"1.0.0".equals(submission.courseVersion())&&!Set.of("run-server","fix-response","transfer").contains(submission.stageId()))
            throw ApiException.invalid("stageId","本章为阅读与理解练习，无需运行代码检查。");
        if(write.idempotencyKey()==null || !write.idempotencyKey().matches("[a-zA-Z0-9_-]{1,100}")) throw ApiException.invalid("idempotencyKey","请提供有效的幂等键。");
        var rows=jdbc.queryForList("SELECT id,submission_id FROM check_jobs WHERE binding_id=? AND idempotency_key=?",submission.bindingId(),write.idempotencyKey());
        if(!rows.isEmpty()) {
            var existing=rows.getFirst();
            if(!existing.get("submission_id").equals(submission.id())) throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_CONFLICT","此幂等键已经用于另一份快照，请创建新的检查。",Map.of());
            String id=(String)existing.get("id");
            if(enabled)jdbc.update("UPDATE check_jobs SET status='queued' WHERE id=? AND status='awaiting_runner'",id);
            return read(id,authorization);
        }
        int queueLimit = "docker_only".equals(runnerMode) ? 2 : 8;
        if(jdbc.queryForObject("SELECT count(*) FROM check_jobs WHERE status IN ('queued','running','cancelling')",Integer.class)>=queueLimit)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RUNNER_BUSY","检查队列已满，请等待或取消旧作业。",Map.of());
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO check_jobs(id,submission_id,binding_id,idempotency_key,status,created_at) VALUES(?,?,?,?,?,?)",id,submission.id(),submission.bindingId(),write.idempotencyKey(),enabled?"queued":"awaiting_runner",Instant.now().toString());
        return read(id,authorization);
    }
    @GetMapping("/jobs/{id}")
    public Job read(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization) {
        if(authorization==null) throw new ApiException(HttpStatus.UNAUTHORIZED,"PAIRING_REQUIRED","请先配对本地目录。",Map.of());
        var rows=jdbc.queryForList("SELECT * FROM check_jobs WHERE id=?",id);
        if(rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"JOB_NOT_FOUND","检查作业不存在。",Map.of());
        var row=rows.getFirst();var submission=submissions.read((String)row.get("submission_id"),authorization);
        boolean stale=true;String freshness="unknown";
        try {stale=!workspaces.current(submission.bindingId(),authorization).digest().equals(submission.digest());freshness=stale?"changed":"current";}catch(ApiException ignored){}
        String status=(String)row.get("status");
        boolean console=ConsoleOutputCheck.applies(submission.courseId(),submission.courseVersion(),submission.stageId());
        String message=switch(status) {
            case "queued"->"检查已排队。";case "running"->"docker_only".equals(runnerMode)
                ?"正在隔离容器内编译并验证代码。":"正在按项目配置编译并检查接口；普通练习优先使用本机运行结果。";
            case "passed"->console?"程序正常退出，已核对实际输出。":"功能检查通过，可以保存本关编码完成记录。理解巩固可选。";
            case "compile_error"->"编译未通过，请查看错误并修改代码。";
            case "business_error"->console?"这次运行未通过。请查看退出状态和控制台输出。":"接口行为未符合约定，请查看逐项结果。";
            case "environment_error"->"检查环境异常，请重试；不计为代码错误。";
            case "timed_out"->console?"控制台检查超时。本节要求 main 打印后正常退出。若代码仍包含 HTTP 服务器的创建和启动语句，请先把它们注释掉，再运行检查。":"检查超时，请排查启动或请求是否阻塞。";
            case "cancelling"->"正在取消并释放容器…";case "cancelled"->"检查已取消。";
            default->"检查作业等待隔离运行器启用；尚无功能通过结果。";
        };
        return new Job(id,submission.id(),status,(String)row.get("created_at"),message,row.get("report")==null?null:json.readValue((String)row.get("report"),CheckReport.class),stale,freshness,CheckProgress.read(id,status));
    }
    @PostMapping("/jobs/{id}/cancel")
    @Transactional
    public Job cancel(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization) {
        read(id,authorization);
        jdbc.update("UPDATE check_jobs SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END WHERE id=? AND status IN ('running','queued','awaiting_runner')",id);
        return read(id,authorization);
    }
    @GetMapping("/submissions/{id}/jobs")
    public List<Job> history(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization) {
        submissions.read(id,authorization);
        return jdbc.queryForList("SELECT id FROM check_jobs WHERE submission_id=? ORDER BY created_at DESC",String.class,id).stream().map(job->read(job,authorization)).toList();
    }
}

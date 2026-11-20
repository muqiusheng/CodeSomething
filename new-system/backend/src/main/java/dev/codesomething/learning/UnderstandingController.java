package dev.codesomething.learning;

import dev.codesomething.api.ApiException;
import dev.codesomething.workspaces.*;
import java.util.*;
import java.time.Instant;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/understanding-attempts")
@DependsOn("flyway")
public class UnderstandingController {
    private final CheckJobController jobs;
    private final SubmissionController submissions;
    private final UnderstandingRules rules;
    private final JdbcTemplate jdbc;
    private final JsonMapper json=JsonMapper.builder().build();
    public UnderstandingController(CheckJobController jobs,SubmissionController submissions,UnderstandingRules rules,JdbcTemplate jdbc){this.jobs=jobs;this.submissions=submissions;this.rules=rules;this.jdbc=jdbc;}
    public record AttemptWrite(String jobId,String ruleVersion,Map<String,Integer> answers,String idempotencyKey) {}
    public record Attempt(String id,String jobId,String ruleVersion,boolean passed,String feedback,String createdAt) {}
    @PostMapping(consumes="application/json")
    @Transactional
    public Attempt submit(@RequestBody AttemptWrite write,@RequestHeader(value="Authorization",required=false) String authorization) {
        var job=jobs.read(write.jobId(),authorization);
        var submission=submissions.read(job.submissionId(),authorization);
        var rule=rules.read(submission.courseId(),submission.courseVersion(),submission.stageId());
        if(!rule.ruleVersion().equals(write.ruleVersion()))throw conflict("RULE_CHANGED","验证规则已更新，请重新读取题目。");
        if(write.idempotencyKey()==null||!write.idempotencyKey().matches("[a-zA-Z0-9_-]{1,100}"))throw ApiException.invalid("idempotencyKey","请提供有效的幂等键。");
        if(write.answers()==null||!write.answers().keySet().equals(rules.solution(submission.stageId()).keySet()))throw ApiException.invalid("answers","请回答本关全部正式题目。");
        for(var question:rule.questions()) {Integer answer=write.answers().get(question.id());if(answer==null||answer<0||answer>=question.options().size())throw ApiException.invalid("answers","答案选项超出范围。");}
        String answers=json.writeValueAsString(new TreeMap<>(write.answers()));
        var repeated=jdbc.queryForList("SELECT * FROM understanding_attempts WHERE binding_id=? AND idempotency_key=?",submission.bindingId(),write.idempotencyKey());
        if(!repeated.isEmpty()) {
            var old=repeated.getFirst();
            if(!job.id().equals(old.get("job_id"))||!answers.equals(old.get("answers"))||!write.ruleVersion().equals(old.get("rule_version")))throw conflict("IDEMPOTENCY_CONFLICT","此请求编号已用于另一份答案，请重新提交。");
            return result(old,submission.stageId());
        }
        validateCode(job,submission);
        boolean passed=rules.solution(submission.stageId()).equals(write.answers());
        String id=UUID.randomUUID().toString(),now=Instant.now().toString();
        jdbc.update("INSERT INTO understanding_attempts(id,job_id,binding_id,rule_version,answers,passed,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)",id,job.id(),submission.bindingId(),write.ruleVersion(),answers,passed?1:0,write.idempotencyKey(),now);
        if(passed)jdbc.update("INSERT OR IGNORE INTO stage_completions(id,course_id,course_version,stage_id,submission_id,job_id,understanding_id,snapshot_digest,rule_version,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),submission.courseId(),submission.courseVersion(),submission.stageId(),submission.id(),job.id(),id,submission.digest(),write.ruleVersion(),now);
        if(passed)jdbc.update("UPDATE stage_completions SET understanding_id=? WHERE course_id=? AND course_version=? AND stage_id=? AND snapshot_digest=? AND understanding_id IS NULL",id,submission.courseId(),submission.courseVersion(),submission.stageId(),submission.digest());
        return new Attempt(id,job.id(),write.ruleVersion(),passed,passed?"正式理解验证通过，双结果证据已保存。":rules.feedback(submission.stageId()),now);
    }
    public record CodeWrite(String jobId) {}
    @PostMapping("/complete-code") @Transactional
    public Map<String,Object> completeCode(@RequestBody CodeWrite write,@RequestHeader(value="Authorization",required=false) String authorization) {
        var job=jobs.read(write.jobId(),authorization);
        var submission=submissions.read(job.submissionId(),authorization);
        rules.read(submission.courseId(),submission.courseVersion(),submission.stageId());
        validateCode(job,submission);
        jdbc.update("INSERT OR IGNORE INTO stage_completions(id,course_id,course_version,stage_id,submission_id,job_id,understanding_id,snapshot_digest,rule_version,completed_at) VALUES(?,?,?,?,?,?,NULL,?,?,?)",UUID.randomUUID().toString(),submission.courseId(),submission.courseVersion(),submission.stageId(),submission.id(),job.id(),submission.digest(),"code-1",Instant.now().toString());
        return Map.of("passed",true,"message","编码任务已完成，可以继续下一关。选择题可按需巩固。");
    }
    private void validateCode(CheckJobController.Job job,SubmissionController.Submission submission) {
        if(!"passed".equals(job.status())||job.report()==null||!job.report().functionalPassed()||job.stale())
            throw conflict("FUNCTIONAL_REQUIRED","请先让当前代码通过本关功能检查；代码变化或无法核对时，请重新预览并检查。");
        var report=job.report();
        if(!submission.digest().equals(report.snapshotDigest())||!submission.courseVersion().equals(report.courseVersion())||!submission.stageId().equals(report.stageId())||!rules.policy(submission.stageId()).equals(report.policy())||report.assertions()==null||report.assertions().isEmpty()||report.assertions().stream().anyMatch(a->!a.passed()))
            throw conflict("REPORT_MISMATCH","功能报告与本关代码或检查规则不一致，请重新检查。");
        var stages=dev.codesomething.boot.BootCourses.supports(submission.courseId())?dev.codesomething.boot.BootCourses.stages(submission.courseId()):UnderstandingRules.CODE_STAGES;
        int index=stages.indexOf(submission.stageId());
        if("collaboration".equals(submission.courseId())) {
            for(String stage:dev.codesomething.boot.BootCourses.TASKS)
                if(jdbc.queryForObject("SELECT count(*) FROM stage_completions WHERE course_id='task-manager' AND course_version='1.0.0' AND stage_id=?",Integer.class,stage)==0)
                    throw conflict("PREREQUISITE_REQUIRED","项目B可预览和运行检查；正式完成前请先完成项目A六关编程任务。");
        }
        if("task-manager".equals(submission.courseId())) {
            for(String stage:UnderstandingRules.CODE_STAGES)if(jdbc.queryForObject("SELECT count(*) FROM stage_completions WHERE course_id='http-json-basics' AND course_version='1.1.0' AND stage_id=?",Integer.class,stage)==0)throw conflict("PREREQUISITE_REQUIRED","请先完成HTTP代码基础。");
            if(jdbc.queryForObject("SELECT count(*) FROM sql_completions WHERE course_version='1.0.0' AND stage_id='sql-transfer'",Integer.class)==0||jdbc.queryForObject("SELECT count(*) FROM stage_completions WHERE course_id='boot-foundations' AND course_version='1.0.0' AND stage_id='boot-jdbc'",Integer.class)==0)throw conflict("PREREQUISITE_REQUIRED","请先完成SQL迁移与Boot JDBC；项目仍可预览和运行检查。");
        }
        if("boot-jdbc".equals(submission.stageId())&&jdbc.queryForObject("SELECT count(*) FROM sql_completions WHERE course_version='1.0.0' AND stage_id='sql-write'",Integer.class)==0)throw conflict("PREREQUISITE_REQUIRED","JDBC正式完成前请先完成SQL写入关卡。");
        for(String stage:stages.subList(0,index))
            if(jdbc.queryForObject("SELECT count(*) FROM stage_completions WHERE course_id=? AND course_version=? AND stage_id=?",Integer.class,submission.courseId(),submission.courseVersion(),stage)==0)throw conflict("PREREQUISITE_REQUIRED","可预览本章；正式完成前请先完成前面的代码关卡。");
    }
    @GetMapping("/jobs/{jobId}")
    public List<Attempt> history(@PathVariable String jobId,@RequestHeader(value="Authorization",required=false) String authorization) {
        var job=jobs.read(jobId,authorization);var submission=submissions.read(job.submissionId(),authorization);
        return jdbc.queryForList("SELECT * FROM understanding_attempts WHERE job_id=? ORDER BY created_at DESC,id",jobId).stream().map(row->result(row,submission.stageId())).toList();
    }
    private Attempt result(Map<String,Object> row,String stage){boolean passed=((Number)row.get("passed")).intValue()==1;return new Attempt((String)row.get("id"),(String)row.get("job_id"),(String)row.get("rule_version"),passed,passed?"正式理解验证通过，双结果证据已保存。":rules.feedback(stage),(String)row.get("created_at"));}
    private ApiException conflict(String code,String message){return new ApiException(HttpStatus.CONFLICT,code,message,Map.of());}
}

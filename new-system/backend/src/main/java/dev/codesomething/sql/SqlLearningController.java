package dev.codesomething.sql;

import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/sql")
@DependsOn("flyway")
public class SqlLearningController {
    private final JdbcTemplate jdbc;
    private final MysqlEnvironment environment;
    private final LearningDataSource storage;
    private final boolean publicMode;
    private final String dataDirectory;
    private final Map<String, MysqlEnvironment> instances = new ConcurrentHashMap<>();
    private int nextOwner;
    private final SqlCourse course;
    private final boolean enabled;
    private final JsonMapper json=JsonMapper.builder().build();
    private final ExecutorService environmentWorker=Executors.newSingleThreadExecutor();
    public SqlLearningController(JdbcTemplate jdbc,MysqlEnvironment mysql,SqlCourse course,
        @org.springframework.beans.factory.annotation.Value("${cs.sql.enabled:true}") boolean enabled, LearningDataSource storage,
        @org.springframework.beans.factory.annotation.Value("${cs.public:false}") boolean publicMode,
        @org.springframework.beans.factory.annotation.Value("${cs.data-directory}") String dataDirectory) {
        this.jdbc=jdbc;this.environment=mysql;this.course=course;this.enabled=enabled;this.storage=storage;
        this.publicMode=publicMode;this.dataDirectory=java.nio.file.Path.of(dataDirectory).toAbsolutePath().normalize().toString();
    }
    private MysqlEnvironment mysql() {
        if (!publicMode) return environment;
        return instances.computeIfAbsent(LearningDataSource.owner(), id -> environment.learnerInstance(instanceKey(id)));
    }
    private String instanceKey(String id) {
        return MysqlEnvironment.digest(environment.publicIdentityRoot(dataDirectory)+"\n"+id).substring(0,24);
    }
    public String publicContainer(String id) { return environment.learnerInstance(instanceKey(id)).status().container(); }
    public int publicPoolLimit() { return environment.publicPoolLimit(); }
    public MysqlEnvironment.PoolSettings publicPoolSettings() { return environment.publicPoolSettings(); }
    public long publicPoolIdleMinutes() { return environment.publicPoolIdleMinutes(); }
    @PostConstruct void recover(){
        var owners = new LinkedHashSet<>(publicMode ? storage.owners(false) : List.<String>of());
        owners.add("admin");
        for (String owner : owners) try (var scope = LearningDataSource.asOwner(owner)) {
            jdbc.update("UPDATE sql_attempts SET status='environment_error',report=?,finished_at=? WHERE status IN ('running','cancelling')",json.writeValueAsString(Map.of("message","平台曾中断检查，请重试；未计为SQL错误。")),Instant.now().toString());
        }
    }
    @PreDestroy void close(){environmentWorker.shutdownNow();}
    @GetMapping("/environment") public MysqlEnvironment.Environment environment(){return mysql().status();}
    @PostMapping("/environment/activity")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void activity() { if (publicMode) mysql().touch(); }

    @PostMapping("/environment/start") public synchronized MysqlEnvironment.Environment start(){
        var mysql=mysql();
        if(!Set.of("starting","ready").contains(mysql.status().status()))environmentWorker.submit(() -> { try (var activity = mysql.activity()) { mysql.start(); } });
        else if(mysql.status().status().equals("ready"))environmentWorker.submit(() -> { try (var activity = mysql.activity()) { mysql.start(); } });
        return mysql.status();
    }
    public record ResetPreview(String target,String token,String expiresAt,String consequence) {}
    @PostMapping("/environment/reset-preview") public ResetPreview resetPreview(){
        String token=UUID.randomUUID().toString(),expiry=Instant.now().plusSeconds(120).toString();
        jdbc.update("DELETE FROM sql_reset_tokens WHERE expires_at<?",Instant.now().toString());
        jdbc.update("INSERT INTO sql_reset_tokens(token,target,expires_at) VALUES(?,?,?)",token,MysqlEnvironment.PRACTICE,expiry);
        return new ResetPreview(MysqlEnvironment.PRACTICE,token,expiry,"将清空cs_practice中的tasks与bookmarks并恢复6条初始任务；正式报告、完成证据和HTTP练习不变。");
    }
    public record ResetWrite(String target,String token) {}
    @PostMapping("/environment/reset") public synchronized Map<String,String> reset(@RequestBody ResetWrite write){
        if(!MysqlEnvironment.PRACTICE.equals(write.target()))throw conflict("RESET_TARGET_REJECTED","只允许重置cs_practice练习库。");
        if(write.token()==null||jdbc.queryForObject("SELECT count(*) FROM sql_reset_tokens WHERE token=? AND target=? AND expires_at>?",Integer.class,write.token(),write.target(),Instant.now().toString())!=1)throw conflict("RESET_EXPIRED","重置预览已失效，请重新查看目标后确认。");
        var environment=mysql();
        try(var activity=environment.activity()){
            if (publicMode && "hibernated".equals(environment.status().status())) environment.start();
            environment.reset(write.target());
        }catch(MysqlEnvironment.Failure e){throw conflict(e.status,e.getMessage());}
        jdbc.update("DELETE FROM sql_reset_tokens WHERE token=?",write.token());
        return Map.of("message","cs_practice已恢复6条初始任务。","target",write.target());
    }
    public record AttemptWrite(String courseVersion,String stageId,String mode,String sql,String idempotencyKey) {}
    public record Report(String courseId,String courseVersion,String stageId,String snapshotDigest,String policy,String ruleVersion,String image,String seedDigest,List<MysqlEnvironment.Assertion> assertions,MysqlEnvironment.Table result,String message,String finishedAt) {}
    public record Attempt(String id,String courseVersion,String stageId,String mode,String sql,String digest,String status,Object report,String createdAt,List<Map<String,Object>> understanding) {}
    @PostMapping("/attempts") @Transactional public Attempt submit(@RequestBody AttemptWrite write){
        requireVersion(write.courseVersion());course.require(write.stageId());SqlPolicy.validate(write.stageId(),write.sql());
        if(!Set.of("practice","check").contains(Objects.toString(write.mode(),"")))throw ApiException.invalid("mode","请选择试运行或正式检查。");
        key(write.idempotencyKey());
        var old=jdbc.queryForList("SELECT * FROM sql_attempts WHERE idempotency_key=?",write.idempotencyKey());
        if(!old.isEmpty()) {
            var row=old.getFirst();
            boolean sameSql = row.get("snapshot_pruned_at") == null
                ? write.sql().equals(row.get("source")) : MysqlEnvironment.digest(write.sql()).equals(row.get("digest"));
            if(!sameSql||!write.stageId().equals(row.get("stage_id"))||!write.mode().equals(row.get("mode"))||!write.courseVersion().equals(row.get("course_version")))throw conflict("IDEMPOTENCY_CONFLICT","此请求编号已用于其他SQL。");
            return attempt(row);
        }
        if(jdbc.queryForObject("SELECT count(*) FROM sql_attempts WHERE status IN ('queued','running','cancelling')",Integer.class) >= (publicMode ? 2 : 20))throw conflict("QUEUE_FULL","SQL检查队列已满，请等待已有任务结束。");
        if (publicMode) mysql().touch();
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO sql_attempts(id,course_version,stage_id,mode,source,digest,idempotency_key,status,created_at) VALUES(?,?,?,?,?,?,?,'queued',?)",id,write.courseVersion(),write.stageId(),write.mode(),write.sql(),MysqlEnvironment.digest(write.sql()),write.idempotencyKey(),Instant.now().toString());
        return read(id);
    }
    @GetMapping("/attempts/{id}") public Attempt read(@PathVariable String id){var rows=jdbc.queryForList("SELECT * FROM sql_attempts WHERE id=?",id);if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"ATTEMPT_NOT_FOUND","找不到此SQL快照。",Map.of());return attempt(rows.getFirst());}
    @GetMapping("/attempts") public List<Attempt> history(@RequestParam String stageId){course.require(stageId);return jdbc.queryForList("SELECT * FROM sql_attempts WHERE course_version=? AND stage_id=? ORDER BY created_at DESC LIMIT 20",SqlCourse.VERSION,stageId).stream().map(this::attempt).toList();}
    @PostMapping("/attempts/{id}/cancel") public Attempt cancel(@PathVariable String id){read(id);jdbc.update("UPDATE sql_attempts SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END WHERE id=? AND status IN ('queued','running')",id);return read(id);}
    private Attempt attempt(Map<String,Object> r){return new Attempt((String)r.get("id"),(String)r.get("course_version"),(String)r.get("stage_id"),(String)r.get("mode"),(String)r.get("source"),(String)r.get("digest"),(String)r.get("status"),r.get("report")==null?null:json.readValue((String)r.get("report"),Object.class),(String)r.get("created_at"),jdbc.queryForList("SELECT id,rule_version,passed,created_at FROM sql_understanding WHERE attempt_id=? ORDER BY created_at DESC",r.get("id")));}
    @Scheduled(fixedDelay=200) public void tick(){
        if(!enabled)return;
        if (!publicMode) { tickCurrent(); return; }
        var owners = storage.queuedOwners("sql");
        for (int offset=0; offset<owners.size(); offset++) {
            int index = Math.floorMod(nextOwner+offset, owners.size());
            try (var scope = LearningDataSource.asOwner(owners.get(index))) {
                if (tickCurrent()) { nextOwner=index+1; return; }
            }
        }
    }
    private boolean tickCurrent() {
        var ids=jdbc.queryForList("SELECT id FROM sql_attempts WHERE status='queued' ORDER BY created_at LIMIT 1",String.class);
        if(ids.isEmpty())return false;String id=ids.getFirst();
        if(jdbc.update("UPDATE sql_attempts SET status='running' WHERE id=? AND status='queued'",id)!=1)return false;
        var attempt=read(id);String status;Report report;
        try {
            var mysql = mysql();
            try (var activity = mysql.activity()) {
                if (publicMode && !"ready".equals(mysql.status().status())) mysql.start();
                java.util.function.BooleanSupplier cancelled=()->Thread.currentThread().isInterrupted()||!"running".equals(jdbc.queryForObject("SELECT status FROM sql_attempts WHERE id=?",String.class,id));
                MysqlEnvironment.Outcome outcome;
                if(attempt.mode().equals("practice"))outcome=new MysqlEnvironment.Outcome("executed",List.of(),mysql.practice(attempt.sql(),cancelled),"试运行完成；未写入关卡完成证据。",MysqlEnvironment.digest(course.seed(false)+course.seed(true)));
                else outcome=mysql.check(id,attempt.stageId(),attempt.sql(),cancelled);
                status=outcome.status();report=new Report(SqlCourse.ID,attempt.courseVersion(),attempt.stageId(),attempt.digest(),"sql-"+attempt.stageId()+"-1",SqlCourse.RULE,MysqlEnvironment.IMAGE,outcome.seedDigest(),outcome.assertions(),outcome.result(),outcome.message(),Instant.now().toString());
            }
        }catch(MysqlEnvironment.Failure e){status=e.status;report=failed(attempt,e.getMessage());}
        catch(Exception e){status="environment_error";report=failed(attempt,"检查服务中断，请重试；不计为SQL错误。");}
        if(jdbc.update("UPDATE sql_attempts SET status=?,report=?,finished_at=? WHERE id=? AND status='running'",status,json.writeValueAsString(report),report.finishedAt(),id)==0)
            jdbc.update("UPDATE sql_attempts SET status='cancelled',report=?,finished_at=? WHERE id=? AND status='cancelling'",json.writeValueAsString(failed(attempt,"检查已取消，未生成完成证据。")),Instant.now().toString(),id);
        return true;
    }
    private Report failed(Attempt a,String message){return new Report(SqlCourse.ID,a.courseVersion(),a.stageId(),a.digest(),"sql-"+a.stageId()+"-1",SqlCourse.RULE,MysqlEnvironment.IMAGE,MysqlEnvironment.digest(course.seed(false)+course.seed(true)),List.of(),null,message,Instant.now().toString());}
    @GetMapping("/rules/{stage}") public Map<String,Object> rule(@PathVariable String stage){return Map.of("courseId",SqlCourse.ID,"courseVersion",SqlCourse.VERSION,"stageId",stage,"ruleVersion",SqlCourse.RULE,"questions",course.questions(stage));}
    public record UnderstandingWrite(String attemptId,String courseVersion,String stageId,String ruleVersion,String currentSql,Map<String,Integer> answers,String idempotencyKey) {}
    @PostMapping("/understanding") @Transactional public Map<String,Object> understand(@RequestBody UnderstandingWrite write){
        var a=read(write.attemptId());key(write.idempotencyKey());requireVersion(write.courseVersion());
        if(!a.courseVersion().equals(write.courseVersion())||!a.stageId().equals(write.stageId())||!SqlCourse.RULE.equals(write.ruleVersion()))throw conflict("RULE_MISMATCH","答案与课程关卡或规则版本不一致。");
        var questions=course.questions(a.stageId());var solution=course.solution(a.stageId());
        if(write.answers()==null||!solution.keySet().equals(write.answers().keySet()))throw ApiException.invalid("answers","请回答本关全部正式题目。");
        for(var q:questions)if(write.answers().get(q.id())==null||write.answers().get(q.id())<0||write.answers().get(q.id())>=q.options().size())throw ApiException.invalid("answers","答案选项超出范围。");
        String answers=json.writeValueAsString(new TreeMap<>(write.answers()));
        var repeated=jdbc.queryForList("SELECT * FROM sql_understanding WHERE idempotency_key=?",write.idempotencyKey());
        if(!repeated.isEmpty()) {
            var r=repeated.getFirst();if(!a.id().equals(r.get("attempt_id"))||!answers.equals(r.get("answers")))throw conflict("IDEMPOTENCY_CONFLICT","此请求编号已用于另一份答案。");
            return Map.of("id",r.get("id"),"passed",((Number)r.get("passed")).intValue()==1,"message","已恢复原验证结果。");
        }
        validateCode(a,write.currentSql());
        String id=UUID.randomUUID().toString(),now=Instant.now().toString();boolean passed=solution.equals(write.answers());
        jdbc.update("INSERT INTO sql_understanding VALUES(?,?,?,?,?,?,?)",id,a.id(),SqlCourse.RULE,answers,passed?1:0,write.idempotencyKey(),now);
        if(passed)jdbc.update("INSERT OR IGNORE INTO sql_completions VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),a.courseVersion(),a.stageId(),a.id(),id,a.digest(),SqlCourse.RULE,now);
        if(passed)jdbc.update("UPDATE sql_completions SET understanding_id=? WHERE course_version=? AND stage_id=? AND digest=? AND understanding_id IS NULL",id,a.courseVersion(),a.stageId(),a.digest());
        return Map.of("id",id,"passed",passed,"message",passed?"功能与理解均通过，完成证据已保存。":"请回看本章概念，对照新的输入重新预测后重答。");
    }
    public record CodeWrite(String attemptId,String currentSql) {}
    @PostMapping("/complete-code") @Transactional public Map<String,Object> completeCode(@RequestBody CodeWrite write){
        var a=read(write.attemptId());validateCode(a,write.currentSql());
        jdbc.update("INSERT OR IGNORE INTO sql_completions VALUES(?,?,?,?,NULL,?,?,?)",UUID.randomUUID().toString(),a.courseVersion(),a.stageId(),a.id(),a.digest(),"code-1",Instant.now().toString());
        return Map.of("passed",true,"message","SQL编程任务已完成，可以继续下一章。");
    }
    private void validateCode(Attempt a,String currentSql){
        if(!"check".equals(a.mode())||!"passed".equals(a.status())||currentSql==null||!a.digest().equals(MysqlEnvironment.digest(currentSql)))throw conflict("FUNCTIONAL_REQUIRED","请先让当前SQL通过正式检查；修改后需重新检查。");
        if(a.report()==null)throw conflict("JOB_SNAPSHOT_PRUNED","该次检查的快照已清理，请重新检查当前 SQL。");
        var report=json.convertValue(a.report(),Report.class);
        if(!a.digest().equals(report.snapshotDigest())||!SqlCourse.RULE.equals(report.ruleVersion())||!report.policy().equals("sql-"+a.stageId()+"-1")||report.assertions().isEmpty()||report.assertions().stream().anyMatch(x->!x.passed()))throw conflict("REPORT_MISMATCH","功能证据与本关不一致，请重新检查。");
        int index=SqlCourse.STAGES.indexOf(a.stageId());
        for(String prior:SqlCourse.STAGES.subList(0,index))if(jdbc.queryForObject("SELECT count(*) FROM sql_completions WHERE course_version=? AND stage_id=?",Integer.class,a.courseVersion(),prior)==0)throw conflict("PREREQUISITE_REQUIRED","可预览本章；正式完成前请先完成前面的SQL关卡。");
    }
    private void requireVersion(String version){if(!SqlCourse.VERSION.equals(version))throw new ApiException(HttpStatus.NOT_FOUND,"COURSE_NOT_FOUND","此SQL课程版本未发布。",Map.of());}
    private void key(String key){if(key==null||!key.matches("[a-zA-Z0-9_-]{1,100}"))throw ApiException.invalid("idempotencyKey","请提供有效请求编号。");}
    private ApiException conflict(String code,String message){return new ApiException(HttpStatus.CONFLICT,code,message,Map.of());}
}

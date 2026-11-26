package dev.codesomething.workspaces;

import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.annotation.PostConstruct;
import tools.jackson.databind.json.JsonMapper;

@Component
@EnableScheduling
@DependsOn("flyway")
public class CheckJobWorker {
    private final JdbcTemplate jdbc;
    private final DockerCheckRunner runner;
    private final RemoteJavaJobs remoteJava;
    private final boolean enabled;
    private final LocalProjectRunner local;
    private final boolean localEnabled;
    private final dev.codesomething.boot.BootCheckRunner boot;
    private final dev.codesomething.boot.BootProjectRunner bootRecovery;
    private final dev.codesomething.boot.CollaborationRunner publicCollaboration;
    private final LearningDataSource storage;
    private final boolean publicMode;
    private final boolean dockerOnly;
    private String previousOwner = "";
    private final JsonMapper json=JsonMapper.builder().build();
    public CheckJobWorker(JdbcTemplate jdbc,DockerCheckRunner runner,@Value("${cs.runner.enabled:true}") boolean enabled,
                          @Value("${cs.runner.docker}") String docker,@Value("${cs.data-directory}") String data,
                          LocalProjectRunner local,@Value("${cs.runner.local-enabled:true}") boolean localEnabled,
                          LearningDataSource storage,RemoteJavaJobs remoteJava,
                          @Value("${cs.public}") boolean publicMode,@Value("${cs.runner.mode}") String mode) {
        this.jdbc=jdbc;this.runner=runner;this.remoteJava=remoteJava;this.enabled=enabled;this.local=local;
        this.storage=storage;this.publicMode=publicMode;this.dockerOnly="docker_only".equals(mode);
        this.localEnabled=localEnabled && !dockerOnly;
        var root=java.nio.file.Path.of(data).resolve("boot-runner");
        this.boot=new dev.codesomething.boot.BootCheckRunner(docker,root,180);
        this.bootRecovery=new dev.codesomething.boot.BootProjectRunner(docker,root,180,dockerOnly);
        this.publicCollaboration=new dev.codesomething.boot.CollaborationRunner(docker,root,180,true);
    }
    @PostConstruct void recover() {
        if (publicMode) {
            var owners = new LinkedHashSet<>(storage.owners(false));
            owners.add("admin");
            for (String id : owners) try (var scope = LearningDataSource.asOwner(id)) { recoverCurrent(); }
        } else recoverCurrent();
    }
    private void recoverCurrent() {
        if (!remoteJava.enabled()) jdbc.update("""
            UPDATE check_jobs SET status='queued',remote_lease=NULL,remote_until=NULL
            WHERE remote_java=1 AND status='running' AND remote_lease IS NOT NULL
            """);
        for(String id:jdbc.queryForList("SELECT id FROM check_jobs WHERE status IN ('running','cancelling') AND (remote_java=0 OR ?=0)",
            String.class,remoteJava.enabled()?1:0)) {
            try {runner.cleanup(id);bootRecovery.recover(id);}catch(Exception ignored){}
            var row=jdbc.queryForMap("SELECT s.* FROM submissions s JOIN check_jobs j ON s.id=j.submission_id WHERE j.id=?",id);
            String image=DockerCheckRunner.IMAGE;
            if(dev.codesomething.boot.BootCourses.supports((String)row.get("course_id"))) {
                image="";
                try(var input=getClass().getResourceAsStream(dev.codesomething.boot.BootCourses.jdbc((String)row.get("stage_id"))?"/runner/boot/jdbc-image-lock.json":"/runner/boot/image-lock.json")) {if(input!=null)image=json.readTree(input).path("image").asText();}catch(Exception ignored){}
            }
            var report=new CheckReport((String)row.get("digest"),(String)row.get("course_version"),(String)row.get("stage_id"),"interrupted",image,"",false,List.of(),"平台曾中断检查，请重新检查。这不计为代码错误。",Instant.now().toString());
            jdbc.update("UPDATE check_jobs SET status='environment_error',report=?,finished_at=? WHERE id=?",json.writeValueAsString(report),report.finishedAt(),id);
        }
    }
    @Scheduled(fixedDelay=200)
    public void tick() {
        if(!enabled)return;
        if (!publicMode) { tickCurrent(); return; }
        var owners = new ArrayList<>(storage.queuedOwners("check"));
        if (owners.isEmpty()) return;
        int start = Collections.binarySearch(owners, previousOwner);
        Collections.rotate(owners, -(start >= 0 ? start + 1 : -start - 1));
        for (String owner : owners) {
            try (var scope = LearningDataSource.asOwner(owner)) {
                if (tickCurrent()) { previousOwner = owner; return; }
            }
        }
    }
    private boolean tickCurrent() {
        var ids=jdbc.queryForList("SELECT id FROM check_jobs WHERE status='queued' AND (remote_java=0 OR ?=0) ORDER BY created_at LIMIT 1",
            String.class,remoteJava.enabled()?1:0);
        if(ids.isEmpty())return false;String id=ids.getFirst();
        if(jdbc.update("UPDATE check_jobs SET status='running' WHERE id=? AND status='queued'",id)!=1)return false;
        var row=jdbc.queryForMap("SELECT s.* FROM submissions s JOIN check_jobs j ON s.id=j.submission_id WHERE j.id=?",id);
        String stage=(String)row.get("stage_id"), version=(String)row.get("course_version");
        String course=(String)row.get("course_id");
        boolean isBoot=dev.codesomething.boot.BootCourses.supports(course);
        String policy=isBoot?dev.codesomething.boot.BootCourses.policy(stage):ConsoleOutputCheck.applies(course,version,stage)?ConsoleOutputCheck.POLICY:HttpCourseChecks.textPractice(course,version,stage)?HttpCourseChecks.TEXT_POLICY:stage.equals("run-server")?"server-smoke-v1":stage.equals("transfer")?"notes-json-v1":"task-json-v1";
        java.util.function.BooleanSupplier cancelled=()->!"running".equals(jdbc.queryForObject("SELECT status FROM check_jobs WHERE id=?",String.class,id))||Thread.currentThread().isInterrupted();
        dev.codesomething.boot.BootCheckRunner.Outcome outcome;
        CheckProgress.begin(id);
        try {
        java.util.function.Supplier<LocalProjectRunner.Outcome> isolated=()->{
            if(isBoot){var snapshot=dev.codesomething.boot.BootProjectSnapshot.restore(new String((byte[])row.get("source"),java.nio.charset.StandardCharsets.UTF_8));var result=dockerOnly?(dev.codesomething.boot.BootCourses.COLLAB.contains(stage)?publicCollaboration.run(id,snapshot,version,stage,cancelled):bootRecovery.run(id,snapshot,version,stage,cancelled)):boot.run(id,snapshot,version,stage,cancelled);return new LocalProjectRunner.Outcome(result.status(),result.report());}
            try(var slot=dockerOnly?dev.codesomething.boot.PublicJdbcSandbox.acquire(cancelled):null) {
                if(dockerOnly&&slot==null) return new LocalProjectRunner.Outcome("cancelled",new CheckReport(
                    (String)row.get("digest"),version,stage,policy,"","",false,List.of(),"检查已取消。",Instant.now().toString()));
                var result=runner.run(id,(byte[])row.get("source"),(String)row.get("digest"),version,stage,policy,cancelled);
                return new LocalProjectRunner.Outcome(result.status(),result.report());
            }
        };
        LocalProjectRunner.Outcome result;
        if(localEnabled&&(!isBoot||!dev.codesomething.boot.BootCourses.jdbc(stage)))result=LocalFirstCheck.run(()->isBoot?
            local.runBoot((String)row.get("binding_id"),dev.codesomething.boot.BootProjectSnapshot.restore(new String((byte[])row.get("source"),java.nio.charset.StandardCharsets.UTF_8)),version,stage,cancelled):
            local.runHttp((String)row.get("binding_id"),(byte[])row.get("source"),version,stage,policy,cancelled),isolated);
        else result=isolated.get();
        outcome=new dev.codesomething.boot.BootCheckRunner.Outcome(result.status(),result.report());
        } catch(Exception e) {
            var failure=new CheckReport((String)row.get("digest"),version,stage,policy,"","",false,List.of(),"检查快照无法恢复，请重新读取工程并提交："+e.getMessage(),Instant.now().toString());
            outcome=new dev.codesomething.boot.BootCheckRunner.Outcome("environment_error",failure);
        } finally {CheckProgress.end();}
        String status=outcome.status();CheckReport report=outcome.report();
        if(jdbc.update("UPDATE check_jobs SET status=?,report=?,finished_at=? WHERE id=? AND status='running'",status,json.writeValueAsString(report),report.finishedAt(),id)==0) {
            status="environment_error".equals(status)?status:"cancelled";
            report=new CheckReport(report.snapshotDigest(),version,stage,policy,report.image(),report.harnessDigest(),false,report.assertions(),"cancelled".equals(status)?"检查已取消。":report.log(),Instant.now().toString());
            jdbc.update("UPDATE check_jobs SET status=?,report=?,finished_at=? WHERE id=? AND status='cancelling'",status,json.writeValueAsString(report),report.finishedAt(),id);
        }
        return true;
    }
}

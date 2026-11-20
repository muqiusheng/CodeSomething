package dev.codesomething.projects;

import dev.codesomething.api.ApiException;
import dev.codesomething.profile.LearnerController;
import dev.codesomething.tutor.ProjectPlanner;
import jakarta.annotation.PreDestroy;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
@DependsOn("flyway")
public class ProjectService {
    private final JdbcTemplate jdbc;private final LearnerController learner;private final ProjectPlanner planner;private final GeneratedRunner runner;private final Path research,repository;
    private final JsonMapper json=JsonMapper.builder().build();private final ExecutorService worker=Executors.newSingleThreadExecutor();private volatile boolean closing;
    public ProjectService(JdbcTemplate jdbc,LearnerController learner,ProjectPlanner planner,GeneratedRunner runner,@Value("${cs.course-directory:course-packs}")String courses){
        this.jdbc=jdbc;this.learner=learner;this.planner=planner;this.runner=runner;this.research=Path.of(courses).toAbsolutePath().normalize().resolveSibling("research");this.repository=research.getParent().getParent();
        jdbc.update("UPDATE project_drafts SET status='interrupted',error='服务重启，已保留草稿与生成片段，请重试。' WHERE status IN ('generating','validating')");
        jdbc.update("UPDATE generated_attempts SET status='interrupted' WHERE status IN ('queued','running')");
        worker.submit(()->{try{runner.recover();}catch(Exception ignored){/* A later check reports Docker availability; reading courses stays available. */}});
    }
    private ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,"PROJECT_CONFLICT",message,Map.of());}
    private void key(String key){if(key==null||!key.matches("[A-Za-z0-9_-]{1,100}"))throw ApiException.invalid("idempotencyKey","请提供有效操作编号。");}
    private void idle(){if(jdbc.queryForObject("SELECT (SELECT count(*) FROM project_drafts WHERE status IN ('generating','validating'))+(SELECT count(*) FROM generated_attempts WHERE status IN ('queued','running'))",Integer.class)>0)throw conflict("已有项目作业运行中，请等待或停止后重试。");}
    public List<Map<String,Object>> sources()throws Exception {
        var catalog=json.readTree(Files.readString(research.resolve("catalog.json")));var result=new ArrayList<Map<String,Object>>();
        for(var s:catalog.path("sources")){
            if(!s.path("revision").asText().matches("[a-f0-9]{40}")||!s.path("license").path("spdx").asText().equals("Apache-2.0"))throw new IllegalStateException("研究来源的固定提交或许可未通过。");
            for(var e:s.path("evidence")){Path file=repository.resolve(e.path("file").asText()).normalize();if(!file.startsWith(research)||!Files.isRegularFile(file)||!dev.codesomething.workspaces.WorkspaceController.hash(Files.readAllBytes(file)).equals(e.path("sha256").asText()))throw new IllegalStateException("研究证据摘要不一致，请先运行research-check。");}
            result.add(Map.of("id",s.path("id").asText(),"title",s.path("title").asText(),"url",s.path("url").asText(),"revision",s.path("revision").asText(),"license","Apache-2.0","retrievedAt",s.path("retrievedAt").asText(),"usage","仅参考业务与分层思路，代码由本地模板独立生成；上游构建未执行。"));
        }
        if(result.size()!=3)throw new IllegalStateException("来源清单不完整。");return List.copyOf(result);
    }
    public synchronized Map<String,Object> create(String interest,String kind,String key)throws Exception {
        interest=ProjectController.text(interest,"interest",80);key(key);if(!Set.of("adapt","generate").contains(Objects.toString(kind,"")))throw ApiException.invalid("kind","请选择改编或新生成。");
        var old=jdbc.queryForList("SELECT id,interest,kind FROM project_drafts WHERE idempotency_key=?",key);if(!old.isEmpty()){var row=old.getFirst();if(!interest.equals(row.get("interest"))||!kind.equals(row.get("kind")))throw conflict("操作编号已用于其他项目。");return draft(row.get("id").toString());}
        idle();var evidence=sources();var profile=learner.profile();String id=UUID.randomUUID().toString(),snapshot=profile.get("snapshotId").toString();
        jdbc.update("INSERT INTO project_drafts(id,interest,kind,profile_id,idempotency_key,status,created_at) VALUES(?,?,?,?,?,?,?)",id,interest,kind,snapshot,key,kind.equals("generate")?"generating":"draft",Instant.now().toString());
        if(kind.equals("adapt")){
            var plan=new GeneratedPackage.Plan(interest+"接口练习","records","第一条"+interest,"本项目把“"+interest+"”收敛为个人记录接口。先按编号读取一条记录，区分空列表和找不到单条，再新增带标题和完成状态的记录，验证输入类型与内容。最后把同样的数据结构迁移到独立归档资源，保持原记录不变。所有数据保存在内存集合，重启清空；本项目练习HTTP契约与输入校验，不包含数据库、登录和部署。公开样例仅用于分层思路参考，代码由固定模板独立生成。");
            savePack(id,GeneratedPackage.compile(id,plan,snapshot,evidence));
        }else submitPlan(id,evidence,profile);
        return draft(id);
    }
    private void savePack(String id,GeneratedPackage.Pack pack){GeneratedPackage.validate(pack);jdbc.update("UPDATE project_drafts SET payload=?,status='draft',error=NULL WHERE id=? AND status IN ('draft','generating')",json.writeValueAsString(pack),id);}
    private void submitPlan(String id,List<Map<String,Object>> sources,Map<String,Object> profile){
        var row=draft(id);String interest=row.get("interest").toString(),snapshot=row.get("profile_id").toString();
        String prompt="兴趣题材："+json.writeValueAsString(interest)+"\n画像快照："+snapshot+"；已验证课程数："+((Map<?,?>)profile.get("summary")).get("completed")+"。所有独立编码能力尚待验证。\n参考来源："+json.writeValueAsString(sources)+"\n生成内存REST三关，不增加前置技能范围。";
        worker.submit(()->{try{String output=planner.plan(prompt,partial->jdbc.update("UPDATE project_drafts SET partial=? WHERE id=? AND status='generating'",partial,id),()->stopped(id,"generating"));if(!stopped(id,"generating"))savePack(id,GeneratedPackage.compile(id,GeneratedPackage.parse(output),snapshot,sources));}catch(Exception e){jdbc.update("UPDATE project_drafts SET status='failed',error=? WHERE id=? AND status='generating'",error(e),id);}});
    }
    private boolean stopped(String id,String expected){return closing||!expected.equals(jdbc.queryForObject("SELECT status FROM project_drafts WHERE id=?",String.class,id));}
    private String error(Exception e){return Objects.toString(e.getMessage(),"项目作业失败，请重试。").substring(0,Math.min(Objects.toString(e.getMessage(),"项目作业失败，请重试。").length(),1000));}
    public List<Map<String,Object>> drafts(){return jdbc.queryForList("SELECT id,interest,kind,status,error,created_at FROM project_drafts ORDER BY created_at DESC,id");}
    public Map<String,Object> draft(String id){var rows=jdbc.queryForList("SELECT * FROM project_drafts WHERE id=?",id);if(rows.isEmpty())throw ProjectController.missing();var row=new LinkedHashMap<>(rows.getFirst());for(String field:List.of("payload","report"))if(row.get(field)!=null)row.put(field,json.readTree(row.get(field).toString()));return row;}
    private GeneratedPackage.Pack pack(String id){var row=draft(id);if(row.get("payload")==null)throw conflict("尚未生成可验证的课程方案。");return json.convertValue(row.get("payload"),GeneratedPackage.Pack.class);}
    public synchronized Map<String,Object> retry(String id)throws Exception {
        var row=draft(id);if(!Set.of("failed","interrupted","cancelled").contains(row.get("status")))throw conflict("仅失败、中断或停止的草稿可以重试。");idle();sources();
        if(row.get("payload")!=null){jdbc.update("UPDATE project_drafts SET status='draft',error=NULL WHERE id=?",id);return draft(id);}
        jdbc.update("UPDATE project_drafts SET status='generating',error=NULL,partial='' WHERE id=?",id);submitPlan(id,sources(),learner.profile());return draft(id);
    }
    public synchronized Map<String,Object> stop(String id){draft(id);jdbc.update("UPDATE project_drafts SET status='cancelled',error='已停止，保留已有草稿。' WHERE id=? AND status IN ('generating','validating')",id);return draft(id);}
    public synchronized Map<String,Object> validate(String id)throws Exception {
        var row=draft(id);if(!Set.of("draft","rejected","ready").contains(row.get("status")))throw conflict("请先完成或恢复草稿。");idle();var pack=pack(id);sources();
        jdbc.update("UPDATE project_drafts SET status='validating',report=NULL,error=NULL WHERE id=?",id);
        worker.submit(()->gate(id,pack));return draft(id);
    }
    private void gate(String id,GeneratedPackage.Pack pack){
        var results=new ArrayList<Map<String,Object>>();boolean passed=true;
        try{
            GeneratedPackage.validate(pack);results.add(Map.of("name","结构、先修与教学抽查","passed",true));
            for(var chapter:pack.chapters()){
                if(stopped(id,"validating"))return;
                var normal=runner.run(pack,chapter.id(),chapter.reference(),()->stopped(id,"validating"));
                results.add(Map.of("name",chapter.title()+"参考实现","passed",normal.status().equals("passed"),"result",normal));passed&=normal.status().equals("passed");
                if(!normal.status().equals("passed"))break;
                var mutant=new TreeMap<>(chapter.reference());String source=mutant.get(GeneratedPackage.SOURCE+"ResourceController.java");
                source=switch(chapter.id()){case "read"->source.replace(GeneratedPackage.literal(pack.plan().itemTitle()),GeneratedPackage.literal(pack.plan().itemTitle()+"错误变式"));case "validate"->source.replace("((String)title).strip().isEmpty()","false");default->source.replace("/api/"+pack.plan().resource()+"archive","/api/wrongarchive");};
                mutant.put(GeneratedPackage.SOURCE+"ResourceController.java",source);
                var broken=runner.run(pack,chapter.id(),mutant,()->stopped(id,"validating"));boolean effective=broken.status().equals("business_error")&&broken.report().assertions().stream().anyMatch(a->!a.passed()&&!a.name().equals("offline-build"));
                results.add(Map.of("name",chapter.title()+"错误变式检出","passed",effective,"result",broken));passed&=effective;
                jdbc.update("UPDATE project_drafts SET report=? WHERE id=? AND status='validating'",json.writeValueAsString(Map.of("passed",false,"digest",GeneratedPackage.digest(pack),"checks",results)),id);
                if(!effective)break;
            }
        }catch(Exception e){passed=false;results.add(Map.of("name","结构或来源校验","passed",false,"message",error(e)));}
        jdbc.update("UPDATE project_drafts SET status=?,report=?,error=? WHERE id=? AND status='validating'",passed?"ready":"rejected",json.writeValueAsString(Map.of("passed",passed,"digest",GeneratedPackage.digest(pack),"rule",GeneratedPackage.RULE,"validatorDigest",runner.fingerprint(),"checks",results,"finishedAt",Instant.now().toString())),passed?null:"门禁未通过，已保留失败草稿及报告。",id);
    }
    public synchronized Map<String,Object> publish(String id)throws Exception {
        var existing=jdbc.queryForList("SELECT id FROM generated_courses WHERE id=?",id);if(!existing.isEmpty())return course(id);
        var row=draft(id);var pack=pack(id);GeneratedPackage.validate(pack);sources();var report=json.valueToTree(row.get("report"));
        if(!"ready".equals(row.get("status"))||!report.path("passed").asBoolean()||!GeneratedPackage.digest(pack).equals(report.path("digest").asText())||!runner.fingerprint().equals(report.path("validatorDigest").asText())||report.path("checks").size()!=7)throw conflict("请通过当前版本的全部门禁后再发布。未发布内容不能开始正式学习。");
        jdbc.update("INSERT INTO generated_courses VALUES(?,?,?,?,?)",id,GeneratedPackage.digest(pack),json.writeValueAsString(pack),json.writeValueAsString(report),Instant.now().toString());jdbc.update("UPDATE project_drafts SET status='published' WHERE id=?",id);return course(id);
    }
    public GeneratedPackage.Pack published(String id){var rows=jdbc.queryForList("SELECT * FROM generated_courses WHERE id=?",id);if(rows.isEmpty())throw ProjectController.missing();var row=rows.getFirst();var p=json.readValue(row.get("payload").toString(),GeneratedPackage.Pack.class);if(!GeneratedPackage.digest(p).equals(row.get("digest")))throw conflict("已发布课程摘要不一致。");return p;}
    public Map<String,Object> course(String id){var p=published(id);var chapters=p.chapters().stream().map(c->Map.of("id",c.id(),"title",c.title(),"minutes",c.minutes(),"dependsOn",c.dependsOn(),"teaching",c.teaching(),"requirements",c.requirements(),"options",c.options(),"starter",c.starter())).toList();return Map.of("id",p.id(),"version",p.version(),"title",p.plan().title(),"plan",p.plan(),"chapters",chapters,"sources",p.sources(),"completions",jdbc.queryForList("SELECT stage_id,attempt_id,digest,help,completed_at FROM generated_completions WHERE course_id=? ORDER BY completed_at",id),"attempts",jdbc.queryForList("SELECT id,stage_id,digest,status,created_at FROM generated_attempts WHERE course_id=? ORDER BY created_at DESC,id",id));}
    public List<Map<String,Object>> courses(){var all=new ArrayList<Map<String,Object>>();for(var row:jdbc.queryForList("SELECT id,published_at FROM generated_courses ORDER BY published_at DESC")){var p=published(row.get("id").toString());all.add(Map.of("id",p.id(),"title",p.plan().title(),"publishedAt",row.get("published_at"),"version",p.version()));}return all;}
    public Map<String,String> reference(String id,String stage){var c=GeneratedPackage.chapter(published(id),stage);jdbc.update("INSERT OR IGNORE INTO generated_reference_views VALUES(?,?,?)",id,stage,Instant.now().toString());return c.reference();}
    @PreDestroy void shutdown(){closing=true;worker.shutdown();try{if(!worker.awaitTermination(20,TimeUnit.SECONDS))worker.shutdownNow();}catch(InterruptedException e){worker.shutdownNow();Thread.currentThread().interrupt();}}

    public synchronized Map<String,Object> check(String id,String stage,Map<String,String> files,String key){
        key(key);var p=published(id);var chapter=GeneratedPackage.chapter(p,stage);
        try{dev.codesomething.boot.BootProjectSnapshot.fromFiles(files,false);}catch(IllegalArgumentException e){throw ApiException.invalid("files",e.getMessage());}
        String digest=GeneratedPackage.digest(new TreeMap<>(files));var old=jdbc.queryForList("SELECT id,course_id,stage_id,digest FROM generated_attempts WHERE idempotency_key=?",key);if(!old.isEmpty()){var row=old.getFirst();if(!id.equals(row.get("course_id"))||!stage.equals(row.get("stage_id"))||!digest.equals(row.get("digest")))throw conflict("操作编号已用于其他快照。");return attempt(row.get("id").toString());}
        for(String dependency:chapter.dependsOn())if(jdbc.queryForObject("SELECT count(*) FROM generated_completions WHERE course_id=? AND stage_id=?",Integer.class,id,dependency)==0)throw conflict("先完成上一关的编程任务，再提交本关。");
        idle();String attempt=UUID.randomUUID().toString();jdbc.update("INSERT INTO generated_attempts(id,course_id,stage_id,idempotency_key,digest,files,status,created_at) VALUES(?,?,?,?,?,?,'queued',?)",attempt,id,stage,key,digest,json.writeValueAsString(files),Instant.now().toString());
        worker.submit(()->{if(jdbc.update("UPDATE generated_attempts SET status='running' WHERE id=? AND status='queued'",attempt)==0)return;var result=runner.run(p,stage,files,()->closing||!"running".equals(jdbc.queryForObject("SELECT status FROM generated_attempts WHERE id=?",String.class,attempt)));jdbc.update("UPDATE generated_attempts SET status=?,report=? WHERE id=? AND status='running'",result.status(),json.writeValueAsString(result.report()),attempt);});return attempt(attempt);
    }
    public Map<String,Object> attempt(String id){var rows=jdbc.queryForList("SELECT * FROM generated_attempts WHERE id=?",id);if(rows.isEmpty())throw ProjectController.missing();var row=new LinkedHashMap<>(rows.getFirst());row.remove("files");if(row.get("report")!=null)row.put("report",json.readTree(row.get("report").toString()));return row;}
    public synchronized Map<String,Object> stopAttempt(String id){attempt(id);jdbc.update("UPDATE generated_attempts SET status='cancelled' WHERE id=? AND status IN ('queued','running')",id);return attempt(id);}
    public synchronized Map<String,Object> completeCode(String attempt,String expectedDigest,String help){
        var a=attempt(attempt);var p=published(a.get("course_id").toString());var c=GeneratedPackage.chapter(p,a.get("stage_id").toString());
        if(!"passed".equals(a.get("status"))||!a.get("digest").equals(expectedDigest)||a.get("report")==null)throw conflict("请使用当前源码对应的通过报告。");
        var report=json.treeToValue((tools.jackson.databind.JsonNode)a.get("report"),dev.codesomething.workspaces.CheckReport.class);
        if(!report.functionalPassed()||!expectedDigest.equals(report.snapshotDigest())||!p.version().equals(report.courseVersion())||!c.id().equals(report.stageId())||!GeneratedPackage.RULE.equals(report.policy())||report.assertions()==null||report.assertions().isEmpty()||report.assertions().stream().anyMatch(r->!r.passed()))throw conflict("报告与当前关卡不一致，请重新检查。");
        for(String dependency:c.dependsOn())if(jdbc.queryForObject("SELECT count(*) FROM generated_completions WHERE course_id=? AND stage_id=?",Integer.class,p.id(),dependency)==0)throw conflict("请先完成上一关的编程任务。");
        if(!Set.of("none","concept","example").contains(Objects.toString(help,"")))throw ApiException.invalid("help","请声明本次帮助程度。");
        if(jdbc.queryForObject("SELECT count(*) FROM generated_reference_views WHERE course_id=? AND stage_id=?",Integer.class,p.id(),c.id())>0)help="example";
        jdbc.update("INSERT OR IGNORE INTO generated_completions VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),p.id(),c.id(),attempt,expectedDigest,help,"",Instant.now().toString());
        return Map.of("passed",true,"message","本关编码已完成，选择题与讲解可按需补充。","course",course(p.id()));
    }
    public synchronized Map<String,Object> complete(String attempt,String expectedDigest,Integer answer,String help,String explanation){
        var a=attempt(attempt);var p=published(a.get("course_id").toString());var c=GeneratedPackage.chapter(p,a.get("stage_id").toString());
        if(!"passed".equals(a.get("status"))||!a.get("digest").equals(expectedDigest))throw conflict("请使用当前源码对应的通过报告。");
        if(answer==null||answer<0||answer>=c.options().size())throw ApiException.invalid("answer","请选择理解答案。");
        if(answer!=c.answer())return Map.of("passed",false,"message","先核对写入前校验、400与404的区别，再换场景解释。");
        if(!Set.of("none","concept","example").contains(Objects.toString(help,"")))throw ApiException.invalid("help","请声明本次帮助程度。");explanation=ProjectController.text(explanation,"explanation",1500);if(explanation.length()<40)throw ApiException.invalid("explanation","请用至少40字说明数据流、失败状态和重启后数据变化。");
        if(jdbc.queryForObject("SELECT count(*) FROM generated_reference_views WHERE course_id=? AND stage_id=?",Integer.class,p.id(),c.id())>0)help="example";
        jdbc.update("INSERT OR IGNORE INTO generated_completions VALUES(?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),p.id(),c.id(),attempt,expectedDigest,help,explanation,Instant.now().toString());jdbc.update("UPDATE generated_completions SET explanation=?,help=? WHERE course_id=? AND stage_id=? AND attempt_id=? AND digest=?",explanation,help,p.id(),c.id(),attempt,expectedDigest);return Map.of("passed",true,"message","已记录功能与概念验证；开放讲解质量与独立编码仍待学习回访。","course",course(p.id()));
    }
}

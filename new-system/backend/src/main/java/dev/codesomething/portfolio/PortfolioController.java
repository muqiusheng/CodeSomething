package dev.codesomething.portfolio;

import dev.codesomething.api.ApiException;
import dev.codesomething.boot.*;
import dev.codesomething.profile.LearnerController;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

/** Local single-learner independent work. Automated evidence never certifies open explanation. */
@RestController
@RequestMapping("/api/v1/portfolio")
@DependsOn("flyway")
public class PortfolioController {
 public static final String RULE="r8-reservation-1";
 private final JdbcTemplate jdbc;
 private final LearnerController learner;
 private final JsonMapper json=JsonMapper.builder().build();
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final PortfolioRunner runner;
 private final boolean enabled;
 public PortfolioController(JdbcTemplate jdbc,LearnerController learner,@Value("${cs.runner.enabled:true}") boolean enabled,@Value("${cs.runner.docker:docker}") String docker,@Value("${cs.data-directory}") String data,@Value("${cs.runner.mode}") String mode,dev.codesomething.storage.LearningDataSource storage){
  this.jdbc=jdbc;this.learner=learner;this.enabled=enabled;runner=new PortfolioRunner(docker,Path.of(data).toAbsolutePath().resolve("portfolio-runner"),240,"docker_only".equals(mode));
  var owners=new LinkedHashSet<>(storage.owners(false));owners.add("admin");
  for(String owner:owners)try(var scope=dev.codesomething.storage.LearningDataSource.asOwner(owner)){recover();}
 }
 private void recover(){
  var interrupted=jdbc.queryForList("SELECT * FROM portfolio_checks WHERE status IN ('queued','running','cancelling','cleanup_failed')");
  jdbc.update("UPDATE portfolio_checks SET status='interrupted' WHERE status IN ('queued','running','cancelling')");
  for(var row:interrupted)worker.submit(dev.codesomething.storage.LearningDataSource.capture(()->{try{runner.recover(row.get("id").toString());jdbc.update("UPDATE portfolio_checks SET status='interrupted' WHERE id=?",row.get("id"));}catch(Exception e){var report=Map.of("snapshotDigest",row.get("digest"),"harnessDigest","","assertions",List.of(),"log","服务中断后的隔离资源清理失败，请恢复Docker后重启重试。" );jdbc.update("UPDATE portfolio_checks SET status='cleanup_failed',report=? WHERE id=?",json.writeValueAsString(report),row.get("id"));}}));
 }
 private static ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,"PORTFOLIO_CONFLICT",message,Map.of());}
 private static String text(String value,String field,int min,int max){if(value==null||value.strip().length()<min||value.length()>max||value.indexOf('\0')>=0)throw ApiException.invalid(field,"请输入"+min+"—"+max+"字的内容。");return value.strip();}
 private static String key(String value){if(value==null||!value.matches("[A-Za-z0-9_-]{1,100}"))throw ApiException.invalid("idempotencyKey","请求编号无效。");return value;}
 private Map<String,Object> row(String id){var rows=jdbc.queryForList("SELECT * FROM portfolio_works WHERE id=?",id);if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"WORK_NOT_FOUND","作品不存在。",Map.of());return rows.getFirst();}
 public record Create(String theme,String domain,String idempotencyKey){}
 @PostMapping public synchronized Map<String,Object> create(@RequestBody Create w){
  String theme=text(w.theme(),"theme",2,80),k=key(w.idempotencyKey());
  if(!"reservation".equals(w.domain()))throw ApiException.invalid("domain","当前自动评价支持有限资源预约；请选择该边界。其他题材可记录在设计中。");
  var old=jdbc.queryForList("SELECT * FROM portfolio_works WHERE idempotency_key=?",k);
  if(!old.isEmpty()){if(!theme.equals(old.getFirst().get("theme"))||!w.domain().equals(old.getFirst().get("domain")))throw conflict("请求编号已用于其他题材。");return work(old.getFirst().get("id").toString());}
  String id=UUID.randomUUID().toString(),now=Instant.now().toString();
  jdbc.update("INSERT INTO portfolio_works(id,theme,domain,rule_version,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",id,theme,w.domain(),RULE,k,now,now);return work(id);
 }
 @GetMapping public List<Map<String,Object>> list(){return jdbc.queryForList("SELECT id FROM portfolio_works ORDER BY updated_at DESC,id").stream().map(r->work(r.get("id").toString())).toList();}
 public static String contract(){return """
  你将实现有限资源预约，自选场地、设备或活动名额题材。内部表结构、分层、事务和测试由你设计。
  GET /api/health → 200 {status:\"ok\"}。
  POST /api/auth/login {username,password} → 200 {token}；隔离初始账号alice、bob，密码Learn-2026!。其他接口使用Bearer token，无效身份401。
  GET /api/resources → 数组，初始id=1容量3、id=2容量2，字段id/title/available。应用自行初始化自己的表，重启不得重置数据。
  POST /api/reservations {resourceId,quantity} → 201 {id,resourceId,quantity,status:\"active\"}；数量必须正整数，非法400，资源不存在404，库存不足409。身份从服务端会话确定；原子扣减且并发不超卖。
  GET /api/reservations → 当前用户预约数组，支持resourceId筛选，不泄露他人记录。
  DELETE /api/reservations/{id} → 204；仅本人可取消，未知404，他人403。恢复库存，再次取消仍204但不能重复恢复。
  错误响应为JSON且有非空message。GET /提供可操作的同源前端，含登录、资源、预约和取消。
  提交JUnit API集成测试及RUN.md：环境、表关系、启动/测试/部署命令、失败处理、技术取舍。工程使用固定POM和lab包，最多32个业务Java文件；不限定类名（启动类Application除外）。
  核心通过后安排一项陌生改动。完成后分别讲解接口与数据流、并发与失败、表关系与取舍、部署与测试，声明帮助来源，再做实际学习回访。
  """;}
 public static String transferContract(){return "新增POST /api/reservations/batch，接收2—5项{resourceId,quantity}数组；成功201返回预约数组。任一项无效400、不存在404或库存不足409时整批回滚；重复资源累计校验。原有权限、取消、持久化和并发规则仍须通过。自行设计并补充测试。";}
 @GetMapping("/{id}") public Map<String,Object> work(@PathVariable String id){
  var r=row(id);var result=new LinkedHashMap<String,Object>();result.put("id",id);result.put("theme",r.get("theme"));result.put("ruleVersion",r.get("rule_version"));result.put("revision",r.get("revision"));result.put("design",r.get("design"));result.put("createdAt",r.get("created_at"));result.put("contract",contract());result.put("transfer",r.get("transfer_at")==null?null:transferContract());
  var checks=jdbc.queryForList("SELECT id,phase,digest,status,report,design_revision,created_at FROM portfolio_checks WHERE work_id=? ORDER BY created_at,id",id);for(var check:checks)if(check.get("report")!=null)check.put("report",json.readTree(check.get("report").toString()));
  var explanations=jdbc.queryForList("SELECT * FROM portfolio_explanations WHERE work_id=? ORDER BY created_at,id",id);for(var e:explanations)e.put("payload",json.readTree(e.get("payload").toString()));
  var visits=jdbc.queryForList("SELECT * FROM portfolio_visits WHERE work_id=? ORDER BY created_at,id",id);for(var v:visits)v.put("snapshot",json.readTree(v.get("snapshot").toString()));
  boolean ready=!checks.isEmpty()&&checks.getLast().get("design_revision").equals(r.get("revision"))&&"passed".equals(checks.getLast().get("status"))&&"transfer".equals(checks.getLast().get("phase"))&&explanations.stream().anyMatch(e->e.get("check_id").equals(checks.getLast().get("id")));
  result.put("checks",checks);result.put("explanations",explanations);result.put("visits",visits);result.put("state",ready?"evidence-ready":checks.isEmpty()?"draft":"in-progress");result.put("independence","待实际回访核实");
  result.put("prerequisites",jdbc.queryForList("SELECT stage_id FROM stage_completions WHERE course_id='collaboration' AND course_version='1.0.0'").size()==8?List.of():List.of(Map.of("title","建议先完成项目B八关，再独立复现主要功能","route","/projects/collaboration")));
  result.put("step",r.get("last_step"));result.put("route","/portfolio/"+id+"?step="+r.get("last_step"));return result;
 }
 public record Position(String step){}
 @PostMapping("/{id}/position") public synchronized Map<String,Object> position(@PathVariable String id,@RequestBody Position w){row(id);if(!Set.of("design","practice","explain","archive").contains(w.step()==null?"":w.step()))throw ApiException.invalid("step","作品位置无效。");jdbc.update("UPDATE portfolio_works SET last_step=?,updated_at=? WHERE id=?",w.step(),Instant.now().toString(),id);return work(id);}
 public record Design(int revision,String design){}
 @PostMapping("/{id}/design") public synchronized Map<String,Object> design(@PathVariable String id,@RequestBody Design w){row(id);String design=text(w.design(),"design",1,12000);if(jdbc.update("UPDATE portfolio_works SET design=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",design,Instant.now().toString(),id,w.revision())!=1)throw conflict("设计已在其他页面更新，请刷新后合并。");return work(id);}
 @GetMapping("/starter") public Map<String,String> starter(){return Map.of("pom.xml",BootProjectSnapshot.trustedPom(true),BootProjectSnapshot.SOURCE_DIRECTORY+"/Application.java","package dev.codesomething.lab;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n@SpringBootApplication\npublic class Application { public static void main(String[] args){SpringApplication.run(Application.class,args);} }\n","RUN.md","# 独立作品\n\n填写业务边界、表关系、环境配置、启动与测试命令、部署、失败处理和取舍。\n");}
 @PostMapping("/{id}/transfer") public synchronized Map<String,Object> transfer(@PathVariable String id){row(id);latestPassed(id,"core");jdbc.update("UPDATE portfolio_works SET transfer_at=COALESCE(transfer_at,?) WHERE id=?",Instant.now().toString(),id);return work(id);}
 private Map<String,Object> latestPassed(String work,String phase){var checks=jdbc.queryForList("SELECT * FROM portfolio_checks WHERE work_id=? AND phase=? ORDER BY created_at DESC,id DESC LIMIT 1",work,phase);if(checks.isEmpty()||!"passed".equals(checks.getFirst().get("status"))||!checks.getFirst().get("design_revision").equals(row(work).get("revision")))throw conflict("请先通过当前设计版本最新的"+(phase.equals("core")?"核心":"迁移")+"检查。");return checks.getFirst();}
 public record Preview(String directory,String phase){}
 public record SourcePreview(Map<String,String> files,String phase){}
 @PostMapping("/{id}/source-previews") public synchronized Map<String,Object> sourcePreview(@PathVariable String id,@RequestBody SourcePreview w){
  phase(id,w.phase());BootProjectSnapshot snapshot;
  try{snapshot=BootProjectSnapshot.fromFiles(w.files(),true);}catch(IllegalArgumentException e){throw ApiException.invalid("files",e.getMessage());}
  String preview=UUID.randomUUID().toString();jdbc.update("INSERT INTO portfolio_previews VALUES(?,?,?,?,?,?,?)",preview,id,w.phase(),snapshot.digest(),json.writeValueAsString(snapshot.files()),row(id).get("revision"),Instant.now().toString());
  return Map.of("id",preview,"digest",snapshot.digest(),"phase",w.phase(),"files",snapshot.files().stream().map(f->Map.of("path",f.path(),"bytes",f.content().getBytes(java.nio.charset.StandardCharsets.UTF_8).length)).toList());
 }
 private void phase(String id,String phase){var r=row(id);if(!Set.of("core","transfer").contains(phase==null?"":phase))throw ApiException.invalid("phase","请选择核心或迁移任务。");if(phase.equals("transfer")){if(r.get("transfer_at")==null)throw conflict("请先领取陌生改动。");latestPassed(id,"core");}}
 @PostMapping("/{id}/previews") public synchronized Map<String,Object> preview(@PathVariable String id,@RequestBody Preview w)throws Exception {
  phase(id,w.phase());if(w.directory()==null||w.directory().isBlank())throw ApiException.invalid("directory","请选择工程绝对目录。");BootProjectSnapshot snapshot;
  try{snapshot=BootProjectSnapshot.capture(Path.of(w.directory()),true);}catch(Exception e){throw ApiException.invalid("directory",e.getMessage());}
  String preview=UUID.randomUUID().toString();jdbc.update("INSERT INTO portfolio_previews VALUES(?,?,?,?,?,?,?)",preview,id,w.phase(),snapshot.digest(),json.writeValueAsString(snapshot.files()),row(id).get("revision"),Instant.now().toString());
  return Map.of("id",preview,"digest",snapshot.digest(),"phase",w.phase(),"files",snapshot.files().stream().map(f->Map.of("path",f.path(),"bytes",f.content().getBytes(java.nio.charset.StandardCharsets.UTF_8).length)).toList());
 }
 public record Check(String previewId,String idempotencyKey){}
 @PostMapping("/{id}/checks") public synchronized Map<String,Object> check(@PathVariable String id,@RequestBody Check w){
  row(id);String k=key(w.idempotencyKey());var previews=jdbc.queryForList("SELECT * FROM portfolio_previews WHERE id=? AND work_id=?",w.previewId(),id);if(previews.isEmpty())throw ApiException.invalid("previewId","请先预览本作品的工程范围。");var p=previews.getFirst();phase(id,p.get("phase").toString());
  var old=jdbc.queryForList("SELECT * FROM portfolio_checks WHERE idempotency_key=?",k);if(!old.isEmpty()){var o=old.getFirst();if(!id.equals(o.get("work_id"))||!p.get("digest").equals(o.get("digest"))||!p.get("phase").equals(o.get("phase"))||!p.get("design_revision").equals(o.get("design_revision")))throw conflict("编号已用于另一份检查或设计版本。");return work(id);}
  if(!p.get("design_revision").equals(row(id).get("revision")))throw conflict("设计已变更，请重新预览工程范围。");
  if(!enabled)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"RUNNER_DISABLED","当前实例未启用隔离检查，预览已保存，可在启用后提交。",Map.of());
  if(jdbc.queryForObject("SELECT count(*) FROM portfolio_checks WHERE status IN ('queued','running','cancelling')",Integer.class)>0)throw conflict("已有作品检查运行中，请等待或停止。");
  String job=UUID.randomUUID().toString();jdbc.update("INSERT INTO portfolio_checks(id,work_id,phase,digest,files,idempotency_key,status,design_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)",job,id,p.get("phase"),p.get("digest"),p.get("files"),k,"queued",p.get("design_revision"),Instant.now().toString());enqueueCheck(job);return work(id);
 }
 public void enqueueCheck(String id) {
  worker.submit(dev.codesomething.storage.LearningDataSource.capture(()->run(id)));
 }
 private boolean cancelled(String id){return !"running".equals(jdbc.queryForObject("SELECT status FROM portfolio_checks WHERE id=?",String.class,id));}
 private void run(String id){if(jdbc.update("UPDATE portfolio_checks SET status='running' WHERE id=? AND status='queued'",id)!=1)return;var c=jdbc.queryForList("SELECT * FROM portfolio_checks WHERE id=?",id).getFirst();try{var out=runner.run(id,BootProjectSnapshot.restore(c.get("files").toString()),"1.0.0",c.get("phase").toString(),()->cancelled(id));jdbc.update("UPDATE portfolio_checks SET status=?,report=? WHERE id=?",out.status(),json.writeValueAsString(out.report()),id);}catch(Exception e){jdbc.update("UPDATE portfolio_checks SET status='environment_error' WHERE id=?",id);}}
 @PostMapping("/{id}/checks/{job}/stop") public synchronized Map<String,Object> stop(@PathVariable String id,@PathVariable String job){row(id);jdbc.update("UPDATE portfolio_checks SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END WHERE id=? AND work_id=? AND status IN ('queued','running')",job,id);return work(id);}
 public record Explanation(String checkId,String help,String flow,String failure,String tradeoff,String deployment){}
 @PostMapping("/{id}/explanations") public synchronized Map<String,Object> explain(@PathVariable String id,@RequestBody Explanation w){
  row(id);var c=latestPassed(id,"transfer");if(!c.get("id").equals(w.checkId()))throw conflict("讲解必须绑定最新通过的迁移检查。");if(!Set.of("none","concept","example").contains(w.help()==null?"":w.help()))throw ApiException.invalid("help","请声明帮助等级与来源。");
  var payload=Map.of("flow",text(w.flow(),"flow",20,4000),"failure",text(w.failure(),"failure",20,4000),"tradeoff",text(w.tradeoff(),"tradeoff",20,4000),"deployment",text(w.deployment(),"deployment",20,4000));
  var old=jdbc.queryForList("SELECT * FROM portfolio_explanations WHERE check_id=?",w.checkId());String encoded=json.writeValueAsString(payload);
  if(!old.isEmpty()){if(!encoded.equals(old.getFirst().get("payload"))||!w.help().equals(old.getFirst().get("help")))throw conflict("已保存该版本讲解；修改实现并重新检查后追加新讲解。");return work(id);}
  jdbc.update("INSERT INTO portfolio_explanations VALUES(?,?,?,?,?,?,?)",UUID.randomUUID().toString(),id,w.checkId(),c.get("digest"),w.help(),encoded,Instant.now().toString());return work(id);
 }
 public record Visit(String observation,String nextAction){}
 @PostMapping("/{id}/visits") public synchronized Map<String,Object> visit(@PathVariable String id,@RequestBody Visit w){
  var work=work(id);if(!"evidence-ready".equals(work.get("state")))throw conflict("先收齐最新工程与讲解证据，再记录首轮回访。");
  String observation=text(w.observation(),"observation",20,4000),next=text(w.nextAction(),"nextAction",5,2000);
  var profile=learner.profile();int reviews=jdbc.queryForObject("SELECT count(*) FROM learner_reviews WHERE status='completed'",Integer.class);
  var snapshot=new LinkedHashMap<String,Object>();snapshot.put("profileSnapshotId",profile.get("snapshotId"));snapshot.put("reviewCount",reviews);snapshot.put("learningCursor",jdbc.queryForList("SELECT * FROM learning_sessions"));
  int recent=jdbc.queryForObject("SELECT count(*) FROM learner_reviews WHERE status='completed' AND finished_at>=?",Integer.class,row(id).get("created_at"));snapshot.put("reviewSinceStart",recent);
  snapshot.put("delayed",Instant.parse(row(id).get("created_at").toString()).plus(Duration.ofHours(24)).isBefore(Instant.now())&&recent>0);snapshot.put("verdict","实际观察记录，独立程度与产品验收待人工复核");
  jdbc.update("INSERT INTO portfolio_visits VALUES(?,?,?,?,?,?)",UUID.randomUUID().toString(),id,observation,next,json.writeValueAsString(snapshot),Instant.now().toString());return work(id);
 }
 @PreDestroy void close(){jdbc.update("UPDATE portfolio_checks SET status='cancelling' WHERE status IN ('queued','running')");worker.shutdown();try{if(!worker.awaitTermination(20,TimeUnit.SECONDS))worker.shutdownNow();}catch(InterruptedException e){Thread.currentThread().interrupt();}}
}

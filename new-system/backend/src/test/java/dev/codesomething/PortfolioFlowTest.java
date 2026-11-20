package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class PortfolioFlowTest {
 @TempDir Path directory;final JsonMapper json=JsonMapper.builder().build();
 ConfigurableApplicationContext start(){return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=true","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath());}
 HttpResponse<String> req(ConfigurableApplicationContext app,String path,Object body)throws Exception{return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/portfolio"+path)).header("Content-Type","application/json").method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());}
 JsonNode ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body());}
 JsonNode check(ConfigurableApplicationContext app,String id,String phase,String directory,String key)throws Exception{
  var preview=ok(req(app,"/"+id+"/previews",Map.of("directory",directory,"phase",phase)));var body=Map.of("previewId",preview.path("id").asText(),"idempotencyKey",key);
  ok(req(app,"/"+id+"/checks",body));ok(req(app,"/"+id+"/checks",body));
  JsonNode work=null;for(int i=0;i<300;i++){work=ok(req(app,"/"+id,null));var checks=work.path("checks");String s=checks.get(checks.size()-1).path("status").asText();if(!Set.of("queued","running","cancelling").contains(s))return work;Thread.sleep(1000);}throw new AssertionError(work);
 }
 @Test void independentProjectCollectsBoundEvidenceAndSurvivesRestartWithoutInventingLearning()throws Exception{
  String id;JsonNode last=null;String fixture=Path.of("../tooling/fixtures/r8-reservation").toAbsolutePath().normalize().toString();
  try(var app=start()){
   id=ok(req(app,"",Map.of("theme","验收专用设备预约","domain","reservation","idempotencyKey","r8-flow"))).path("id").asText();
   ok(req(app,"/"+id+"/design",Map.of("revision",0,"design","预约库存使用事务和条件更新；用户与预约建立外键关系。取消预约锁住原记录，避免并发重复恢复库存。批量统一提交或回滚。")));
   var core=check(app,id,"core",fixture,"core-flow");assertEquals(1,core.path("checks").size());assertEquals("passed",core.path("checks").get(0).path("status").asText(),core.toString());assertTrue(core.path("transfer").isNull());
   ok(req(app,"/"+id+"/transfer",Map.of()));last=check(app,id,"transfer",fixture,"transfer-flow");assertEquals(2,last.path("checks").size());var check=last.path("checks").get(1);assertEquals("passed",check.path("status").asText(),last.toString());
   assertEquals("in-progress",last.path("state").asText());
   String cid=check.path("id").asText();var explanation=Map.of("checkId",cid,"help","example","flow","接口接收参数并校验身份，然后通过服务层与数据库交互，响应由控制器构建。","failure","库存使用条件更新，失败抛异常触发事务回滚，取消使用行锁避免重复恢复库存。","tradeoff","用户、资源与预约分表，使用外键维护关系，用事务保证批量操作的一致性。","deployment","在隔离MySQL中运行HTTP集成测试，通过环境变量提供数据库连接，参考过概念示例。");
   assertEquals(409,req(app,"/"+id+"/explanations",Map.of("checkId","other")).statusCode());
   var explained=ok(req(app,"/"+id+"/explanations",explanation));assertEquals("evidence-ready",explained.path("state").asText());
   assertEquals(1,ok(req(app,"/"+id+"/explanations",explanation)).path("explanations").size());
   var visited=ok(req(app,"/"+id+"/visits",Map.of("observation","这是工程验收模拟回访，仅验证保存通路，不构成真实学习者独立完成或产品通过证据。","nextAction","实际学习后再核对续学、画像与复习。")));
   assertEquals(1,visited.path("visits").size());assertFalse(visited.path("visits").get(0).path("snapshot").path("delayed").asBoolean());assertEquals(0,visited.path("visits").get(0).path("snapshot").path("reviewCount").asInt());
   ok(req(app,"/"+id+"/position",Map.of("step","archive")));
   PortfolioRunnerTest.evidence("api-full-flow",visited);
  }
  try(var app=start()){
   var restored=ok(req(app,"/"+id,null));assertEquals("evidence-ready",restored.path("state").asText());assertEquals("archive",restored.path("step").asText());assertEquals("待实际回访核实",restored.path("independence").asText());assertEquals("example",restored.path("explanations").get(0).path("help").asText());assertEquals(1,restored.path("visits").size());
   Path broken=directory.resolve("broken");try(var paths=Files.walk(Path.of(fixture))){for(var path:paths.filter(Files::isRegularFile).toList()){Path to=broken.resolve(Path.of(fixture).relativize(path));Files.createDirectories(to.getParent());Files.copy(path,to);}}
   Files.writeString(broken.resolve("src/main/java/dev/codesomething/lab/Application.java"),"this is not java");
   var failed=check(app,id,"transfer",broken.toString(),"broken-flow");assertEquals("compile_error",failed.path("checks").get(2).path("status").asText());assertEquals("in-progress",failed.path("state").asText());assertEquals(1,failed.path("explanations").size());
   assertEquals(409,req(app,"/"+id+"/visits",Map.of("observation","x".repeat(30),"nextAction","y".repeat(10))).statusCode());PortfolioRunnerTest.evidence("api-stale-invalidated",failed);
  }
 }
}

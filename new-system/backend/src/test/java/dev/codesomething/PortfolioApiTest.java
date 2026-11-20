package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class PortfolioApiTest {
 @TempDir Path directory;
 final JsonMapper json=JsonMapper.builder().build();
 ConfigurableApplicationContext start(){return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath());}
 HttpResponse<String> request(ConfigurableApplicationContext app,String path,Object body)throws Exception{return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/portfolio"+path)).header("Content-Type","application/json").method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());}
 JsonNode ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body());}
 @Test void browserSourceCanBePreviewedWithoutAHostDirectory()throws Exception {
  try(var app=start()){
   String id=ok(request(app,"",Map.of("theme","网页预约作品","domain","reservation","idempotencyKey","browser-work"))).path("id").asText();
   Map<String,String> files=new LinkedHashMap<>();var starter=ok(request(app,"/starter",null));starter.properties().forEach(e->files.put(e.getKey(),e.getValue().asText()));
   var preview=ok(request(app,"/"+id+"/source-previews",Map.of("files",files,"phase","core")));
   assertEquals(3,preview.path("files").size());
   files.put("../outside.java","outside");
   assertEquals(400,request(app,"/"+id+"/source-previews",Map.of("files",files,"phase","core")).statusCode());
  }
 }
 @Test void learnerCanChooseNewThemeSaveDesignAndResumeWithoutClaimingIndependence()throws Exception {
  String id;
  try(var app=start()){
   var body=Map.of("theme","摄影设备借用","domain","reservation","idempotencyKey","camera-1");
   var work=ok(request(app,"",body));id=work.path("id").asText();
   assertEquals("r8-reservation-1",work.path("ruleVersion").asText());
   assertEquals("draft",work.path("state").asText());
   assertEquals(id,ok(request(app,"",body)).path("id").asText());
   assertEquals(409,request(app,"",Map.of("theme","场地预约","domain","reservation","idempotencyKey","camera-1")).statusCode());
   assertTrue(work.path("prerequisites").size()>0);
   assertTrue(work.path("contract").asText().contains("/api/reservations"));
   var saved=ok(request(app,"/"+id+"/design",Map.of("revision",0,"design","用户预约相机，每次预约必须校验可用数量，并在事务中扣减。")));
   assertEquals(1,saved.path("revision").asInt());
   assertEquals(409,request(app,"/"+id+"/design",Map.of("revision",0,"design","过期修改")).statusCode());
   assertEquals(409,request(app,"/"+id+"/transfer",Map.of()).statusCode());
   assertEquals(409,request(app,"/"+id+"/explanations",Map.of("checkId","missing","help","none")).statusCode());
  }
  try(var app=start()){
   var restored=ok(request(app,"/"+id,null));assertEquals(1,restored.path("revision").asInt());assertEquals(0,restored.path("checks").size());assertEquals("待实际回访核实",restored.path("independence").asText());
   assertEquals(id,ok(request(app,"",null)).get(0).path("id").asText());
  }
 }
 @Test void previewIsScopedAndCapturesImmutableFilesWithoutRunningDisabledCode()throws Exception {
  try(var app=start()){
   String id=ok(request(app,"",Map.of("theme","场地预约","domain","reservation","idempotencyKey","place"))).path("id").asText();
   String other=ok(request(app,"",Map.of("theme","名额预约","domain","reservation","idempotencyKey","event"))).path("id").asText();
   Path project=directory.resolve("learner");Files.createDirectories(project.resolve("src/main/java/dev/codesomething/lab"));
   var files=ok(request(app,"/starter",null));for(var it=files.properties().iterator();it.hasNext();){var e=it.next();Path to=project.resolve(e.getKey());Files.createDirectories(to.getParent());Files.writeString(to,e.getValue().asText());}
   var preview=ok(request(app,"/"+id+"/previews",Map.of("directory",project.toString(),"phase","core")));
   assertEquals(3,preview.path("files").size());assertEquals(64,preview.path("digest").asText().length());
   assertEquals(400,request(app,"/"+other+"/checks",Map.of("previewId",preview.path("id").asText(),"idempotencyKey","foreign")).statusCode());
   assertEquals(503,request(app,"/"+id+"/checks",Map.of("previewId",preview.path("id").asText(),"idempotencyKey","disabled")).statusCode());
   assertEquals(409,request(app,"/"+id+"/previews",Map.of("directory",project.toString(),"phase","transfer")).statusCode());
   assertEquals(400,request(app,"/"+id+"/previews",Map.of("directory",project.toString(),"phase","bad")).statusCode());
   Files.writeString(project.resolve("RUN.md"),"changed on disk");
   var newer=ok(request(app,"/"+id+"/previews",Map.of("directory",project.toString(),"phase","core")));assertNotEquals(preview.path("digest").asText(),newer.path("digest").asText());
   // Model a previously stored job; assertions remain at the HTTP boundary.
   app.getBean(org.springframework.jdbc.core.JdbcTemplate.class).update("INSERT INTO portfolio_checks(id,work_id,phase,digest,files,idempotency_key,status,design_revision,created_at) SELECT 'old-check',work_id,phase,digest,files,'old-key','passed',design_revision,created_at FROM portfolio_previews WHERE id=?",newer.path("id").asText());
   ok(request(app,"/"+id+"/design",Map.of("revision",0,"design","更新后的设计，新增对并发预约与取消的业务约束。")));
   assertEquals(409,request(app,"/"+id+"/checks",Map.of("previewId",newer.path("id").asText(),"idempotencyKey","new-design")).statusCode());
   var revised=ok(request(app,"/"+id+"/previews",Map.of("directory",project.toString(),"phase","core")));
   assertEquals(409,request(app,"/"+id+"/checks",Map.of("previewId",revised.path("id").asText(),"idempotencyKey","old-key")).statusCode());
   assertEquals(409,request(app,"/"+id+"/visits",Map.of("observation","x".repeat(30),"nextAction","y".repeat(10))).statusCode());
   assertEquals(400,request(app,"",Map.of("theme","任意题材","domain","unknown","idempotencyKey","bad")).statusCode());
  }
 }
}

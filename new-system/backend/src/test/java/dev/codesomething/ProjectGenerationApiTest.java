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

class ProjectGenerationApiTest {
    @TempDir Path directory;
    final JsonMapper json=JsonMapper.builder().build();
    final HttpClient client=HttpClient.newHttpClient();
    ConfigurableApplicationContext start(){return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath());}
    ConfigurableApplicationContext fake(){return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath(),"--cs.tutor.binary=node","--cs.tutor.arguments=[\""+Path.of("src/test/resources/fake-project-planner.mjs").toAbsolutePath().toString().replace("\\","/")+"\"]");}
    HttpResponse<String> request(ConfigurableApplicationContext app,String route,Object body)throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/projects"+route)).header("Content-Type","application/json").method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body());}
    @Test void generatedCodingCanFinishWithoutChoiceOrExplanationAndKeepsHelpEvidence() throws Exception {
        try(var app=start()) {
            var draft=ok(request(app,"/drafts",Map.of("interest","图书阅读","kind","adapt","idempotencyKey","coding-first")));
            String id=draft.path("id").asText(),payload=draft.path("payload").toString(),now=java.time.Instant.now().toString();
            var jdbc=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            String digest=dev.codesomething.workspaces.WorkspaceController.hash(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            jdbc.update("INSERT INTO generated_courses VALUES(?,?,?,?,?)",id,digest,payload,"{}",now);
            var report=Map.of("snapshotDigest","code-digest","courseVersion","1.0.0","stageId","read","policy","r6-1","functionalPassed",true,"assertions",List.of(Map.of("name","接口","passed",true)));
            jdbc.update("INSERT INTO generated_attempts VALUES(?,?,?,?,?,?,?,?,?)","coding-check",id,"read","coding-check","code-digest","{}","passed",json.writeValueAsString(report),now);
            ok(request(app,"/courses/"+id+"/stages/read/reference",null));
            assertEquals(409,request(app,"/checks/coding-check/complete-code",Map.of("digest","old","help","none")).statusCode());
            var body=Map.of("digest","code-digest","help","none");
            ok(request(app,"/checks/coding-check/complete-code",body));
            ok(request(app,"/checks/coding-check/complete-code",body));
            var course=ok(request(app,"/courses/"+id,null));
            assertEquals(1,course.path("completions").size());
            assertEquals("example",course.path("completions").get(0).path("help").asText());
        }
    }
    @Test void candidatesUseRealEvidenceAndKeepUnpublishedWorkOutsideLearning()throws Exception {
        try(var app=start()){
            var result=ok(request(app,"/candidates",Map.of("interest","图书阅读")));
            assertFalse(result.path("profileSnapshotId").asText().isBlank());
            assertEquals(3,result.path("candidates").size());
            assertEquals("existing",result.path("candidates").get(0).path("kind").asText());
            assertEquals("adapt",result.path("candidates").get(1).path("kind").asText());
            assertEquals("generate",result.path("candidates").get(2).path("kind").asText());
            assertTrue(result.path("candidates").get(2).path("gaps").size()>0);
            assertEquals(0,result.path("verifiedCount").asInt());
            assertEquals(3,result.path("sources").size());
            assertEquals(404,request(app,"/courses/missing",null).statusCode());
            assertEquals(400,request(app,"/candidates",Map.of("interest","")).statusCode());
        }
    }
    @Test void draftIsIdempotentPersistentAndCannotPublishBeforeAllGates()throws Exception {
        String id;
        try(var app=start()){
            var body=Map.of("interest","图书阅读","kind","adapt","idempotencyKey","draft-one");
            var draft=ok(request(app,"/drafts",body));id=draft.path("id").asText();
            assertEquals("draft",draft.path("status").asText());
            assertEquals(id,ok(request(app,"/drafts",body)).path("id").asText());
            assertEquals(409,request(app,"/drafts",Map.of("interest","其他","kind","adapt","idempotencyKey","draft-one")).statusCode());
            assertEquals(409,request(app,"/drafts/"+id+"/publish",Map.of()).statusCode());
            assertEquals(404,request(app,"/courses/"+id,null).statusCode());
            assertEquals(3,draft.path("payload").path("chapters").size());
        }
        try(var app=start()){var draft=ok(request(app,"/drafts/"+id,null));assertEquals("draft",draft.path("status").asText());assertEquals("图书阅读",draft.path("interest").asText());}
    }
    JsonNode until(ConfigurableApplicationContext app,String id,String status)throws Exception{JsonNode value=null;for(int i=0;i<200;i++){value=ok(request(app,"/drafts/"+id,null));if(status.equals(value.path("status").asText()))return value;Thread.sleep(50);}throw new AssertionError(value);}
    @Test void providerFailuresKeepPartialDraftsAndExplicitRetryDoesNotBillAnotherRoute()throws Exception{
        try(var app=fake()){
            var body=Map.of("interest","QUOTA","kind","generate","idempotencyKey","quota");String id=ok(request(app,"/drafts",body)).path("id").asText();var failed=until(app,id,"failed");assertEquals("partial",failed.path("partial").asText());assertTrue(failed.path("error").asText().contains("不会切换付费API"));assertEquals(id,ok(request(app,"/drafts",body)).path("id").asText());ok(request(app,"/drafts/"+id+"/retry",Map.of()));until(app,id,"failed");
            String valid=ok(request(app,"/drafts",Map.of("interest","阅读","kind","generate","idempotencyKey","valid"))).path("id").asText();assertEquals("books",until(app,valid,"draft").path("payload").path("plan").path("resource").asText());
            String invalid=ok(request(app,"/drafts",Map.of("interest","INVALID","kind","generate","idempotencyKey","invalid"))).path("id").asText();until(app,invalid,"failed");assertEquals(409,request(app,"/drafts/"+invalid+"/publish",Map.of()).statusCode());
        }
    }
    @Test void stopKeepsPartialOutputAndRestartAllowsRecovery()throws Exception{
        String id;
        try(var app=fake()){
            id=ok(request(app,"/drafts",Map.of("interest","SLOW","kind","generate","idempotencyKey","slow"))).path("id").asText();Thread.sleep(600);var stopped=ok(request(app,"/drafts/"+id+"/stop",Map.of()));assertEquals("cancelled",stopped.path("status").asText());assertFalse(stopped.path("partial").asText().isBlank());
        }
        try(var app=fake()){assertEquals("cancelled",ok(request(app,"/drafts/"+id,null)).path("status").asText());assertEquals(404,request(app,"/courses/"+id,null).statusCode());}
    }
}

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

class UnderstandingApiTest {
    @TempDir Path directory;
    final HttpClient client=HttpClient.newHttpClient();
    final JsonMapper json=JsonMapper.builder().build();
    ConfigurableApplicationContext start(String... extra) {
        var args=new ArrayList<>(List.of("--server.port=0","--cs.runner.enabled=false",
            "--cs.data-directory="+directory.resolve("data"),"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath().normalize()));
        for(String value:extra){String prefix=value.substring(0,value.indexOf('=')+1);args.removeIf(arg->arg.startsWith(prefix));args.add(value);}
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run(args.toArray(String[]::new));
    }
    HttpResponse<String> request(ConfigurableApplicationContext app,String method,String route,Object body,String token) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1"+route)).header("Content-Type","application/json");
        if(token!=null)builder.header("Authorization","Bearer "+token);
        return client.send(builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(HttpResponse<String> response){assertEquals(200,response.statusCode(),response.body());return json.readTree(response.body());}
    JsonNode pair(ConfigurableApplicationContext app,Path workspace,String stage) throws Exception {
        var preview=ok(request(app,"POST","/workspace-previews",Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.1.0","stageId",stage),null));
        return ok(request(app,"POST","/workspace-bindings",Map.of("previewId",preview.path("id").asText(),"pairingCode",preview.path("pairingCode").asText()),null));
    }
    JsonNode check(ConfigurableApplicationContext app,JsonNode binding) throws Exception {
        String token=binding.path("token").asText();
        var preview=ok(request(app,"GET","/workspace-bindings/"+binding.path("id").asText()+"/preview",null,token));
        var submission=ok(request(app,"POST","/submissions",Map.of("bindingId",binding.path("id").asText(),"expectedDigest",preview.path("digest").asText()),token));
        return ok(request(app,"POST","/check-jobs",Map.of("submissionId",submission.path("id").asText(),"idempotencyKey",UUID.randomUUID().toString()),token));
    }
    Map<String,Object> attempt(String job,String key,Map<String,Integer> answers){return Map.of("jobId",job,"ruleVersion","1","answers",answers,"idempotencyKey",key);}
    @Test void codeCompletionNeedsFreshFunctionalEvidenceButNoQuizAndIsIdempotent() throws Exception {
        var workspace=Files.createDirectory(directory.resolve("coding-first"));
        Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        try(var app=start()) {
            var binding=pair(app,workspace,"run-server");String token=binding.path("token").asText();
            var job=check(app,binding);String id=job.path("id").asText();
            var body=Map.of("jobId",id);
            assertEquals(401,request(app,"POST","/understanding-attempts/complete-code",body,null).statusCode());
            assertEquals(409,request(app,"POST","/understanding-attempts/complete-code",body,token).statusCode());
            var submission=ok(request(app,"GET","/submissions/"+job.path("submissionId").asText(),null,token));
            var report=Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","snapshotDigest",submission.path("digest").asText(),"policy","server-smoke-v1","functionalPassed",true,"assertions",List.of(Map.of("name","接口响应","passed",true,"expected","200","actual","200")));
            app.getBean(org.springframework.jdbc.core.JdbcTemplate.class).update("UPDATE check_jobs SET status='passed',report=? WHERE id=?",json.writeValueAsString(report),id);
            ok(request(app,"POST","/understanding-attempts/complete-code",body,token));
            ok(request(app,"POST","/understanding-attempts/complete-code",body,token));
            var progress=ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null));
            assertEquals(1,progress.path("completedCount").asInt());
            assertTrue(progress.path("completions").get(0).path("understandingId").isNull());
            assertEquals("fix-response",progress.path("nextCodeStage").asText());
            assertEquals(0,ok(request(app,"GET","/understanding-attempts/jobs/"+id,null,token)).size());
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { int changed; }");
            assertEquals(409,request(app,"POST","/understanding-attempts/complete-code",body,token).statusCode());
        }
    }
    @Test void formalQuestionsAreSeparateFromPracticeAndDoNotExposeTheAnswerKey() throws Exception {
        try(var app=start()) {
            for(String stage:List.of("run-server","fix-response","transfer")) {
                var rule=ok(request(app,"GET","/understanding-rules/http-json-basics/1.1.0/"+stage,null,null));
                assertEquals("1",rule.path("ruleVersion").asText());
                assertEquals(2,rule.path("questions").size());
                assertFalse(rule.toString().contains("answer"));
                assertFalse(rule.toString().contains("correct"));
            }
            assertEquals(404,request(app,"GET","/understanding-rules/http-json-basics/1.0.0/json-task-response",null,null).statusCode());
            var progress=ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null));
            assertEquals(0,progress.path("completedCount").asInt());
        }
    }
    @Test void answersCannotCompleteAStageWithoutAnEffectiveFunctionalResult() throws Exception {
        var workspace=Files.createDirectory(directory.resolve("practice"));
        Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        try(var app=start()) {
            var binding=pair(app,workspace,"run-server");String token=binding.path("token").asText();
            var job=check(app,binding);var body=attempt(job.path("id").asText(),"blocked",Map.of("restart",1,"connection",2));
            assertEquals(401,request(app,"POST","/understanding-attempts",body,null).statusCode());
            assertEquals(409,request(app,"POST","/understanding-attempts",body,token).statusCode());
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null)).path("completedCount").asInt());
        }
    }
    JsonNode await(ConfigurableApplicationContext app,JsonNode job,String token) throws Exception {
        for(int i=0;i<600&&List.of("queued","running").contains(job.path("status").asText());i++) {
            Thread.sleep(100);job=ok(request(app,"GET","/jobs/"+job.path("id").asText(),null,token));
        }
        assertEquals("passed",job.path("status").asText(),job.toString());return job;
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void bothResultsCreateOneCompletionAndAttemptsSurviveRestart() throws Exception {
        var workspace=Files.createDirectory(directory.resolve("real-practice"));
        String source=Files.readString(Path.of("../course-packs/http-json-basics/1.1.0/TaskServer.java"));
        Files.writeString(workspace.resolve("TaskServer.java"),source);
        String token,jobId,attemptId;
        try(var app=start("--cs.runner.enabled=true")) {
            var binding=pair(app,workspace,"run-server");token=binding.path("token").asText();
            var job=await(app,check(app,binding),token);jobId=job.path("id").asText();
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null)).path("completedCount").asInt());
            var wrong=ok(request(app,"POST","/understanding-attempts",attempt(jobId,"wrong",Map.of("restart",0,"connection",2)),token));
            assertFalse(wrong.path("passed").asBoolean());
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null)).path("completedCount").asInt());
            var body=attempt(jobId,"correct",Map.of("restart",1,"connection",2));
            var passed=ok(request(app,"POST","/understanding-attempts",body,token));
            assertTrue(passed.path("passed").asBoolean());attemptId=passed.path("id").asText();
            assertEquals(attemptId,ok(request(app,"POST","/understanding-attempts",body,token)).path("id").asText());
            assertEquals(409,request(app,"POST","/understanding-attempts",attempt(jobId,"correct",Map.of("restart",0,"connection",2)),token).statusCode());
            var progress=ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null));
            assertEquals(1,progress.path("completedCount").asInt());
            assertEquals("fix-response",progress.path("nextCodeStage").asText());
            assertEquals(job.path("report").path("snapshotDigest").asText(),progress.path("completions").get(0).path("snapshotDigest").asText());
            Files.writeString(workspace.resolve("TaskServer.java"),source+"\n// changed");
            assertEquals(409,request(app,"POST","/understanding-attempts",attempt(jobId,"changed",Map.of("restart",1,"connection",2)),token).statusCode());
            assertEquals(1,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null)).path("completedCount").asInt());
        }
        try(var app=start()) {
            var attempts=ok(request(app,"GET","/understanding-attempts/jobs/"+jobId,null,token));
            assertEquals(2,attempts.size());
            assertTrue(attempts.toString().contains(attemptId));
            assertEquals(1,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null,null)).path("completedCount").asInt());
        }
    }
    @Test void previewCannotReplaceTheFormalCursorAndUnknownChaptersCannotBeSaved() throws Exception {
        try(var app=start()) {
            var first=Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","step","understanding","expectedRevision",0);
            ok(request(app,"PUT","/learning/sessions/local",first,null));
            assertEquals(409,request(app,"PUT","/learning/sessions/local",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","transfer","step","teaching","expectedRevision",1),null).statusCode());
            assertEquals(404,request(app,"PUT","/learning/sessions/local",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","not-real","step","teaching","expectedRevision",1),null).statusCode());
            var resume=ok(request(app,"GET","/learning/continue",null,null));
            assertEquals("run-server",resume.path("session").path("stageId").asText());
            assertEquals("understanding",resume.path("session").path("step").asText());
            assertTrue(resume.path("checksAvailable").asBoolean());
            assertEquals(409,request(app,"PUT","/learning/sessions/local",first,null).statusCode());
        }
    }
    @Test void upgradingFromR23PreservesTheExistingCursorAndAllowsTheNewUnderstandingStep() throws Exception {
        Path data=Files.createDirectories(directory.resolve("data"));String url="jdbc:sqlite:"+data.resolve("codesomething.db");
        org.flywaydb.core.Flyway.configure().dataSource(url,null,null).locations("classpath:db/migration").target("6").load().migrate();
        try(var connection=java.sql.DriverManager.getConnection(url);var statement=connection.createStatement()) {
            statement.executeUpdate("INSERT INTO learning_sessions VALUES('local','http-json-basics','1.1.0','run-server','report',7,'2026-11-11T12:00:00Z')");
        }
        try(var app=start()) {
            var resume=ok(request(app,"GET","/learning/continue",null,null));assertEquals(7,resume.path("session").path("revision").asInt());assertEquals("report",resume.path("session").path("step").asText());
            var saved=ok(request(app,"PUT","/learning/sessions/local",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","step","understanding","expectedRevision",7),null));
            assertEquals(8,saved.path("revision").asInt());assertEquals("understanding",saved.path("step").asText());
        }
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void realLearningSequenceEnforcesPrerequisitesAndEndsWithAProjectSummary() throws Exception {
        var workspace=Files.createDirectory(directory.resolve("sequence"));
        String starter=Files.readString(Path.of("../course-packs/http-json-basics/1.1.0/TaskServer.java"));
        String fixed=starter.replace("\"completed\":\"false\"","\"completed\":false");int last=fixed.lastIndexOf("status = 200;");fixed=fixed.substring(0,last)+fixed.substring(last).replaceFirst("status = 200;","status = 404;");
        Files.writeString(workspace.resolve("TaskServer.java"),fixed);
        try(var app=start("--cs.runner.enabled=true")) {
            var fixBinding=pair(app,workspace,"fix-response");String fixToken=fixBinding.path("token").asText();
            var fixJob=await(app,check(app,fixBinding),fixToken);String fixId=fixJob.path("id").asText();
            assertEquals(409,request(app,"POST","/understanding-attempts",attempt(fixId,"early",Map.of("status",0,"type",1)),fixToken).statusCode());
            var runBinding=pair(app,workspace,"run-server");String token=runBinding.path("token").asText();
            var run=await(app,check(app,runBinding),token);String runId=run.path("id").asText();
            assertEquals(401,request(app,"POST","/understanding-attempts",attempt(runId,"other-token",Map.of("restart",1,"connection",2)),fixToken).statusCode());
            assertEquals(409,request(app,"POST","/understanding-attempts",Map.of("jobId",runId,"ruleVersion","0","idempotencyKey","rule","answers",Map.of("restart",1,"connection",2)),token).statusCode());
            assertEquals(400,request(app,"POST","/understanding-attempts",attempt(runId,"missing",Map.of("restart",1)),token).statusCode());
            var body=attempt(runId,"concurrent",Map.of("restart",1,"connection",2));
            try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
                var one=executor.submit(()->request(app,"POST","/understanding-attempts",body,token));
                var two=executor.submit(()->request(app,"POST","/understanding-attempts",body,token));
                assertEquals(ok(one.get()).path("id").asText(),ok(two.get()).path("id").asText());
            }
            ok(request(app,"PUT","/learning/sessions/local",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","step","understanding","expectedRevision",0),null));
            var resume=ok(request(app,"GET","/learning/continue",null,null));
            assertEquals("next-stage",resume.path("nextAction").asText());assertEquals("trace",resume.path("nextStageId").asText());
            Files.delete(workspace.resolve("TaskServer.java"));
            assertEquals(409,request(app,"POST","/understanding-attempts",attempt(fixId,"unknown",Map.of("status",0,"type",1)),fixToken).statusCode());
            Files.writeString(workspace.resolve("TaskServer.java"),fixed);
            assertTrue(ok(request(app,"POST","/understanding-attempts",attempt(fixId,"fix",Map.of("status",0,"type",1)),fixToken)).path("passed").asBoolean());
            Files.writeString(workspace.resolve("TaskServer.java"),fixed.replace("/api/tasks/","/api/notes/").replace("completed","archived").replace("学习 HTTP","第一条笔记"));
            var noteBinding=pair(app,workspace,"transfer");String notesToken=noteBinding.path("token").asText();var notes=await(app,check(app,noteBinding),notesToken);
            assertTrue(ok(request(app,"POST","/understanding-attempts",attempt(notes.path("id").asText(),"notes",Map.of("route",1,"mapping",2)),notesToken)).path("passed").asBoolean());
            ok(request(app,"PUT","/learning/sessions/local",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","transfer","step","understanding","expectedRevision",1),null));
            var end=ok(request(app,"GET","/learning/continue",null,null));
            assertTrue(end.path("progress").path("projectCompleted").asBoolean());assertEquals(3,end.path("progress").path("completedCount").asInt());assertEquals("project-summary",end.path("nextAction").asText());
            ok(request(app,"POST","/understanding-attempts",body,token));
            assertEquals("transfer",ok(request(app,"GET","/learning/continue",null,null)).path("session").path("stageId").asText());
        }
    }
}

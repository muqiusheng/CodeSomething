package dev.codesomething;

import java.nio.file.*;
import java.util.*;
import java.net.URI;
import java.net.http.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class TutorApiTest {
    @Test void tutorUsesCurrentCodingGoalAndSelectedLessonInsteadOfOldPreparationCopy() throws Exception {
        try(var app=start()) {
            var body=question("current-lesson","AUDIT");body.put("stageId","workspace");body.put("lessonId","lesson-3");body.put("learningStep","task");
            var answer=ok(request(app,"POST","/tutor/requests",body));
            var completed=until(app,answer.path("id").asText(),"completed");
            assertTrue(completed.path("answer").asText().contains("准备第一条数据"),completed.toString());
            assertTrue(completed.path("answer").asText().contains("本章需要亲手编写任务接口响应"),completed.toString());
            assertTrue(completed.path("contextManifest").asText().contains("lesson-3"));
        }
    }
    @Test void conceptPracticeIsAvailableBeforeCodeAndDoesNotWriteCompletion() throws Exception {
        try(var app=start()) {
            var result=ok(request(app,"POST","/understanding-rules/http-json-basics/1.1.0/fix-response/practice",Map.of("answers",Map.of("status",0,"type",1))));
            assertTrue(result.path("passed").asBoolean());
            assertFalse(result.path("recorded").asBoolean());
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null)).path("completedCount").asInt());
            assertEquals(400,request(app,"POST","/understanding-rules/http-json-basics/1.1.0/fix-response/practice",Map.of("answers",Map.of("status",99,"type",1))).statusCode());
        }
    }
    @TempDir Path directory;
    final HttpClient client=HttpClient.newHttpClient();final JsonMapper json=JsonMapper.builder().build();
    HttpResponse<String> request(ConfigurableApplicationContext app,String method,String route,Object body) throws Exception {return authorized(app,method,route,body,null);}
    HttpResponse<String> authorized(ConfigurableApplicationContext app,String method,String route,Object body,String token) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1"+route)).header("Content-Type","application/json");
        if(token!=null)builder.header("Authorization","Bearer "+token);
        return client.send(builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(HttpResponse<String> response){assertEquals(200,response.statusCode(),response.body());return json.readTree(response.body());}
    ConfigurableApplicationContext start() {
        return new org.springframework.boot.builder.SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false",
            "--cs.data-directory="+directory.resolve("data"),"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath().normalize(),
            "--cs.tutor.binary=node","--cs.tutor.arguments=[\""+Path.of("src/test/resources/fake-app-server.mjs").toAbsolutePath().toString().replace("\\","/")+"\"]");
    }
    Map<String,Object> question(String key,String question) {return new LinkedHashMap<>(Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","json","level","concept","question",question,"includeLesson",true,"idempotencyKey",key));}
    JsonNode until(ConfigurableApplicationContext app,String id,String expected) throws Exception {
        JsonNode answer=null;for(int i=0;i<100;i++){answer=ok(request(app,"GET","/tutor/requests/"+id,null));if(answer.path("status").asText().equals(expected))return answer;Thread.sleep(80);}fail(answer.toString());return null;
    }
    @Test void stoppingAfterPartialOutputPreservesItAndDoesNotGenerateAgainOnRestart() throws Exception {
        String id;
        try(var app=start()) {
            id=ok(request(app,"POST","/tutor/requests",question("stop","SLOW"))).path("id").asText();
            JsonNode answer=null;for(int i=0;i<100;i++){answer=ok(request(app,"GET","/tutor/requests/"+id,null));if(!answer.path("answer").asText().isEmpty())break;Thread.sleep(80);}
            assertEquals("false是",answer.path("answer").asText());
            assertEquals(409,request(app,"POST","/tutor/requests",question("busy","另一个问题")).statusCode());
            ok(request(app,"POST","/tutor/requests/"+id+"/stop",Map.of()));
            assertEquals("false是",until(app,id,"cancelled").path("answer").asText());
        }
        try(var app=start()){assertEquals("cancelled",ok(request(app,"GET","/tutor/requests/"+id,null)).path("status").asText());}
    }
    @Test void quotaFailurePreservesPartialAnswerAndAllowsAnExplicitNewRequest() throws Exception {
        try(var app=start()) {
            String id=ok(request(app,"POST","/tutor/requests",question("limited","QUOTA"))).path("id").asText();
            var failed=until(app,id,"failed");
            assertEquals("RATE_LIMITED",failed.path("errorCode").asText());
            assertEquals("false是",failed.path("answer").asText());
            assertTrue(failed.path("message").asText().contains("不会切换付费API"));
            String retry=ok(request(app,"POST","/tutor/requests",question("explicit-retry","再问一次"))).path("id").asText();
            assertNotEquals(id,retry);until(app,retry,"completed");
        }
    }
    @Test void selectedSnapshotsRequireAuthorizationAndMustMatchTheLesson() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { String marker=\"SELECTED_SNAPSHOT\"; }");
        try(var app=start()) {
            var preview=ok(request(app,"POST","/workspace-previews",Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.1.0","stageId","fix-response")));
            var binding=ok(request(app,"POST","/workspace-bindings",Map.of("previewId",preview.path("id").asText(),"pairingCode",preview.path("pairingCode").asText())));
            String token=binding.path("token").asText();
            var snapshot=ok(authorized(app,"POST","/submissions",Map.of("bindingId",binding.path("id").asText(),"expectedDigest",preview.path("digest").asText()),token));
            var body=question("context","AUDIT");body.put("submissionId",snapshot.path("id").asText());
            assertEquals(401,request(app,"POST","/tutor/requests",body).statusCode());
            assertEquals(400,authorized(app,"POST","/tutor/requests",body,token).statusCode());
            body.put("stageId","fix-response");body.put("includeLesson",false);
            String id=ok(authorized(app,"POST","/tutor/requests",body,token)).path("id").asText();
            assertEquals(401,request(app,"GET","/tutor/requests/"+id,null).statusCode());
            assertEquals(401,request(app,"GET","/tutor/requests/"+id+"/events",null).statusCode());
            JsonNode answer=null;for(int i=0;i<100;i++){answer=ok(authorized(app,"GET","/tutor/requests/"+id,null,token));if(answer.path("status").asText().equals("completed"))break;Thread.sleep(80);}
            assertTrue(answer.path("answer").asText().contains("SELECTED_SNAPSHOT"),answer.toString());
            assertFalse(answer.path("answer").asText().contains("课程片段"));
            assertTrue(answer.path("contextManifest").asText().contains(snapshot.path("digest").asText()));
            String without=ok(request(app,"POST","/tutor/requests",question("no-code","AUDIT"))).path("id").asText();
            var clean=until(app,without,"completed");
            assertFalse(clean.path("answer").asText().contains("SELECTED_SNAPSHOT"));
            assertFalse(clean.path("answer").asText().contains("\"answer\":"));
            assertFalse(clean.path("answer").asText().contains("public static void main"));
        }
    }
    @Test void streamedTutorAnswerIsIdempotentAndSurvivesRestartWithoutCompletingLessons() throws Exception {
        String id;
        try(var app=start()) {
            var body=question("stream-once","解释false");
            id=ok(request(app,"POST","/tutor/requests",body)).path("id").asText();
            assertFalse(id.isBlank());
            var repeated=ok(request(app,"POST","/tutor/requests",body));assertEquals(id,repeated.path("id").asText());
            body.put("question","不同问题");assertEquals(409,request(app,"POST","/tutor/requests",body).statusCode());
            tools.jackson.databind.JsonNode answer=null;
            for(int i=0;i<100;i++){answer=ok(request(app,"GET","/tutor/requests/"+id,null));if(answer.path("status").asText().equals("completed"))break;Thread.sleep(100);}
            assertEquals("completed",answer.path("status").asText(),answer.toString());
            assertEquals("false是布尔值。",answer.path("answer").asText());
            assertEquals("json",answer.path("stageId").asText());
            assertTrue(answer.path("contextManifest").asText().contains("课程片段"));
            var events=request(app,"GET","/tutor/requests/"+id+"/events?after=0",null);
            assertTrue(events.body().contains("event:state"),events.body());
            assertTrue(events.body().contains("false是布尔值"),events.body());
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null)).path("completedCount").asInt());
        }
        try(var app=start()) {assertEquals("false是布尔值。",ok(request(app,"GET","/tutor/requests/"+id,null)).path("answer").asText());}
    }
    @Test void tutorRejectsUnknownLessonsAndInvalidHelpBeforeUsingTheAccount() throws Exception {
        try(var app=start()) {
            var body=new LinkedHashMap<String,Object>(Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","json","level","concept","question","false是什么类型？","includeLesson",true,"idempotencyKey","tutor-validation"));
            body.put("stageId","unknown");
            assertEquals(404,request(app,"POST","/tutor/requests",body).statusCode());
            body.put("stageId","json");body.put("level","pretend-pass");
            assertEquals(400,request(app,"POST","/tutor/requests",body).statusCode());
            assertEquals(0,ok(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null)).path("completedCount").asInt());
        }
    }
}

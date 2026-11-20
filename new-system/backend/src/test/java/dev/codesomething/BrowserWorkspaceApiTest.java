package dev.codesomething;

import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BrowserWorkspaceApiTest extends CourseWorkspaceApiTest {
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_LOCAL_TESTS",matches="true")
    void websiteSubmissionRunsLocallyWithoutDockerAndMarksChangedSourceStale()throws Exception {
        try(var app=new org.springframework.boot.builder.SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0",
            "--cs.runner.enabled=true","--cs.runner.docker=missing-docker","--cs.runner.local-enabled=true",
            "--cs.data-directory="+directory.resolve("native-api"),"--cs.course-directory="+java.nio.file.Path.of("../course-packs").toAbsolutePath())) {
            var opened=ok(request(app,"POST","/browser-workspaces",openBody("fix-response")));
            String id=opened.path("id").asText(),token=opened.path("token").asText();
            String source=java.nio.file.Files.readString(java.nio.file.Path.of("../course-packs/http-json-basics/1.0.0/TaskServer.java"))
                .replace("\"completed\":\"false\"","\"completed\":false").replace("status = 200;\n                body","status = 404;\n                body");
            var saved=ok(authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",0,"files",Map.of("TaskServer.java",source)),token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",saved.path("digest").asText()),token));
            var job=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",submission.path("id").asText(),"idempotencyKey","native-api"),token));
            String route="/jobs/"+job.path("id").asText();long until=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
            while(java.util.Set.of("queued","running").contains(job.path("status").asText())&&System.nanoTime()<until){Thread.sleep(100);job=ok(authorized(app,"GET",route,null,token));}
            assertEquals("passed",job.path("status").asText(),job.toString());
            assertTrue(job.path("report").path("image").asText().startsWith("local-jdk:"));
            assertEquals(saved.path("digest").asText(),job.path("report").path("snapshotDigest").asText());
            ok(authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",1,"files",Map.of("TaskServer.java",source+"\n// changed")),token));
            assertTrue(ok(authorized(app,"GET",route,null,token)).path("stale").asBoolean());
        }
    }
    @Test void locallyCreatedBootProjectSubmitsAndSurvivesChapterChangesWithoutRewritingItsPom() throws Exception {
        try(var app=start()) {
            String clientKey="local-project-own-package-12345678901234567890";
            var opened=ok(request(app,"POST","/browser-workspaces",Map.of("courseId","boot-foundations","courseVersion","1.0.0","stageId","boot-start","clientKey",clientKey)));
            String token=opened.path("token").asText(),id=opened.path("id").asText();
            String pom=dev.codesomething.boot.BootProjectSnapshot.trustedPom().replace("boot-lab","my-own-project");
            var files=Map.of("pom.xml",pom,"src/main/java/com/example/demo/MyBootApplication.java","package com.example.demo; class MyBootApplication {}","src/main/resources/application.properties","spring.application.name=my-own-project");
            var saved=ok(authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",0,"files",files),token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",saved.path("digest").asText()),token));
            assertTrue(submission.path("source").asText().contains("com/example/demo/MyBootApplication.java"));
            var next=ok(request(app,"POST","/browser-workspaces",Map.of("courseId","boot-foundations","courseVersion","1.0.0","stageId","boot-jdbc","clientKey",clientKey)));
            assertEquals(pom,java.util.stream.StreamSupport.stream(next.path("files").spliterator(),false).filter(f->f.path("path").asText().equals("pom.xml")).findFirst().orElseThrow().path("content").asText());
            var restored=ok(authorized(app,"GET","/browser-workspaces/"+id,null,token));
            assertEquals(saved.path("digest").asText(),restored.path("digest").asText());
        }
    }
    @Test void newBootProjectStartsWithoutBusinessCodeAndKeepsLearnerImplementation() throws Exception {
        try(var app=start()) {
            var body=Map.of("courseId","boot-foundations","courseVersion","1.0.0","stageId","boot-start","clientKey","boot-minimal-key-12345678901234567890");
            var opened=ok(request(app,"POST","/browser-workspaces",body));
            assertEquals(2,opened.path("files").size(),"Only POM and Application are supplied; the learner writes the health endpoint");
            var files=new java.util.LinkedHashMap<String,String>();for(var f:opened.path("files"))files.put(f.path("path").asText(),f.path("content").asText());
            String health="package dev.codesomething.lab; public class HealthController { /* my first interface */ }";
            files.put("src/main/java/dev/codesomething/lab/HealthController.java",health);
            ok(authorized(app,"POST","/browser-workspaces/"+opened.path("id").asText()+"/draft",Map.of("expectedRevision",0,"files",files),opened.path("token").asText()));
            var restored=ok(request(app,"POST","/browser-workspaces",body));
            assertTrue(restored.path("files").toString().contains("my first interface"));
        }
    }
    @Test void chaptersContinueTheSameProjectAndRejectStaleWritesAcrossChapters() throws Exception {
        try(var app=start()) {
            var first=ok(request(app,"POST","/browser-workspaces",openBody("run-server")));
            String token=first.path("token").asText(),firstId=first.path("id").asText();
            String source="class TaskServer { String title = \"my-project\"; }";
            ok(authorized(app,"POST","/browser-workspaces/"+firstId+"/draft",Map.of("expectedRevision",0,"files",Map.of("TaskServer.java",source)),token));
            var next=ok(request(app,"POST","/browser-workspaces",openBody("fix-response")));
            assertEquals(source,next.path("files").get(0).path("content").asText());
            assertEquals(1,next.path("revision").asInt());
            String nextId=next.path("id").asText(),updated=source+"\n// next feature";
            ok(authorized(app,"POST","/browser-workspaces/"+nextId+"/draft",Map.of("expectedRevision",1,"files",Map.of("TaskServer.java",updated)),token));
            var back=ok(authorized(app,"GET","/browser-workspaces/"+firstId,null,token));
            assertEquals(updated,back.path("files").get(0).path("content").asText());
            assertEquals(409,authorized(app,"POST","/browser-workspaces/"+firstId+"/draft",Map.of("expectedRevision",1,"files",Map.of("TaskServer.java","lost")),token).statusCode());
            var other=ok(request(app,"POST","/browser-workspaces",Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","clientKey","another-project-key-12345678901234567890")));
            assertFalse(other.path("files").get(0).path("content").asText().contains("my-project"));
        }
    }
    Map<String,Object> openBody(String stage) {return Map.of("courseId","http-json-basics","courseVersion","1.1.0","stageId",stage,"clientKey","browser-test-key-12345678901234567890");}
    @Test void bootWorkspaceSupportsMultipleFilesAndRejectsChangedBuildConfiguration() throws Exception {
        try(var app=start()) {
            var opened=ok(request(app,"POST","/browser-workspaces",Map.of("courseId","boot-foundations","courseVersion","1.0.0","stageId","boot-start","clientKey","boot-browser-key-12345678901234567890")));
            String id=opened.path("id").asText(),token=opened.path("token").asText();
            var files=new java.util.LinkedHashMap<String,String>();for(var file:opened.path("files"))files.put(file.path("path").asText(),file.path("content").asText());
            files.put("src/main/java/dev/codesomething/lab/TaskService.java","package dev.codesomething.lab; public class TaskService {}");
            var saved=ok(authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",0,"files",files),token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",saved.path("digest").asText()),token));
            assertTrue(submission.path("source").asText().contains("TaskService.java"));
            files.put("pom.xml","<project>untrusted</project>");
            assertEquals(400,authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",1,"files",files),token).statusCode());
        }
    }
    @Test void draftRejectsUnauthorizedWritesAndStaleVersionsWithoutLosingCode() throws Exception {
        try(var app=start()) {
            var opened=ok(request(app,"POST","/browser-workspaces",openBody("fix-response")));
            String id=opened.path("id").asText(),token=opened.path("token").asText(),route="/browser-workspaces/"+id+"/draft";
            var body=Map.of("expectedRevision",0,"files",Map.of("TaskServer.java","class TaskServer {}"));
            assertEquals(401,request(app,"POST",route,body).statusCode());
            ok(authorized(app,"POST",route,body,token));
            assertEquals(409,authorized(app,"POST",route,Map.of("expectedRevision",0,"files",Map.of("TaskServer.java","LOST CODE")),token).statusCode());
            assertEquals(400,authorized(app,"POST",route,Map.of("expectedRevision",1,"files",Map.of("../secret.java","outside")),token).statusCode());
            var restored=ok(authorized(app,"GET","/browser-workspaces/"+id,null,token));
            assertEquals("class TaskServer {}",restored.path("files").get(0).path("content").asText());
        }
    }
    @Test void browserDraftSurvivesRestartAndSubmitsWithoutLocalDirectory() throws Exception {
        String id,token;
        try(var app=start()) {
            var opened=ok(request(app,"POST","/browser-workspaces",openBody("run-server")));
            id=opened.path("id").asText();token=opened.path("token").asText();
            assertTrue(opened.path("files").get(0).path("content").asText().contains("public static void main"));
            var saved=ok(authorized(app,"POST","/browser-workspaces/"+id+"/draft",Map.of("expectedRevision",0,"files",Map.of("TaskServer.java","class TaskServer {}")),token));
            assertEquals(1,saved.path("revision").asInt());
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",saved.path("digest").asText()),token));
            assertEquals("class TaskServer {}",submission.path("source").asText());
            var job=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",submission.path("id").asText(),"idempotencyKey","browser-check"),token));
            assertFalse(job.path("stale").asBoolean());
        }
        try(var app=start()) {
            var restored=ok(request(app,"POST","/browser-workspaces",openBody("run-server")));
            assertEquals(id,restored.path("id").asText());
            assertEquals("class TaskServer {}",restored.path("files").get(0).path("content").asText());
            assertFalse(restored.path("jobId").asText().isBlank());
        }
    }
}

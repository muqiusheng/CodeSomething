package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class CourseWorkspaceApiTest {
    @Test void ideLauncherReportsMissingConfigurationAndRejectsCrossSiteRequests() throws Exception {
        try(var app=new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory.resolve("launcher-data"),"--cs.ide.executable="+directory.resolve("missing-idea.exe"))) {
            var result=request(app,"POST","/local-ide/open",Map.of());
            assertEquals(503,result.statusCode(),result.body());
            assertTrue(result.body().contains("IDE_NOT_CONFIGURED"));
            var external=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/local-ide/open"))
                .header("Content-Type","application/json").header("Origin","https://untrusted.example")
                .POST(HttpRequest.BodyPublishers.ofString("{}")).build();
            assertEquals(403,client.send(external,HttpResponse.BodyHandlers.ofString()).statusCode());
        }
    }
    @Test void pairedReaderReturnsOnlyAllowedSourcesAndRejectsChangedDigest() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("reader"));
        Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        Files.writeString(workspace.resolve("secret.txt"),"private");
        try(var app=start()) {
            var binding=pair(app,workspace);String token=binding.path("token").asText();
            String route="/workspace-bindings/"+binding.path("id").asText()+"/sources";
            assertEquals(401,request(app,"GET",route,null).statusCode());
            var source=ok(authorized(app,"GET",route,null,token));
            assertEquals(1,source.path("files").size());
            assertEquals("class TaskServer {}",source.path("files").path("TaskServer.java").asText());
            String digest=source.path("digest").asText();
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {int changed;}");
            assertEquals(409,authorized(app,"GET",route+"?expectedDigest="+digest,null,token).statusCode());
            assertTrue(ok(authorized(app,"GET",route,null,token)).path("files").path("TaskServer.java").asText().contains("changed"));
        }
    }
    @Test void ideReportHandoffRequiresBindingAuthorizationAndIsSingleUse() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        try(var app=start()) {
            var binding=pair(app,workspace);String token=binding.path("token").asText(),id=binding.path("id").asText();
            var preview=ok(authorized(app,"GET","/workspace-bindings/"+id+"/preview",null,token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",id,"expectedDigest",preview.path("digest").asText()),token));
            var job=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",submission.path("id").asText(),"idempotencyKey","ide-check"),token));
            var body=Map.of("bindingId",id,"jobId",job.path("id").asText());
            assertEquals(401,request(app,"POST","/ide-handoffs",body).statusCode());
            var ticket=ok(authorized(app,"POST","/ide-handoffs",body,token));
            assertFalse(ticket.toString().contains(token));
            var received=ok(request(app,"POST","/ide-handoffs/consume",Map.of("code",ticket.path("code").asText())));
            assertEquals(token,received.path("binding").path("token").asText());
            assertEquals(job.path("id").asText(),received.path("jobId").asText());
            assertEquals("http-json-basics",received.path("courseId").asText());
            assertEquals(409,request(app,"POST","/ide-handoffs/consume",Map.of("code",ticket.path("code").asText())).statusCode());
        }
    }
    @TempDir Path directory;
    final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper json = JsonMapper.builder().build();
    ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0",
            "--cs.runner.enabled=false",
            "--cs.data-directory=" + directory.resolve("data"),
            "--cs.course-directory=" + Path.of("../course-packs").toAbsolutePath().normalize());
    }
    HttpResponse<String> request(ConfigurableApplicationContext app, String method, String route, Object body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + app.getEnvironment().getProperty("local.server.port") + "/api/v1" + route))
            .header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(HttpResponse<String> response) {
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }
    HttpResponse<String> authorized(ConfigurableApplicationContext app, String method, String route, Object body, String token) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1"+route))
            .header("Content-Type","application/json").header("Authorization","Bearer "+token)
            .method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return client.send(request.build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode pair(ConfigurableApplicationContext app, Path workspace) throws Exception {
        var preview=ok(request(app,"POST","/workspace-previews",Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.0.0","stageId","json-task-response")));
        return ok(request(app,"POST","/workspace-bindings",Map.of("previewId",preview.path("id").asText(),"pairingCode",preview.path("pairingCode").asText())));
    }
    @Test void publishedCourseProvidesRunnableStarterAndExplicitAcceptanceContract() throws Exception {
        try (var app = start()) {
            var stage = ok(request(app, "GET", "/courses/http-json-basics/versions/1.0.0/stages/json-task-response", null));
            assertEquals("published", stage.path("status").asText());
            assertEquals("TaskServer.java", stage.path("allowedFiles").get(0).asText());
            assertTrue(stage.path("teaching").get(0).path("body").asText().contains("请求"));
            assertTrue(stage.path("starter").asText().contains("public static void main"));
            assertEquals(4, stage.path("requirements").size());
            assertEquals(404, request(app, "GET", "/courses/http-json-basics/versions/9.9.9/stages/json-task-response", null).statusCode());
        }
    }
    @Test void directoryMustBePreviewedAndPairedBeforeASnapshotCanBeSaved() throws Exception {
        Path workspace = Files.createDirectory(directory.resolve("practice"));
        Files.writeString(workspace.resolve("TaskServer.java"), "class TaskServer {}");
        Files.writeString(workspace.resolve("secret.env"), "DO_NOT_READ");
        try (var app = start()) {
            var preview = ok(request(app, "POST", "/workspace-previews", Map.of("directory", workspace.toString(), "courseId", "http-json-basics", "courseVersion", "1.0.0", "stageId", "json-task-response")));
            assertEquals(1, preview.path("files").size());
            assertEquals("TaskServer.java", preview.path("files").get(0).path("path").asText());
            assertFalse(preview.toString().contains("DO_NOT_READ"));
            assertEquals(403, request(app, "POST", "/workspace-bindings", Map.of("previewId", preview.path("id").asText(), "pairingCode", "wrong")).statusCode());
            var binding = ok(request(app, "POST", "/workspace-bindings", Map.of("previewId", preview.path("id").asText(), "pairingCode", preview.path("pairingCode").asText())));
            assertFalse(binding.path("token").asText().isBlank());
            assertEquals(401, request(app, "GET", "/workspace-bindings/" + binding.path("id").asText()+"/preview", null).statusCode());
        }
    }
    @Test void savedSnapshotSurvivesEditsAndRestartAndRejectsAStalePreview() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));
        Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        String token, bindingId, submissionId;
        try(var app=start()) {
            var binding=pair(app,workspace);token=binding.path("token").asText();bindingId=binding.path("id").asText();
            var preview=ok(authorized(app,"GET","/workspace-bindings/"+bindingId+"/preview",null,token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",bindingId,"expectedDigest",preview.path("digest").asText()),token));
            submissionId=submission.path("id").asText();
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { int changed; }");
            assertEquals(409,authorized(app,"POST","/submissions",Map.of("bindingId",bindingId,"expectedDigest",preview.path("digest").asText()),token).statusCode());
            assertEquals(401,request(app,"GET","/submissions/"+submissionId,null).statusCode());
        }
        try(var app=start()) {
            var saved=ok(authorized(app,"GET","/submissions/"+submissionId,null,token));
            assertEquals("class TaskServer {}",saved.path("source").asText());
            assertEquals("1.0.0",saved.path("courseVersion").asText());
            assertEquals(bindingId,saved.path("bindingId").asText());
        }
    }
    @Test void repeatedCheckRequestReturnsTheSameJobAfterRestartAndKeyCannotBeReusedForDifferentCode() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        String token, firstId, jobId;
        try(var app=start()) {
            var binding=pair(app,workspace);token=binding.path("token").asText();String bindingId=binding.path("id").asText();
            var preview=ok(authorized(app,"GET","/workspace-bindings/"+bindingId+"/preview",null,token));
            var first=ok(authorized(app,"POST","/submissions",Map.of("bindingId",bindingId,"expectedDigest",preview.path("digest").asText()),token));firstId=first.path("id").asText();
            var job=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",firstId,"idempotencyKey","attempt-1"),token));jobId=job.path("id").asText();
            assertEquals("awaiting_runner",job.path("status").asText());
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { int changed; }");
            var fresh=ok(authorized(app,"GET","/workspace-bindings/"+bindingId+"/preview",null,token));
            var second=ok(authorized(app,"POST","/submissions",Map.of("bindingId",bindingId,"expectedDigest",fresh.path("digest").asText()),token));
            assertEquals(409,authorized(app,"POST","/check-jobs",Map.of("submissionId",second.path("id").asText(),"idempotencyKey","attempt-1"),token).statusCode());
        }
        try(var app=start()) {
            var repeated=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",firstId,"idempotencyKey","attempt-1"),token));assertEquals(jobId,repeated.path("id").asText());
            assertEquals(jobId,ok(authorized(app,"GET","/jobs/"+jobId,null,token)).path("id").asText());
        }
    }
    @Test void anExternalWebsiteCannotPreviewALocalDirectory() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        try(var app=start()) {
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/workspace-previews"))
                .header("Content-Type","application/json").header("Origin","https://untrusted.example")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.0.0","stageId","json-task-response")))).build();
            var rejected=client.send(request,HttpResponse.BodyHandlers.ofString());
            assertEquals(403,rejected.statusCode(),rejected.body());assertTrue(rejected.body().contains("ORIGIN_REJECTED"));
        }
    }
    @Test void changedPairingPreviewCannotAuthorizeDifferentBytesAndPairingCodeIsSingleUse() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        try(var app=start()) {
            var preview=ok(request(app,"POST","/workspace-previews",Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.0.0","stageId","json-task-response")));
            var body=Map.of("previewId",preview.path("id").asText(),"pairingCode",preview.path("pairingCode").asText());
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { int changed; }");
            assertEquals(409,request(app,"POST","/workspace-bindings",body).statusCode());
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
            ok(request(app,"POST","/workspace-bindings",body));
            assertEquals(409,request(app,"POST","/workspace-bindings",body).statusCode());
        }
    }
    @Test void scopeRejectsMissingSourceAndOversizedSource() throws Exception {
        Path workspace=Files.createDirectory(directory.resolve("practice"));
        try(var app=start()) {
            var body=Map.of("directory",workspace.toString(),"courseId","http-json-basics","courseVersion","1.0.0","stageId","json-task-response");
            assertEquals(400,request(app,"POST","/workspace-previews",body).statusCode());
            Files.writeString(workspace.resolve("TaskServer.java"),"a".repeat(65537));
            assertEquals(400,request(app,"POST","/workspace-previews",body).statusCode());
        }
    }
    @Test void foundationsProjectHasEightOrderedChaptersAndPreservesTheOriginalCourseVersion() throws Exception {
        try(var app=start()) {
            var project=ok(request(app,"GET","/courses/http-json-basics/versions/1.1.0",null));
            assertEquals("后端入门实验室",project.path("title").asText());
            assertEquals(8,project.path("chapters").size());
            assertEquals("workspace",project.path("chapters").get(0).path("stageId").asText());
            assertEquals("transfer",project.path("chapters").get(7).path("stageId").asText());
            var chapter=ok(request(app,"GET","/courses/http-json-basics/versions/1.1.0/stages/fix-response",null));
            assertEquals("fix-response",chapter.path("stageId").asText());
            assertTrue(chapter.path("concepts").size()>=2);
            assertEquals(404,request(app,"GET","/courses/http-json-basics/versions/1.1.0/stages/not-published",null).statusCode());
            assertEquals("1.0.0",ok(request(app,"GET","/courses/http-json-basics/versions/1.0.0/stages/json-task-response",null)).path("courseVersion").asText());
        }
    }
}

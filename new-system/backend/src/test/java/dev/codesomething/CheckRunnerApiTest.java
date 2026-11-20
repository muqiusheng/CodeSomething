package dev.codesomething;

import java.nio.file.*;
import java.net.URI;
import java.net.http.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import static org.junit.jupiter.api.Assertions.*;

class CheckRunnerApiTest {
    @TempDir Path directory;
    final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper json = JsonMapper.builder().build();

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

    org.springframework.context.ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0",
            "--cs.data-directory="+directory.resolve("data"),
            "--cs.course-directory="+Path.of("../course-packs").toAbsolutePath().normalize(),
            "--cs.runner.enabled=true", "--cs.runner.local-enabled=false", "--cs.runner.docker=missing-docker-for-test");
    }
    @Test void unavailableRunnerReturnsAnEnvironmentReportBoundToTheSnapshot() throws Exception {
        var workspace=Files.createDirectory(directory.resolve("runner-practice"));
        Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer {}");
        String savedId,savedToken;
        try(var app=start()) {
            var binding=pair(app,workspace);String token=binding.path("token").asText();
            var preview=ok(authorized(app,"GET","/workspace-bindings/"+binding.path("id").asText()+"/preview",null,token));
            var submission=ok(authorized(app,"POST","/submissions",Map.of("bindingId",binding.path("id").asText(),"expectedDigest",preview.path("digest").asText()),token));
            var job=ok(authorized(app,"POST","/check-jobs",Map.of("submissionId",submission.path("id").asText(),"idempotencyKey","runner-check"),token));
            for(int i=0;i<100 && !job.path("status").asText().equals("environment_error");i++) {
                Thread.sleep(100);job=ok(authorized(app,"GET","/jobs/"+job.path("id").asText(),null,token));
            }
            assertEquals("environment_error",job.path("status").asText());
            assertEquals("failed",job.path("progress").path("phase").asText());
            assertEquals(5,job.path("progress").path("total").asInt());
            assertEquals(submission.path("digest").asText(),job.path("report").path("snapshotDigest").asText());
            assertFalse(job.path("report").path("functionalPassed").asBoolean());
            assertEquals(401,request(app,"POST","/jobs/"+job.path("id").asText()+"/cancel",Map.of()).statusCode());
            savedId=job.path("id").asText();savedToken=token;
            Files.writeString(workspace.resolve("TaskServer.java"),"class TaskServer { int changed; }");
            var changed=ok(authorized(app,"GET","/jobs/"+savedId,null,token));
            assertTrue(changed.path("stale").asBoolean());assertEquals("changed",changed.path("freshness").asText());
            Files.delete(workspace.resolve("TaskServer.java"));
            assertEquals("unknown",ok(authorized(app,"GET","/jobs/"+savedId,null,token)).path("freshness").asText());
        }
        try(var app=start()) {
            var restored=ok(authorized(app,"GET","/jobs/"+savedId,null,savedToken));
            assertEquals("environment_error",restored.path("status").asText());
            assertFalse(restored.path("report").path("functionalPassed").asBoolean());
        }
    }
}


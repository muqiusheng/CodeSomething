package dev.codesomething;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import static org.junit.jupiter.api.Assertions.*;

class BootCourseApiTest {
    @TempDir Path data;
    @Test void bootAndProjectACoursesArePublishedWithTenRealStagesAndUnknownVersionsAreRejected() throws Exception {
        try(var app=new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.data-directory="+data,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath(),"--cs.runner.enabled=false")) {
            var http=HttpClient.newHttpClient();
            for(var entry:java.util.Map.of("boot-foundations",4,"task-manager",6).entrySet()) {
                String base="http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/courses/"+entry.getKey()+"/versions/";
                var response=http.send(HttpRequest.newBuilder(URI.create(base+"1.0.0")).build(),HttpResponse.BodyHandlers.ofString());
                assertEquals(200,response.statusCode(),response.body());
                var course=tools.jackson.databind.json.JsonMapper.builder().build().readTree(response.body());
                assertEquals(entry.getValue(),course.path("chapters").size());
                assertFalse(response.body().contains("formalAnswer"));
                assertEquals(404,http.send(HttpRequest.newBuilder(URI.create(base+"99.0.0")).build(),HttpResponse.BodyHandlers.ofString()).statusCode());
            }
        }
    }
    @Test void multiFileBindingRequiresAuthorizationAndCannotCompleteWithoutAFunctionalReport() throws Exception {
        try(var app=new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.data-directory="+data,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath(),"--cs.runner.enabled=false")) {
            var http=HttpClient.newHttpClient();var json=tools.jackson.databind.json.JsonMapper.builder().build();
            String base="http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1";
            var workspace=Path.of("../course-packs/boot-foundations/1.0.0/boot-start/reference").toAbsolutePath().normalize();
            java.util.function.BiFunction<String,Object,HttpRequest> post=(route,body)->HttpRequest.newBuilder(URI.create(base+route)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
            var preview=http.send(post.apply("/workspace-previews",java.util.Map.of("directory",workspace.toString(),"courseId","boot-foundations","courseVersion","1.0.0","stageId","boot-start")),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,preview.statusCode(),preview.body());var p=json.readTree(preview.body());assertEquals(3,p.path("files").size());
            var pair=http.send(post.apply("/workspace-bindings",java.util.Map.of("previewId",p.path("id").asText(),"pairingCode",p.path("pairingCode").asText())),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,pair.statusCode(),pair.body());var b=json.readTree(pair.body());
            var unauthorized=http.send(post.apply("/submissions",java.util.Map.of("bindingId",b.path("id").asText(),"expectedDigest",p.path("digest").asText())),HttpResponse.BodyHandlers.ofString());assertEquals(401,unauthorized.statusCode());
            var req=HttpRequest.newBuilder(URI.create(base+"/submissions")).header("Content-Type","application/json").header("Authorization","Bearer "+b.path("token").asText()).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(java.util.Map.of("bindingId",b.path("id").asText(),"expectedDigest",p.path("digest").asText())))).build();
            var saved=http.send(req,HttpResponse.BodyHandlers.ofString());assertEquals(200,saved.statusCode(),saved.body());
            assertTrue(json.readTree(saved.body()).path("source").asText().contains("HealthController.java"));
            var progress=http.send(HttpRequest.newBuilder(URI.create(base+"/learning/progress/boot-foundations/1.0.0")).build(),HttpResponse.BodyHandlers.ofString());assertEquals(0,json.readTree(progress.body()).path("completedCount").asInt());
        }
    }
}

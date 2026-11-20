package dev.codesomething;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import static org.junit.jupiter.api.Assertions.*;

class PlatformApiTest {
    @TempDir Path dataDirectory;
    private final HttpClient client = HttpClient.newHttpClient();

    private ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(CodeSomethingApplication.class)
            .run("--server.port=0", "--cs.data-directory=" + dataDirectory.toAbsolutePath());
    }

    private HttpResponse<String> request(ConfigurableApplicationContext app, String method, String route, String body) throws Exception {
        int port = Integer.parseInt(app.getEnvironment().getProperty("local.server.port"));
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + route))
            .header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test void staleSessionWriteCannotOverwriteTheSavedLearningPosition() throws Exception {
        String first = """
            {"courseId":"http-json-basics","courseVersion":"1.0.0","stageId":"json-task-response","step":"teaching","expectedRevision":0}
            """;
        try (var app = start()) {
            var saved = request(app, "PUT", "/learning/sessions/local", first);
            assertEquals(200, saved.statusCode(), saved.body());
            var next = request(app, "PUT", "/learning/sessions/local", first.replace("teaching", "task").replace(":0", ":1"));
            assertEquals(200, next.statusCode(), next.body());
            var stale = request(app, "PUT", "/learning/sessions/local", first);
            assertEquals(409, stale.statusCode(), stale.body());
            assertTrue(stale.body().contains("\"code\":\"VERSION_CONFLICT\""), stale.body());
        }
        try (var restarted = start()) {
            var restored = request(restarted, "GET", "/learning/continue", null);
            assertEquals(200, restored.statusCode(), restored.body());
            assertTrue(restored.body().contains("\"step\":\"task\""), restored.body());
            assertTrue(restored.body().contains("\"revision\":2"), restored.body());
        }
    }

    @Test void invalidPreferenceDoesNotReplaceSavedValues() throws Exception {
        try (var app = start()) {
            var rejected = request(app, "PATCH", "/profiles/me/preferences", "{\"dailyMinutes\":31}");
            assertEquals(400, rejected.statusCode(), rejected.body());
            assertTrue(rejected.body().contains("\"code\":\"INVALID_REQUEST\""), rejected.body());
            assertTrue(rejected.body().contains("\"requestId\":"), rejected.body());
            var current = request(app, "GET", "/profiles/me/preferences", null);
            assertTrue(current.body().contains("\"dailyMinutes\":60"), current.body());
        }
    }

    @Test void savedPreferencesSurviveAServiceRestart() throws Exception {
        try (var app = start()) {
            var saved = request(app, "PATCH", "/profiles/me/preferences", "{\"dailyMinutes\":30,\"motion\":\"reduce\"}");
            assertEquals(200, saved.statusCode(), saved.body());
        }
        try (var restarted = start()) {
            var restored = request(restarted, "GET", "/profiles/me/preferences", null);
            assertEquals(200, restored.statusCode(), restored.body());
            assertTrue(restored.body().contains("\"dailyMinutes\":30"), restored.body());
            assertTrue(restored.body().contains("\"motion\":\"reduce\""), restored.body());
        }
    }
}

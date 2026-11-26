package dev.codesomething.workspaces;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;
import com.sun.net.httpserver.HttpServer;
import tools.jackson.databind.json.JsonMapper;

/** Receives work only when the process is invoked to check for a pending job. */
public final class RemoteJavaWorker {
    private final URI origin;
    private final String token;
    private final String portToken;
    private final DockerCheckRunner runner;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final JsonMapper json = JsonMapper.builder().build();

    RemoteJavaWorker(URI origin, String token, String portToken, DockerCheckRunner runner) {
        this.origin = origin;
        this.token = token;
        this.portToken = portToken;
        this.runner = runner;
    }

    public static void run(Map<String, String> env) throws IOException, InterruptedException {
        configured(env).runOne();
    }

    private static RemoteJavaWorker configured(Map<String, String> env) {
        URI origin = URI.create(required(env, "CS_REMOTE_JAVA_MAIN_URL"));
        if (!"https".equals(origin.getScheme()) || origin.getHost() == null || origin.getUserInfo() != null
            || origin.getRawQuery() != null || origin.getFragment() != null)
            throw new IllegalArgumentException("A private HTTPS origin is required");
        var runner = new DockerCheckRunner(env.getOrDefault("CS_DOCKER_BIN", "docker"),
            required(env, "CS_REMOTE_JAVA_DATA_DIR"), 30);
        return new RemoteJavaWorker(origin, required(env, "CS_REMOTE_JAVA_TOKEN"),
            required(env, "CS_REMOTE_JAVA_PORT_TOKEN"), runner);
    }

    public static void serve(Map<String, String> env) throws IOException {
        var worker = configured(env);
        String key = required(env, "CS_REMOTE_JAVA_WAKE_TOKEN");
        if (key.length() < 32) throw new IllegalArgumentException("A private wake token is required");
        byte[] expected = ("Bearer " + key).getBytes(StandardCharsets.UTF_8);
        var active = new AtomicBoolean();
        int port = Integer.parseInt(required(env, "CS_REMOTE_JAVA_WAKE_PORT"));
        var listener = HttpServer.create(new InetSocketAddress(port), 8);
        listener.createContext("/java-judge/wake", exchange -> {
            try (exchange) {
                String authorization = exchange.getRequestHeaders().getFirst("Authorization");
                if (!"POST".equals(exchange.getRequestMethod()) || !"/java-judge/wake".equals(exchange.getRequestURI().getPath())
                    || authorization == null || !MessageDigest.isEqual(expected, authorization.getBytes(StandardCharsets.UTF_8))) {
                    exchange.sendResponseHeaders(404, -1);
                    return;
                }
                exchange.sendResponseHeaders(202, -1);
                if (!active.compareAndSet(false, true)) return;
                Thread.ofVirtual().start(() -> {
                    try {
                        for (int completed = 0; completed < 4 && worker.runOne(); completed++) {
                            // Examine the next job only while responding to a real submission.
                        }
                    } catch (IOException failure) {
                        System.err.println("Java executor could not complete its current job");
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    } finally {
                        active.set(false);
                    }
                });
            }
        });
        listener.start();
    }

    boolean runOne() throws IOException, InterruptedException {
        var response = post("/claim", "{}");
        if (response.statusCode() == 204) return false;
        if (response.statusCode() != 200) throw new IOException("Java claim returned HTTP " + response.statusCode());
        var claim = json.readValue(response.body(), RemoteJavaJobs.Claim.class);
        byte[] source = claim.source().getBytes(StandardCharsets.UTF_8);
        if (!claim.digest().equals(WorkspaceController.hash(source)) || claim.policy() == null
            || !Objects.equals(claim.policy(), RemoteJavaJobs.policy("http-json-basics", claim.version(), claim.stage())))
            throw new IOException("Claim did not match the original Java snapshot");
        var outcome = runner.run(claim.id(), source, claim.digest(), claim.version(), claim.stage(),
            claim.policy(), Thread.currentThread()::isInterrupted);
        if ("environment_error".equals(outcome.status()) || "cancelled".equals(outcome.status()))
            throw new IOException("Execution infrastructure did not produce a grade");
        String route = "/" + claim.id() + "/result";
        String result = json.writeValueAsString(new RemoteJavaJobs.Result(
            claim.owner(), claim.lease(), outcome.status(), outcome.report()));
        try {
            response = post(route, result);
        } catch (IOException disconnected) {
            response = post(route, result);
        }
        if (response.statusCode() != 204 && response.statusCode() != 409)
            throw new IOException("Java result returned HTTP " + response.statusCode());
        return response.statusCode() == 204;
    }

    private HttpResponse<String> post(String route, String body) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(origin.resolve("/api/v1/internal/java-judge" + route))
            .header("Authorization", "Bearer " + token)
            .header("Cookie", "__Host-instabox_port_auth=" + portToken)
            .header("Content-Type", "application/json")
            .timeout(Duration.ofSeconds(10))
            .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static String required(Map<String, String> env, String name) {
        String value = env.get(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name);
        return value;
    }
}

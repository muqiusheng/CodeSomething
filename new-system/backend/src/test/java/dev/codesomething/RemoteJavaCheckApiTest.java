package dev.codesomething;

import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import dev.codesomething.workspaces.DockerCheckRunner;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.assertEquals;

class RemoteJavaCheckApiTest extends CourseWorkspaceApiTest {
    @Test void thePrivateWorkerCredentialIsCheckedByTheJudgeInPublicMode() throws Exception {
        String workerToken = "test-fixture-remote-java-token-123456789";
        byte[] signingKey = new byte[32];
        new java.security.SecureRandom().nextBytes(signingKey);
        try (var app = new SpringApplicationBuilder(CodeSomethingApplication.class).run(
                "--server.port=0", "--cs.data-directory=" + directory.resolve("public-judge"),
                "--cs.course-directory=" + Path.of("../course-packs").toAbsolutePath(),
                "--cs.public=true", "--cs.runner.mode=docker_only", "--cs.runner.enabled=false",
                "--cs.auth.initial-password=Fixture-only-password-123456789",
                "--cs.auth.jwt-secret=" + java.util.Base64.getEncoder().encodeToString(signingKey),
                "--CS_REMOTE_JAVA_TOKEN=" + workerToken, "--CS_REMOTE_JAVA_TEST_OWNER=admin",
                "--CS_REMOTE_JAVA_UTC_WINDOWS=0-1440")) {
            String route = "/internal/java-judge/claim";
            assertEquals(404, authorized(app, "POST", route, Map.of(), "wrong-private-credential").statusCode());
            assertEquals(204, authorized(app, "POST", route, Map.of(), workerToken).statusCode());
        }
    }

    @Test void aDisconnectedWorkerLosesItsLeaseAndOneSubmissionKeepsOneResult() throws Exception {
        String workerToken = "test-fixture-remote-java-token-123456789";
        String queue = "/internal/java-judge";
        String source = "class TaskServer { public static void main(String[] args) { System.out.println(42); } }";
        try (var app = new SpringApplicationBuilder(CodeSomethingApplication.class).run(
                "--server.port=0", "--cs.data-directory=" + directory.resolve("java-queue"),
                "--cs.course-directory=" + Path.of("../course-packs").toAbsolutePath(),
                "--cs.runner.local-enabled=false", "--cs.runner.docker=missing-docker-for-test",
                "--CS_REMOTE_JAVA_TOKEN=" + workerToken, "--CS_REMOTE_JAVA_UTC_WINDOWS=0-1440")) {
            var workspace = ok(request(app, "POST", "/browser-workspaces", Map.of(
                "courseId", "http-json-basics", "courseVersion", "1.1.0", "stageId", "workspace",
                "clientKey", "remote-java-queue-fixture-1234567890")));
            String binding = workspace.path("id").asText(), token = workspace.path("token").asText();
            var draft = ok(authorized(app, "POST", "/browser-workspaces/" + binding + "/draft", Map.of(
                "expectedRevision", 0, "files", Map.of("TaskServer.java", source)), token));
            var snapshot = ok(authorized(app, "POST", "/submissions", Map.of(
                "bindingId", binding, "expectedDigest", draft.path("digest").asText()), token));
            String submission = snapshot.path("id").asText();
            var job = ok(authorized(app, "POST", "/check-jobs",
                Map.of("submissionId", submission, "idempotencyKey", "first"), token));
            var repeated = ok(authorized(app, "POST", "/check-jobs",
                Map.of("submissionId", submission, "idempotencyKey", "retry"), token));
            assertEquals(job.path("id"), repeated.path("id"));
            assertEquals(404, request(app, "POST", queue + "/claim", Map.of()).statusCode());

            var first = ok(authorized(app, "POST", queue + "/claim", Map.of(), workerToken));
            assertEquals(source, first.path("source").asText());
            assertEquals(204, authorized(app, "POST", queue + "/claim", Map.of(), workerToken).statusCode());
            app.getBean(JdbcTemplate.class).update("UPDATE check_jobs SET remote_until=0 WHERE id=?",
                job.path("id").asText());
            var next = ok(authorized(app, "POST", queue + "/claim", Map.of(), workerToken));
            var report = Map.of("snapshotDigest", snapshot.path("digest").asText(),
                "courseVersion", "1.1.0", "stageId", "workspace", "policy", "console-output-v1",
                "image", "test-image", "harnessDigest", "", "functionalPassed", true,
                "assertions", new Object[0], "log", "", "finishedAt", "2026-11-26T04:00:00Z");
            Object finalReport = report;
            if ("true".equals(System.getenv("CS_RUN_DOCKER_TESTS"))) {
                var runner = new DockerCheckRunner("docker", directory.resolve("java-executor").toString(), 30);
                var passed = runner.run(job.path("id").asText(), source.getBytes(StandardCharsets.UTF_8),
                    snapshot.path("digest").asText(), "1.1.0", "workspace", "console-output-v1", () -> false);
                assertEquals("passed", passed.status(), passed.report().toString());
                finalReport = passed.report();
            }
            String finish = queue + "/" + job.path("id").asText() + "/result";
            assertEquals(409, authorized(app, "POST", finish, Map.of("owner", first.path("owner").asText(),
                "lease", first.path("lease").asText(), "status", "passed", "report", report), workerToken).statusCode());
            var result = Map.of("owner", next.path("owner").asText(), "lease", next.path("lease").asText(),
                "status", "passed", "report", finalReport);
            assertEquals(204, authorized(app, "POST", finish, result, workerToken).statusCode());
            assertEquals(204, authorized(app, "POST", finish, result, workerToken).statusCode());
            var history = ok(authorized(app, "GET", "/submissions/" + submission + "/jobs", null, token));
            assertEquals(1, history.size());
            assertEquals("passed", history.get(0).path("status").asText());
        }
    }
}

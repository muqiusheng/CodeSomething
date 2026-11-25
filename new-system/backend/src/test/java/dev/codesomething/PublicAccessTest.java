package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class PublicAccessTest {
    @TempDir Path data;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    private final String signingKey = newSigningKey();

    private static String newSigningKey() {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        return java.util.Base64.getEncoder().encodeToString(key);
    }

    ConfigurableApplicationContext start(String... extra) {
        var args=new java.util.ArrayList<>(java.util.List.of("--server.port=0", "--cs.data-directory=" + data, "--cs.runner.enabled=false",
                "--cs.public=true", "--cs.runner.mode=docker_only", "--cs.auth.require-invite=true",
                "--cs.course-directory=" + Path.of("../course-packs").toAbsolutePath(),
                "--cs.auth.initial-password=Initial-Admin-Password-92",
                "--cs.auth.jwt-secret=" + signingKey));
        for (String option : extra) {
            String key=option.split("=",2)[0]+"=";
            args.removeIf(existing->existing.startsWith(key));
            args.add(option);
        }
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run(args.toArray(String[]::new));
    }

    @Test void publicStartupRejectsAnObviouslyWeakSigningKey() {
        String weakKey = java.util.Base64.getEncoder().encodeToString(new byte[32]);
        var failure = assertThrows(RuntimeException.class, () -> {
            try (var ignored = start("--cs.auth.jwt-secret=" + weakKey)) { }
        });
        while (failure.getCause() instanceof RuntimeException cause) failure = cause;
        assertTrue(failure.getMessage().contains("CS_JWT_SECRET"), failure::toString);
    }

    @Test void labGradingPreservesDraftWhenMysqlIsUnavailableAndDoesNotExposeRules() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String first = token(register(app, "lab-grade-one", invite(app, admin)));
            String second = token(register(app, "lab-grade-two", invite(app, admin)));
            String lab = "/api/school/courses/database-systems/labs/lab-03-single-query";
            String input = """
                {"revision":0,"questionId":"q02","drafts":{"q02":"SELECT Sno FROM student;"}}
                """;
            var details = json.readTree(request(app, "GET", lab, null, first, null).body());
            assertTrue(details.path("grading").asBoolean());
            String debug = lab + "/questions/q02/debug";
            String trace = """
                {"sql":"SELECT Sno FROM student;","mode":"trace","offset":0}
                """;
            assertEquals(401, request(app, "POST", debug, trace, null, null).statusCode());
            assertEquals(403, request(app, "POST", debug, trace, admin, null).statusCode());
            var debugResponse = request(app, "POST", debug, trace, first, null);
            assertEquals(200, debugResponse.statusCode(), debugResponse.body());
            assertEquals("environment_error", json.readTree(debugResponse.body()).path("status").asText());
            assertEquals(0, json.readTree(request(app, "GET", lab, null, first, null).body()).path("work").path("revision").asInt());
            assertFalse(details.path("lab").path("questions").get(1).has("checks"));
            var response = request(app, "POST", lab + "/grade", input, first, null);
            assertEquals(200, response.statusCode(), response.body());
            var execution = json.readTree(response.body()).path("work").path("executions").path("q02");
            assertEquals("unavailable", execution.path("grade").path("status").asText());
            assertEquals("SELECT Sno FROM student;", execution.path("sql").asText());
            assertTrue(execution.path("grade").path("referenceSql").isNull());
            assertEquals(409, request(app, "POST", lab + "/grade", input, first, null).statusCode());
            assertEquals(0, json.readTree(request(app, "GET", lab, null, second, null).body()).path("work").path("revision").asInt());
        }
    }

    @Test void schoolExamKeepsDraftsReportsAndMistakesInsideTheLearnerScope() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String first = token(register(app, "exam-student-one", invite(app, admin)));
            String second = token(register(app, "exam-student-two", invite(app, admin)));
            String root = "/api/school/courses/database-systems/exams";
            String paper = root + "/exam-lab-01";
            assertEquals(401, request(app, "GET", root, null, null, null).statusCode());
            String activity = "/api/school/courses/database-systems/environment/activity";
            assertEquals(401, request(app, "POST", activity, null, null, null).statusCode());
            assertEquals(204, request(app, "POST", activity, null, first, null).statusCode());
            assertEquals(403, request(app, "GET", root, null, admin, null).statusCode());
            var start = request(app, "POST", paper + "/start", """
                {"mode":"exam","minutes":90,"shuffle":true}
                """, first, null);
            assertEquals(200, start.statusCode(), start.body());
            var draft = json.readTree(start.body());
            String id = draft.path("draft").path("id").asText();
            String work = paper + "/drafts/" + id;
            String report = paper + "/attempts/" + id;
            String choice = "exam-lab-01-r3-q01", fill = "exam-lab-01-r3-q20", sql = "exam-lab-01-r3-q21";
            assertEquals(4, draft.path("draft").path("order").path(choice).size());
            assertFalse(draft.path("questions").get(0).has("answer"));
            assertFalse(draft.path("questions").get(20).has("referenceSql"));
            String examSolution = work + "/questions/" + choice + "/solution";
            String shortExamSolution = examSolution.replace("/school/courses/", "/school/");
            assertEquals(403, request(app, "GET", examSolution, null, first, null).statusCode());
            assertEquals(403, request(app, "GET", shortExamSolution, null, first, null).statusCode());
            assertEquals(404, request(app, "GET", examSolution, null, second, null).statusCode());
            String labSolution = "/api/school/database-systems/labs/lab-03-single-query/questions/q01/solution";
            assertEquals(401, request(app, "GET", labSolution, null, null, null).statusCode());
            var labReference = request(app, "GET", labSolution, null, first, null);
            assertEquals(200, labReference.statusCode(), labReference.body());
            assertEquals("SELECT * FROM student;", json.readTree(labReference.body()).path("referenceSql").asText());
            assertFalse(json.readTree(labReference.body()).path("explanation").asText().isBlank());
            assertEquals(404, request(app, "GET", work, null, second, null).statusCode());
            assertEquals(400, request(app, "POST", work + "/questions/" + choice + "/check",
                "{\"answer\":[\"A\"],\"mode\":\"check\",\"offset\":0}", first, null).statusCode());
            var values = java.util.Map.of(choice, java.util.List.of("A"), fill, java.util.List.of("mat_num", "oops"),
                sql, java.util.List.of("SELECT 1;"));
            String save = json.writeValueAsString(java.util.Map.of("revision", 0, "answers", values, "stars", java.util.List.of(choice)));
            var saved = request(app, "POST", work + "/save", save, first, null);
            assertEquals(200, saved.statusCode(), saved.body());
            assertEquals(409, request(app, "POST", work + "/save", save, first, null).statusCode());
            var restored = json.readTree(request(app, "GET", work, null, first, null).body());
            assertEquals(choice, restored.path("draft").path("stars").get(0).asText());
            String submit = json.writeValueAsString(java.util.Map.of("revision", 1, "answers", values, "stars", java.util.List.of(choice)));
            var submitted = request(app, "POST", work + "/submit", submit, first, null);
            assertEquals(200, submitted.statusCode(), submitted.body());
            var snapshot = json.readTree(submitted.body());
            assertEquals(2, snapshot.path("summary").path("scores").path("blank").asInt());
            assertFalse(snapshot.path("summary").path("completeGrading").asBoolean());
            assertEquals("unavailable", snapshot.path("items").get(20).path("status").asText());
            assertEquals(draft.path("questions").get(0).path("options"), snapshot.path("items").get(0).path("question").path("options"));
            assertEquals(404, request(app, "GET", report, null, second, null).statusCode());
            assertEquals(snapshot, json.readTree(request(app, "POST", work + "/submit", submit, first, null).body()));
            assertEquals(0, json.readTree(request(app, "GET", root + "/mistakes", null, second, null).body()).size());
            String mistake = root + "/mistakes/" + fill;
            var corrected = request(app, "POST", mistake + "/check",
                "{\"answer\":[\"mat_num\",\"Stock(mat_num)\"],\"mode\":\"check\",\"offset\":0}", first, null);
            assertEquals(200, corrected.statusCode(), corrected.body());
            assertEquals(4, json.readTree(corrected.body()).path("score").asInt());
            assertTrue(json.readTree(request(app, "GET", root + "/mistakes", null, first, null).body()).valueStream()
                .filter(node -> fill.equals(node.path("item").path("question").path("id").asText())).findFirst().orElseThrow().path("mastered").asBoolean());
            var subset = request(app, "POST", paper + "/start",
                json.writeValueAsString(java.util.Map.of("mode","practice","minutes",0,"shuffle",false,"fromAttempt",id)), first, null);
            assertEquals(200, subset.statusCode(), subset.body());
            String retryId = json.readTree(subset.body()).path("draft").path("id").asText();
            assertNotEquals(id, retryId);
            assertEquals(200, request(app, "GET", report, null, first, null).statusCode());
            assertEquals(200, request(app, "POST", paper + "/drafts/" + retryId + "/submit", """
                {"revision":0,"answers":{"exam-lab-01-r3-q01":["B"]},"stars":[]}
                """, first, null).statusCode());
            var blankRetry = request(app, "POST", paper + "/start", """
                {"mode":"practice","minutes":0,"shuffle":false}
                """, first, null);
            assertEquals(200, blankRetry.statusCode(), blankRetry.body());
            String blankId = json.readTree(blankRetry.body()).path("draft").path("id").asText();
            String practiceSolution = paper + "/drafts/" + blankId + "/questions/" + sql + "/solution";
            var reference = request(app, "GET", practiceSolution, null, first, null);
            assertEquals(200, reference.statusCode(), reference.body());
            assertFalse(json.readTree(reference.body()).path("referenceSql").asText().isBlank());
            assertEquals(200, request(app, "GET", shortExamSolution, null, first, null).statusCode());
            assertEquals(200, request(app, "POST", paper + "/drafts/" + blankId + "/submit", """
                {"revision":0,"answers":{},"stars":[]}
                """, first, null).statusCode());
            var overview = json.readTree(request(app, "GET", root, null, first, null).body());
            assertEquals("实验一 · MySQL 环境与数据库管理", overview.path("labTitles").path("lab-01-workbench").asText());
            var workbench = overview.path("topics").valueStream()
                .filter(node -> node.path("tag").asText().equals("数据独立性")).findFirst().orElseThrow();
            assertEquals(2, workbench.path("points").asInt());
            assertEquals(2, workbench.path("score").asInt());
            assertEquals(100, workbench.path("percent").asInt());
            String debug = work + "/questions/" + sql + "/debug";
            for (int n = 0; n < 20; n++)
                assertEquals(404, request(app, "POST", debug, "{\"answer\":[\"SELECT 1\"],\"mode\":\"run\",\"offset\":0}", first, null).statusCode());
            assertEquals(429, request(app, "POST", debug, "{\"answer\":[\"SELECT 1\"],\"mode\":\"run\",\"offset\":0}", first, null).statusCode());

            String timed = root + "/exam-lab-02";
            var running = request(app, "POST", timed + "/start", "{\"mode\":\"exam\",\"minutes\":60,\"shuffle\":false}", first, null);
            assertEquals(200, running.statusCode(), running.body());
            String timerId = json.readTree(running.body()).path("draft").path("id").asText();
            String timedWork = timed + "/drafts/" + timerId;
            String timerSave = "{\"revision\":0,\"answers\":{\"exam-lab-02-r3-q01\":[\"A\"]},\"stars\":[]}";
            assertEquals(200, request(app, "POST", timedWork + "/save", timerSave, first, null).statusCode());
            String owner = json.readTree(request(app, "GET", "/auth/me", null, first, null).body()).path("userId").asText();
            var sources = app.getBean(dev.codesomething.storage.LearningDataSource.class);
            sources.inLearningTransaction(owner, tx -> tx.update("""
                UPDATE school_exam_drafts SET payload=json_set(payload,'$.startedAt',?)
                WHERE course_id='database-systems' AND id=?
                """, System.currentTimeMillis() - 61 * 60_000L, timerId));
            String late = "{\"revision\":1,\"answers\":{\"exam-lab-02-r3-q01\":[\"B\"]},\"stars\":[]}";
            assertEquals(400, request(app, "POST", timedWork + "/save", late, first, null).statusCode());
            var timedResult = request(app, "POST", timedWork + "/submit", late, first, null);
            assertEquals(200, timedResult.statusCode(), timedResult.body());
            var expired = json.readTree(timedResult.body());
            assertEquals("A", expired.path("items").get(0).path("answer").get(0).asText());
            assertEquals(3600, expired.path("summary").path("elapsedSeconds").asInt());
        }
    }

    @Test void publicLimitsLoginByAddressAndJudgeRequestsByAccount() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String student = token(register(app, "rate-student", invite(app, admin)));
            for (int attempt = 0; attempt < 4; attempt++)
                assertEquals(401, login(app, "unknown", "wrong-password").statusCode());
            var deniedLogin = login(app, "admin", "Initial-Admin-Password-92");
            assertEquals(429, deniedLogin.statusCode(), deniedLogin.body());
            assertEquals("RATE_LIMIT", json.readTree(deniedLogin.body()).path("code").asText());

            String job = "{\"submissionId\":\"missing\",\"idempotencyKey\":\"test\"}";
            String workspaceKey = java.util.UUID.randomUUID().toString();
            for (int attempt = 0; attempt < 10; attempt++)
                assertEquals(404, request(app, "POST", "/check-jobs", job, student, null, workspaceKey).statusCode());
            var deniedJob = request(app, "POST", "/check-jobs", job, student, null, workspaceKey);
            assertEquals(429, deniedJob.statusCode(), deniedJob.body());
            assertEquals("RATE_LIMIT", json.readTree(deniedJob.body()).path("code").asText());
        }
    }

    @Test void schoolExamCanAbandonDraftsReopenAndReviewObjectiveQuestionsWithoutUsingSqlQuota() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String learner = token(register(app, "exam-draft-owner", invite(app, admin)));
            String other = token(register(app, "exam-draft-neighbor", invite(app, admin)));
            String course = "/api/school/courses/database-systems";
            String exams = course + "/exams";
            String paper = exams + "/exam-lab-01";
            String practice = """
                {"mode":"practice","minutes":0,"shuffle":false}
                """;
            String exam = """
                {"mode":"exam","minutes":60,"shuffle":false}
                """;
            String id = json.readTree(request(app, "POST", paper + "/start", exam, learner, null).body())
                .path("draft").path("id").asText();
            assertFalse(id.isBlank());
            String work = paper + "/drafts/" + id;
            assertEquals(200, request(app, "POST", work + "/save", """
                {"revision":0,"answers":{},"stars":[]}
                """, learner, null).statusCode());
            assertEquals(404, request(app, "DELETE", work + "?revision=1", null, other, null).statusCode());
            assertEquals(409, request(app, "DELETE", work + "?revision=0", null, learner, null).statusCode());
            assertEquals(204, request(app, "DELETE", work + "?revision=1", null, learner, null).statusCode());
            assertEquals(404, request(app, "GET", work, null, learner, null).statusCode());
            assertEquals(11, json.readTree(request(app, "GET", course, null, learner, null).body()).path("examCount").asInt());
            var fresh = json.readTree(request(app, "POST", paper + "/start", practice, learner, null).body()).path("draft");
            assertNotEquals(id, fresh.path("id").asText());
            assertEquals("practice", fresh.path("mode").asText());
            work = paper + "/drafts/" + fresh.path("id").asText();
            String choiceCheck = work + "/questions/exam-lab-01-r3-q01/check";
            String fillCheck = work + "/questions/exam-lab-01-r3-q20/check";
            for (int n = 0; n < 12; n++) {
                assertEquals(200, request(app, "POST", choiceCheck, """
                    {"answer":["B"],"mode":"check","offset":0}
                    """, learner, null).statusCode());
                assertEquals(200, request(app, "POST", fillCheck, """
                    {"answer":["mat_num","Stock(mat_num)"],"mode":"check","offset":0}
                    """, learner, null).statusCode());
            }
            String sqlCheck = work + "/questions/exam-lab-01-r3-q21/check";
            for (int n = 0; n < 10; n++) {
                assertEquals(200, request(app, "POST", sqlCheck, """
                    {"answer":["SELECT 1"],"mode":"check","offset":0}
                    """, learner, null).statusCode());
            }
            assertEquals(429, request(app, "POST", sqlCheck, """
                {"answer":["SELECT 1"],"mode":"check","offset":0}
                """, learner, null).statusCode());
            assertEquals(200, request(app, "POST", choiceCheck, """
                {"answer":["B"],"mode":"check","offset":0}
                """, learner, null).statusCode());
        }
    }

    @Test void schoolExamPreservesAnswersFromAnOlderMockRevisionForExplicitDiscard() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String learner = token(register(app, "exam-legacy-draft", invite(app, admin)));
            String course = "/api/school/courses/database-systems/exams";
            String paper = course + "/exam-mock-01";
            String start = """
                {"mode":"practice","minutes":0,"shuffle":false}
                """;
            var creation = request(app, "POST", paper + "/start", start, learner, null);
            assertEquals(200, creation.statusCode(), creation.body());
            var draft = json.readTree(creation.body()).path("draft");
            String id = draft.path("id").asText();
            String work = paper + "/drafts/" + id;
            assertEquals(4, draft.path("paperRevisions").path("exam-mock-01").asInt());
            String first = draft.path("questionIds").get(0).asText();
            String answer = """
                {"revision":0,"answers":{"%s":["A"]},"stars":[]}
                """.formatted(first);
            assertEquals(200, request(app, "POST", work + "/save", answer, learner, null).statusCode());
            String owner = json.readTree(request(app, "GET", "/auth/me", null, learner, null).body()).path("userId").asText();
            app.getBean(dev.codesomething.storage.LearningDataSource.class).inLearningTransaction(owner, tx -> tx.update("""
                UPDATE school_exam_drafts SET payload=json_remove(payload,'$.paperRevisions')
                WHERE course_id='database-systems' AND id=?
                """, id));
            var outdated = json.readTree(request(app, "GET", work, null, learner, null).body());
            assertTrue(outdated.path("outdated").asBoolean());
            assertEquals(0, outdated.path("questions").size());
            assertEquals("A", outdated.path("draft").path("answers").path(first).get(0).asText());
            assertEquals(409, request(app, "POST", work + "/submit", """
                {"revision":1,"answers":{},"stars":[]}
                """, learner, null).statusCode());
            assertEquals(204, request(app, "DELETE", work + "?revision=1", null, learner, null).statusCode());
            var restarted = json.readTree(request(app, "POST", paper + "/start", start, learner, null).body());
            assertFalse(restarted.path("outdated").asBoolean());
            assertEquals(25, restarted.path("questions").size());
            String freshId = restarted.path("draft").path("id").asText();
            assertNotEquals(id, freshId);
            assertEquals(200, request(app, "POST", paper + "/drafts/" + freshId + "/submit", """
                {"revision":0,"answers":{},"stars":[]}
                """, learner, null).statusCode());
            app.getBean(dev.codesomething.storage.LearningDataSource.class).inLearningTransaction(owner, tx -> tx.update("""
                UPDATE school_exam_mistakes SET payload=json_set(payload,'$.item.question.prompt',?,
                    '$.item.question.options[3].text',?,'$.item.correct',json('["D"]'))
                WHERE course_id='database-systems' AND question_id=?
                """, "旧版题干", "旧版正确选项", first));
            var checked = request(app, "POST", course + "/mistakes/" + first + "/check", """
                {"answer":["D"],"mode":"check","offset":0}
                """, learner, null);
            assertEquals(200, checked.statusCode(), checked.body());
            var result = json.readTree(checked.body());
            assertEquals(2, result.path("score").asInt());
            assertEquals("旧版题干", result.path("question").path("prompt").asText());
            assertEquals("旧版正确选项", result.path("question").path("options").get(3).path("text").asText());
        }
    }

    @Test void administratorsAndLearnersHaveSeparateApiScopes() throws Exception {
        try (var app = start()) {
            String bootstrap = token(login(app, "admin", "Initial-Admin-Password-92"));
            var learnerResponse = register(app, "scope-learner", invite(app, bootstrap));
            String learner = token(learnerResponse);
            String learnerId = json.readTree(learnerResponse.body()).path("userId").asText();
            assertEquals(200, request(app,"GET","/profiles/me/preferences",null,learner,null).statusCode());
            assertEquals(403, request(app,"GET","/admin/users",null,learner,null).statusCode());
            var denied = request(app,"GET","/profiles/me/preferences",null,bootstrap,null);
            assertEquals(403, denied.statusCode(), denied.body());
            assertEquals("STUDENT_REQUIRED",json.readTree(denied.body()).path("code").asText());

            var delegateResponse = register(app, "scope-delegate", invite(app, bootstrap));
            String delegateId = json.readTree(delegateResponse.body()).path("userId").asText();
            assertEquals(200,request(app,"PATCH","/admin/users/"+delegateId+"/role","{\"role\":\"ROLE_ADMIN\"}",bootstrap,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,token(delegateResponse),null).statusCode());
            String delegate = token(login(app,"scope-delegate","Acceptance-Student-92"));
            assertEquals(200,request(app,"GET","/admin/users",null,delegate,null).statusCode());
            assertEquals(403,request(app,"PATCH","/admin/users/"+learnerId+"/role","{\"role\":\"ROLE_ADMIN\"}",delegate,null).statusCode());
            var peerResponse = register(app, "scope-peer", invite(app, bootstrap));
            String peerId = json.readTree(peerResponse.body()).path("userId").asText();
            assertEquals(200,request(app,"PATCH","/admin/users/"+peerId+"/role","{\"role\":\"ROLE_ADMIN\"}",bootstrap,null).statusCode());
            assertEquals(403,request(app,"PATCH","/admin/users/"+peerId+"/status","{\"status\":\"disabled\"}",delegate,null).statusCode());
            assertEquals(403,request(app,"POST","/admin/users/"+peerId+"/reset-password","{}",delegate,null).statusCode());
            assertEquals(403,request(app,"DELETE","/admin/users/"+peerId,null,delegate,null).statusCode());
            assertEquals(400,request(app,"DELETE","/admin/users/"+delegateId,null,delegate,null).statusCode());
            assertEquals(200,request(app,"PATCH","/admin/users/"+learnerId+"/status","{\"status\":\"disabled\"}",delegate,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,learner,null).statusCode());
            assertEquals(200,request(app,"PATCH","/admin/users/"+delegateId+"/role","{\"role\":\"ROLE_STUDENT\"}",bootstrap,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,delegate,null).statusCode());
            String demoted = token(login(app,"scope-delegate","Acceptance-Student-92"));
            assertEquals(403,request(app,"GET","/admin/users",null,demoted,null).statusCode());
            assertEquals(200,request(app,"GET","/profiles/me/preferences",null,demoted,null).statusCode());
            assertEquals(204,request(app,"DELETE","/admin/users/"+peerId,null,bootstrap,null).statusCode());
        }
    }

    @Test void deletingAnAccountRevokesAccessAndAllowsFreshRegistration() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            var registration = register(app, "removed-student", invite(app, admin));
            String student = token(registration);
            String id = json.readTree(registration.body()).path("userId").asText();
            String accountUrl = "/admin/users/" + id;
            String cookie = registration.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0];
            assertEquals(200, request(app, "GET", "/profiles/me/preferences", null, student, null).statusCode());
            assertEquals(403, request(app, "DELETE", accountUrl, null, student, null).statusCode());
            assertEquals(400, request(app, "DELETE", "/admin/users/admin", null, admin, null).statusCode());
            assertEquals(204, request(app, "DELETE", accountUrl, null, admin, null).statusCode());
            assertEquals(401, request(app, "GET", "/auth/me", null, student, null).statusCode());
            assertEquals(401, request(app, "POST", "/auth/refresh", null, null, cookie).statusCode());
            assertEquals(401, login(app, "removed-student", "Acceptance-Student-92").statusCode());
            assertEquals(404, request(app, "GET", accountUrl, null, admin, null).statusCode());
            var list = request(app, "GET", "/admin/users?keyword=removed-student", null, admin, null);
            assertEquals(0, json.readTree(list.body()).path("total").asInt(-1));
            assertEquals(200, request(app, "GET", "/admin/school", null, admin, null).statusCode());
            var audit = request(app, "GET", "/admin/audit?action=user_deleted", null, admin, null);
            assertEquals(id, json.readTree(audit.body()).path("items").path(0).path("target_id").asText());
            var replacement = register(app, "removed-student", invite(app, admin));
            assertEquals(200, replacement.statusCode(), replacement.body());
            assertNotEquals(id, json.readTree(replacement.body()).path("userId").asText());
        }
    }

    @Test void emailAllowsThreeAccountsAndRejectedRegistrationPreservesInvitation() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String email = "shared@example.test";
            token(register(app, "existing-student", email, invite(app, admin)));
            token(register(app, "second-student", "SHARED@example.test", invite(app, admin)));
            token(register(app, "third-student", email, invite(app, admin)));
            String unusedInvite = invite(app, admin);

            var emailLimit = register(app, "new-student", email, unusedInvite);
            assertEquals(409, emailLimit.statusCode(), emailLimit.body());
            assertEquals("EMAIL_ACCOUNT_LIMIT", json.readTree(emailLimit.body()).path("code").asText());

            var registered = register(app, "new-student", unusedInvite);
            assertEquals(200, registered.statusCode(), registered.body());
        }
    }

    @Test void duplicateUsernameReportsConflictAndPreservesInvitation() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            token(register(app, "existing-student", invite(app, admin)));
            String unusedInvite = invite(app, admin);
            var duplicate = register(app, "EXISTING-STUDENT", "other@example.test", unusedInvite);
            assertEquals(409, duplicate.statusCode(), duplicate.body());
            assertEquals("ACCOUNT_EXISTS", json.readTree(duplicate.body()).path("code").asText());
            token(register(app, "new-student", unusedInvite));
        }
    }

    private String invite(ConfigurableApplicationContext app, String admin) throws Exception {
        var response=request(app,"POST","/admin/invitations","{\"maxUses\":1,\"hours\":1}",admin,null);
        assertEquals(200,response.statusCode(),response.body());
        String code = json.readTree(response.body()).path("code").asText();
        assertTrue(code.matches("[A-Za-z0-9_-]{8}"));
        return code;
    }

    @Test void registrationAndPasswordChangeRequireAtLeastNineCharacters() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            String code = invite(app, admin);
            var registration = new java.util.HashMap<>(java.util.Map.of("username", "short-password-student",
                "email", "short-password@example.test", "inviteCode", code, "password", "Abcd1234"));
            assertEquals(400, request(app, "POST", "/auth/register", json.writeValueAsString(registration), null, null).statusCode());
            registration.put("password", "abcdabcda");
            String student = token(request(app, "POST", "/auth/register", json.writeValueAsString(registration), null, null));
            assertEquals(400, request(app, "POST", "/auth/password",
                "{\"currentPassword\":\"abcdabcda\",\"newPassword\":\"Wxyz9876\"}", student, null).statusCode());
            token(request(app, "POST", "/auth/password",
                "{\"currentPassword\":\"abcdabcda\",\"newPassword\":\"Wxyz98765\"}", student, null));
            token(login(app, "short-password-student", "Wxyz98765"));
        }
    }

    HttpResponse<String> request(ConfigurableApplicationContext app, String method, String path,
                                  String body, String token, String cookie) throws Exception {
        return request(app,method,path,body,token,cookie,null);
    }

    HttpResponse<String> request(ConfigurableApplicationContext app, String method, String path,
                                  String body, String token, String cookie, String workspaceKey) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
            + app.getEnvironment().getProperty("local.server.port") + (path.startsWith("/api/") ? path : "/api/v1" + path)))
            .header("Content-Type", "application/json");
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (cookie != null) builder.header("Cookie", cookie);
        if (workspaceKey != null) builder.header("X-CS-Workspace-Authorization","Bearer "+workspaceKey);
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    String token(HttpResponse<String> response) {
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body()).get("token").asText();
    }

    HttpResponse<String> login(ConfigurableApplicationContext app, String username, String password) throws Exception {
        return request(app, "POST", "/auth/login", json.writeValueAsString(java.util.Map.of("username", username, "password", password)), null, null);
    }

    HttpResponse<String> register(ConfigurableApplicationContext app,String username,String invite) throws Exception {
        return register(app, username, username + "@example.test", invite);
    }

    HttpResponse<String> register(ConfigurableApplicationContext app, String username, String email, String invite) throws Exception {
        return request(app, "POST", "/auth/register", json.writeValueAsString(java.util.Map.of(
            "username",username,"password","Acceptance-Student-92","email",email,"inviteCode",invite)), null, null);
    }

    @Test void adminOverviewCountsTheBootstrapAdministratorSeparately() throws Exception {
        try (var app = start()) {
            String admin = token(login(app, "admin", "Initial-Admin-Password-92"));
            var response = request(app, "GET", "/admin/analytics/overview", null, admin, null);
            assertEquals(200, response.statusCode(), response.body());
            var overview = json.readTree(response.body());
            assertEquals(0, overview.path("registered").asInt(-1));
            assertEquals(1, overview.path("administrators").asInt(-1));
        }
    }

    @Test void adminIndexBackfillsFiftyPhysicalDatabasesAndProjectsNewCommits() throws Exception {
        var primary = fixtureDatabase(data.resolve("codesomething.db"));
        var template = fixtureDatabase(data.resolve("learner-template.db"));
        var learners = new java.util.ArrayList<String>();
        var instant = java.time.Instant.now().minusSeconds(60).toString();
        template.update("INSERT INTO workspace_bindings VALUES('binding','browser','http-json-basics','1.1.0','run-server','hash',?)",instant);
        for (int row=0;row<20;row++) {
            String id = "%08x-0000-0000-0000-000000000000".formatted(row+1);
            template.update("INSERT INTO submissions VALUES(?,'binding','http-json-basics','1.1.0','run-server','digest',?,?)",
                id,"class TaskServer {}".getBytes(java.nio.charset.StandardCharsets.UTF_8),instant);
            template.update("""
                INSERT INTO check_jobs(id,submission_id,binding_id,idempotency_key,status,created_at)
                VALUES(?,?,'binding',?,'passed',?)
                """,id,id,id,instant);
            template.update("""
                INSERT INTO sql_attempts(id,course_version,stage_id,mode,source,digest,idempotency_key,status,created_at)
                VALUES(?,'1.0.0','sql-read','check','SELECT 1','digest',?,'environment_error',?)
                """,id,id,instant);
        }
        template.update("""
            INSERT INTO stage_completions VALUES('done','http-json-basics','1.1.0','run-server',
                '00000001-0000-0000-0000-000000000000','00000001-0000-0000-0000-000000000000',NULL,'digest','rule',?)
            """,instant);
        var physical = java.nio.file.Files.createDirectory(data.resolve("learners"));
        for (int row=0;row<50;row++) {
            String owner=java.util.UUID.randomUUID().toString();
            learners.add(owner);
            java.nio.file.Files.copy(data.resolve("learner-template.db"),physical.resolve(owner+".db"));
            primary.update("""
                INSERT INTO users(id,username,password_hash,role,status,created_at,updated_at)
                VALUES(?,?,'fixture-only','ROLE_STUDENT','active',?,?)
                """,owner,"fixture-"+row,instant,instant);
        }
        try (var app=start("--logging.level.org.flywaydb=WARN")) {
            String admin=token(login(app,"admin","Initial-Admin-Password-92"));
            var overview=adminJson(app,"/admin/analytics/overview",admin);
            assertEquals(50,overview.path("registered").asInt());
            assertEquals(2000,overview.path("submissions").asInt());
            var time=adminJson(app,"/admin/analytics/activity-timeline?hours=24",admin);
            int submissions=0;
            for (var bucket:time) submissions+=bucket.path("submissions").asInt();
            assertEquals(2000,submissions);
            var jobs=adminJson(app,"/admin/jobs?courseId=sql-foundations&keyword=00000001&page=2&size=3",admin);
            assertEquals(50,jobs.path("total").asInt());
            assertEquals(3,jobs.path("items").size());
            var users=adminJson(app,"/admin/users?role=ROLE_STUDENT",admin);
            assertEquals(50,users.path("total").asInt());
            assertEquals(1,users.path("items").get(0).path("completed").asInt());
            assertTrue(adminJson(app,"/admin/system/health",admin).path("database").path("bytes").asLong()>0);

            // A committed judge transition is indexed without a startup rescan.
            var storage=app.getBean(dev.codesomething.storage.LearningDataSource.class);
            String owner=learners.getFirst(), id="00000001-0000-0000-0000-000000000000";
            var tenant=storage.learning(owner);
            tenant.update("UPDATE sql_attempts SET status='timed_out' WHERE id=?",id);
            String filter="/admin/jobs?status=timed_out&userId="+owner;
            var refreshed=awaitAdmin(app,filter,admin,node->node.path("total").asInt()==1);
            assertEquals(owner,refreshed.path("items").get(0).path("user_id").asText());
            tenant.update("DELETE FROM stage_completions");
            awaitAdmin(app,"/admin/users?keyword=fixture-0",admin,node->node.path("items").get(0).path("completed").asInt()==0);

            latency(app,"/admin/analytics/overview",admin);
            latency(app,"/admin/jobs?courseId=sql-foundations&page=25",admin);
            // Index-backed reads still include records when a tenant file is unavailable.
            java.nio.file.Files.move(physical.resolve(owner+".db"),physical.resolve(owner+".offline"));
            assertEquals(2000,adminJson(app,"/admin/jobs",admin).path("total").asInt());
            assertEquals(2000,adminJson(app,"/admin/analytics/overview",admin).path("submissions").asInt());
            assertEquals(1,adminJson(app,filter,admin).path("total").asInt());
        }
    }

    @Test void adminRetryReusesTheOriginalSnapshotAndDoesNotDuplicateJobs() throws Exception {
        try(var app=start("--cs.runner.enabled=true","--cs.runner.docker=unavailable-acceptance-docker")) {
            String admin=token(login(app,"admin","Initial-Admin-Password-92"));
            var storage=app.getBean(dev.codesomething.storage.LearningDataSource.class);
            String id=java.util.UUID.randomUUID().toString();
            String now=java.time.Instant.now().toString();
            storage.inLearningTransaction("admin",jdbc->{
                jdbc.update("INSERT INTO workspace_bindings VALUES('retry-binding','browser','http-json-basics','1.1.0','run-server','hash',?)",now);
                jdbc.update("INSERT INTO submissions VALUES('retry-snapshot','retry-binding','http-json-basics','1.1.0','run-server','digest',?,?)",
                    "class TaskServer {}".getBytes(java.nio.charset.StandardCharsets.UTF_8),now);
                jdbc.update("""
                    INSERT INTO check_jobs(id,submission_id,binding_id,idempotency_key,status,report,created_at)
                    VALUES(?,'retry-snapshot','retry-binding','original','environment_error','{"log":"original"}',?)
                    """,id,now);
                return null;
            });
            awaitAdmin(app,"/admin/jobs",admin,node->node.path("total").asInt()==1);
            var retry=request(app,"POST","/admin/jobs/"+id+"/retry","{}",admin,null);
            assertEquals(202,retry.statusCode(),retry.body());
            String retryId=json.readTree(retry.body()).path("id").asText();
            assertNotEquals(id,retryId);
            var duplicate=request(app,"POST","/admin/jobs/"+id+"/retry","{}",admin,null);
            assertEquals(202,duplicate.statusCode(),duplicate.body());
            assertEquals(retryId,json.readTree(duplicate.body()).path("id").asText());
            assertFalse(json.readTree(duplicate.body()).path("created").asBoolean());
            awaitAdmin(app,"/admin/jobs",admin,node->node.path("total").asInt()==2);
            assertEquals("original",adminJson(app,"/admin/jobs/"+id,admin).path("report").path("log").asText());
            var result=awaitAdmin(app,"/admin/jobs/"+retryId,admin,node->node.path("status").asText().equals("environment_error"));
            assertEquals("retry-snapshot",result.path("submission_id").asText());
            assertEquals("class TaskServer {}",result.path("source").asText());
        }
    }

    @Test void adminExportsReportsThroughABackgroundArchive() throws Exception {
        try(var app=start()) {
            String admin=token(login(app,"admin","Initial-Admin-Password-92"));
            var response=request(app,"POST","/admin/school/reports",json.writeValueAsString(java.util.Map.of("courseId","database-systems","format","markdown")),admin,null);
            assertEquals(202,response.statusCode(),response.body());
            String path="/admin/school/reports/"+json.readTree(response.body()).path("id").asText();
            awaitAdmin(app,path,admin,node->"ready".equals(node.path("status").asText()));
            var zip=request(app,"GET",path+"/download",null,admin,null);
            assertEquals(200,zip.statusCode());
            assertEquals("application/zip",zip.headers().firstValue("Content-Type").orElse(""));
            assertTrue(zip.body().startsWith("PK"));
        }
    }

    private org.springframework.jdbc.core.JdbcTemplate fixtureDatabase(Path file) {
        var sqlite=new org.sqlite.SQLiteDataSource();
        sqlite.setUrl("jdbc:sqlite:"+file);
        org.flywaydb.core.Flyway.configure().dataSource(sqlite).target("18").load().migrate();
        return new org.springframework.jdbc.core.JdbcTemplate(sqlite);
    }

    private tools.jackson.databind.JsonNode adminJson(ConfigurableApplicationContext app,String path,String admin) throws Exception {
        var response=request(app,"GET",path,null,admin,null);
        assertEquals(200,response.statusCode(),response.body());
        return json.readTree(response.body());
    }

    private tools.jackson.databind.JsonNode awaitAdmin(ConfigurableApplicationContext app,String path,String admin,
            java.util.function.Predicate<tools.jackson.databind.JsonNode> condition) throws Exception {
        var deadline=java.time.Instant.now().plusSeconds(8);
        var result=adminJson(app,path,admin);
        while (!condition.test(result) && java.time.Instant.now().isBefore(deadline)) {
            Thread.sleep(80);
            result=adminJson(app,path,admin);
        }
        assertTrue(condition.test(result),result.toString());
        return result;
    }

    private void latency(ConfigurableApplicationContext app,String path,String admin) throws Exception {
        for(int i=0;i<10;i++) adminJson(app,path,admin);
        long[] samples=new long[40];
        for(int i=0;i<samples.length;i++) {
            long start=System.nanoTime();
            adminJson(app,path,admin);
            samples[i]=(System.nanoTime()-start)/1_000_000;
        }
        java.util.Arrays.sort(samples);
        long p95=samples[37],max=samples[39];
        System.out.printf("50 physical learner databases %s: p50=%d ms p95=%d ms max=%d ms (%d requests)%n",
            path,samples[19],p95,max,samples.length);
        assertTrue(p95<100,"p95="+p95+"ms");
    }

    @Test void loginCreatesRevocableSession() throws Exception {
        try (var app = start()) {
            assertEquals(401, request(app, "GET", "/profiles/me/preferences", null, null, null).statusCode());
            var guest = request(app, "GET", "/auth/session", null, null, null);
            assertEquals(200, guest.statusCode());
            assertEquals(json.readTree("{\"enabled\":true}"), json.readTree(guest.body()));
            var login = request(app, "POST", "/auth/login",
                "{\"username\":\"admin\",\"password\":\"Initial-Admin-Password-92\"}", null, null);
            String access = token(login);
            String setCookie = login.headers().firstValue("Set-Cookie").orElseThrow();
            assertTrue(setCookie.contains("HttpOnly") && setCookie.contains("Secure") && setCookie.contains("SameSite=Lax"));
            String cookie = setCookie.split(";", 2)[0];
            var status = request(app, "GET", "/auth/session", null, null, cookie);
            assertEquals(200, status.statusCode());
            assertEquals(json.readTree("{\"enabled\":true,\"role\":\"ROLE_ADMIN\"}"), json.readTree(status.body()));
            assertEquals("no-store", status.headers().firstValue("Cache-Control").orElseThrow());
            assertTrue(status.headers().firstValue("Set-Cookie").isEmpty());
            assertEquals(200, request(app, "GET", "/auth/me", null, access, null).statusCode());
            var refresh = request(app, "POST", "/auth/refresh", null, null, cookie);
            String renewed = token(refresh);
            assertEquals(json.readTree(guest.body()), json.readTree(request(app, "GET", "/auth/session", null, null, cookie).body()));
            assertEquals(401, request(app, "POST", "/auth/refresh", null, null, cookie).statusCode());
            assertEquals(200, request(app, "POST", "/auth/logout", null, renewed, null).statusCode());
            assertEquals(401, request(app, "GET", "/auth/me", null, renewed, null).statusCode());
        }
    }

    @Test void migratedPreferencesAndStudentWorkRemainSeparate() throws Exception {
        var sqlite = new org.sqlite.SQLiteDataSource();
        sqlite.setUrl("jdbc:sqlite:" + data.resolve("codesomething.db"));
        org.flywaydb.core.Flyway.configure().dataSource(sqlite).target("16").load().migrate();
        new org.springframework.jdbc.core.JdbcTemplate(sqlite).update("UPDATE learner_preferences SET daily_minutes=90");
        try (var app = start()) {
            String admin = token(login(app,"admin","Initial-Admin-Password-92"));
            String invite = json.readTree(request(app,"POST","/admin/invitations","{\"maxUses\":2,\"hours\":1}",admin,null).body()).path("code").asText();
            assertEquals(400,register(app,"guest","invalid-code").statusCode());
            var registered = register(app,"student-one",invite);
            String student = token(registered);
            String second = token(register(app,"student-two",invite));
            assertEquals(400,register(app,"student-three",invite).statusCode());
            assertEquals(403,request(app,"GET","/admin/users",null,student,null).statusCode());
            assertEquals(403,request(app,"POST","/workspace-previews","{}",student,null).statusCode());
            assertEquals(200,request(app,"GET","/admin/analytics/overview",null,admin,null).statusCode());
            assertEquals(200,request(app,"PATCH","/profiles/me/preferences","{\"dailyMinutes\":30}",student,null).statusCode());
            assertEquals(30,minutes(app,student));
            assertEquals(60,minutes(app,second));
            assertEquals(90,new org.springframework.jdbc.core.JdbcTemplate(sqlite)
                .queryForObject("SELECT daily_minutes FROM learner_preferences",Integer.class));
            assertEquals(403,request(app,"GET","/profiles/me/preferences",null,admin,null).statusCode());
            String key="acceptance-browser-draft-client-20261120";
            var opened=request(app,"POST","/browser-workspaces",json.writeValueAsString(java.util.Map.of(
                "courseId","http-json-basics","courseVersion","1.1.0","stageId","run-server","clientKey",key)),student,null);
            assertEquals(200,opened.statusCode(),opened.body());
            String binding="/browser-workspaces/"+json.readTree(opened.body()).path("id").asText();
            assertEquals(200,request(app,"GET",binding,null,student,null,key).statusCode());
            assertEquals(401,request(app,"GET",binding,null,second,null,key).statusCode());
            var id = json.readTree(registered.body()).path("userId").asText();
            var lookup = request(app,"GET","/admin/users?keyword=student-&role=ROLE_STUDENT",null,admin,null);
            assertEquals(2,json.readTree(lookup.body()).path("total").asInt(),lookup.body());
            assertEquals(200,request(app,"PATCH","/admin/users/"+id+"/status","{\"status\":\"disabled\"}",admin,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,student,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,"invalid.jwt.signature",null).statusCode());
            assertEquals(200,request(app,"PATCH","/admin/users/"+id+"/status","{\"status\":\"active\"}",admin,null).statusCode());
            var reset = request(app,"POST","/admin/users/"+id+"/reset-password","{}",admin,null);
            assertEquals(200,reset.statusCode(),reset.body());
            String temporary = json.readTree(reset.body()).path("temporaryPassword").asText();
            String temporaryToken = token(login(app,"student-one",temporary));
            assertEquals(403,request(app,"GET","/profiles/me/preferences",null,temporaryToken,null).statusCode());
            String changed = token(request(app,"POST","/auth/password",json.writeValueAsString(java.util.Map.of(
                "currentPassword",temporary,"newPassword","New-Student-Password-72")),temporaryToken,null));
            assertEquals(30,minutes(app,changed));
            assertEquals(401,request(app,"GET","/auth/me",null,temporaryToken,null).statusCode());
            assertEquals(200,request(app,"PATCH","/admin/users/"+id+"/role","{\"role\":\"ROLE_ADMIN\"}",admin,null).statusCode());
            assertEquals(401,request(app,"GET","/auth/me",null,changed,null).statusCode());
            String promoted = token(login(app,"student-one","New-Student-Password-72"));
            assertEquals(200,request(app,"GET","/admin/audit",null,promoted,null).statusCode());
            assertEquals(403,request(app,"GET","/profiles/me/preferences",null,promoted,null).statusCode());
            assertEquals(200,request(app,"PATCH","/admin/users/"+id+"/role","{\"role\":\"ROLE_STUDENT\"}",admin,null).statusCode());
        }
        try (var app=start()) {
            assertEquals(30,minutes(app,token(login(app,"student-one","New-Student-Password-72"))));
        }
    }

    @Test void rejectsWeakRegistrationAndLimitsRepeatedLogin() throws Exception {
        try(var app=start()) {
            assertEquals(400,request(app,"POST","/auth/register",
                "{\"username\":\"valid-user\",\"password\":\"123456\",\"email\":\"user@example.test\"}",null,null).statusCode());
            for(int attempt=0;attempt<5;attempt++) assertEquals(401,login(app,"admin","Incorrect-Password-91").statusCode());
            assertEquals(429,login(app,"admin","Initial-Admin-Password-92").statusCode());
        }
        try(var app=start()) {
            var response=login(app,"admin","Initial-Admin-Password-92");
            assertEquals(429,response.statusCode(),response.body());
            assertEquals("ACCOUNT_LOCKED",json.readTree(response.body()).path("code").asText());
        }
    }

    private int minutes(ConfigurableApplicationContext app,String token) throws Exception {
        var response=request(app,"GET","/profiles/me/preferences",null,token,null);
        assertEquals(200,response.statusCode(),response.body());
        return json.readTree(response.body()).path("dailyMinutes").asInt();
    }

    @Test void supplementalQuestionsRespectPublicationAndRevision() throws Exception {
        try(var app=start()) {
            String admin=token(login(app,"admin","Initial-Admin-Password-92"));
            String invite=json.readTree(request(app,"POST","/admin/invitations","{\"maxUses\":1,\"hours\":1}",admin,null).body()).path("code").asText();
            String student=token(register(app,"quiz-student",invite));
            String draft="""
                {"topic":"sql","prompt":"Which clause filters rows?","options":["ORDER BY","SELECT","GROUP BY","LIMIT","OFFSET","WHERE"],
                 "answer":5,"explanation":"WHERE filters input rows.","status":"draft","revision":0}
                """;
            assertEquals(403,request(app,"POST","/admin/questions",draft,student,null).statusCode());
            var created=request(app,"POST","/admin/questions",draft,admin,null);
            assertEquals(200,created.statusCode(),created.body());
            String id=json.readTree(created.body()).path("id").asText();
            assertEquals(6,json.readTree(created.body()).path("options").size());
            String binary=draft.replace("Which clause filters rows?","Is WHERE a filter?")
                .replace("[\"ORDER BY\",\"SELECT\",\"GROUP BY\",\"LIMIT\",\"OFFSET\",\"WHERE\"]","[\"Yes\",\"No\"]")
                .replace("\"answer\":5","\"answer\":0");
            assertEquals(200,request(app,"POST","/admin/questions",binary,admin,null).statusCode());
            var matches=adminJson(app,"/admin/questions?keyword=FILTER&size=1&page=2",admin);
            assertEquals(2,matches.path("total").asInt());
            assertEquals(1,matches.path("items").size());
            assertEquals(0,json.readTree(request(app,"GET","/reviews/supplemental",null,student,null).body()).size());
            String publish=draft.replace("\"draft\"","\"published\"").replace("\"revision\":0","\"revision\":1");
            assertEquals(200,request(app,"PATCH","/admin/questions/"+id,publish,admin,null).statusCode());
            assertEquals(409,request(app,"PATCH","/admin/questions/"+id,publish,admin,null).statusCode());
            var list=json.readTree(request(app,"GET","/reviews/supplemental?topic=sql",null,student,null).body());
            assertEquals(1,list.size());
            assertFalse(list.get(0).has("answer"));
            String route="/reviews/supplemental/"+id+"/answer";
            assertEquals(409,request(app,"POST",route,"{\"revision\":1,\"option\":0}",student,null).statusCode());
            assertTrue(json.readTree(request(app,"POST",route,"{\"revision\":2,\"option\":5}",student,null).body()).path("correct").asBoolean());
            String archive=publish.replace("\"published\"","\"archived\"").replace("\"revision\":1","\"revision\":2");
            assertEquals(200,request(app,"PATCH","/admin/questions/"+id,archive,admin,null).statusCode());
            assertEquals(404,request(app,"POST",route,"{\"revision\":3,\"option\":0}",student,null).statusCode());
            assertTrue(request(app,"GET","/admin/audit?action=question_updated",null,admin,null).body().contains(id));
        }
    }

    @Test void publicTutorStreamsOnlyToTheRequestOwner() throws Exception {
        String fixture=Path.of("src/test/resources/fake-app-server.mjs").toAbsolutePath().toString().replace('\\','/');
        try(var app=start("--cs.tutor.public-enabled=true","--cs.tutor.binary=node",
            "--cs.tutor.arguments=[\""+fixture+"\"]")) {
            String admin=token(login(app,"admin","Initial-Admin-Password-92"));
            String invite=json.readTree(request(app,"POST","/admin/invitations","{\"maxUses\":1,\"hours\":1}",admin,null).body()).path("code").asText();
            String student=token(register(app,"tutor-student",invite));
            var created=request(app,"POST","/tutor/requests","""
                {"courseId":"http-json-basics","courseVersion":"1.1.0","stageId":"json","level":"concept",
                 "question":"How does JSON represent false?","includeLesson":true,"idempotencyKey":"public-tutor"}
                """,student,null);
            assertEquals(200,created.statusCode(),created.body());
            String route="/tutor/requests/"+json.readTree(created.body()).path("id").asText();
            assertEquals(403,request(app,"GET",route+"/events",null,admin,null).statusCode());
            String anotherStudent=token(register(app,"other-tutor-student",invite(app,admin)));
            assertEquals(404,request(app,"GET",route+"/events",null,anotherStudent,null).statusCode());
            var stream=request(app,"GET",route+"/events",null,student,null);
            assertEquals(200,stream.statusCode(),stream.body());
            assertTrue(stream.headers().firstValue("Content-Type").orElse("").startsWith("text/event-stream"));
            assertTrue(stream.body().contains("event:state") && stream.body().contains("\"status\":\"completed\""),stream.body());
        }
    }
}

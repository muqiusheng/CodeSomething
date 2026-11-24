package dev.codesomething;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;

class InteractiveLearningApiTest {
    @TempDir Path directory;
    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    private static final String ROOT = "/api/v1/interactive";
    private static final String LESSON = ROOT + "/lessons/http-01-request-lifecycle/progress";
    private static final String PASSWORD = "Test-Interactive-Account-82";
    private URI base;

    @Test void onboardingProgressAndReplaysPersistWithoutDuplicateXp() throws Exception {
        try (var app = start(false)) {
            assertEquals("24", app.getBean(org.flywaydb.core.Flyway.class).info().current().getVersion().getVersion());
            assertEquals(0, state().at("/profile/xp").asInt());
            var profile = call("PUT", ROOT + "/onboarding", """
                {"background":{"java":"used","http":"seen","sql":"new","boot":"new"},
                 "goal":"crud","results":[true,true,false],"mode":"guided"}
                """, null, 200).path("profile");
            assertTrue(profile.path("completedAt").isString());
            assertEquals("http-01-request-lifecycle", profile.path("recommendedLessonId").asText());
            assertEquals("open", call("PATCH", ROOT + "/unlock-mode", "{\"mode\":\"open\"}", null, 200).at("/profile/mode").asText());
            assertEquals("guided", call("PATCH", ROOT + "/unlock-mode", "{\"mode\":\"guided\"}", null, 200).at("/profile/mode").asText());
            call("POST", ROOT + "/lessons/http-03-java-to-endpoint/progress", record(0,0,0,0,true), null, 403);
            call("POST", LESSON, record(0,2,0,0,true), null, 409);
            call("POST", LESSON, record(0,0,1,2,false), null, 200);
            for (int i=0;i<4;i++) call("POST", LESSON, record(i+1,i,i==0?1:0,i==0?2:0,true), null, 200);
            var retry = call("POST", LESSON, record(4,3,0,0,true), null, 200);
            assertEquals(100,retry.at("/profile/xp").asInt());
            assertEquals(1,retry.at("/profile/streakDays").asInt());
            assertEquals(75,retry.at("/progress/http-01-request-lifecycle/bestAccuracy").asInt());
            assertEquals(2,retry.at("/progress/http-01-request-lifecycle/hintsUsed").asInt());
            assertEquals("请求与响应",retry.at("/progress/http-01-request-lifecycle/mistakes/0").asText());
            call("POST", LESSON, "{\"revision\":5,\"action\":\"restart\"}", null, 200);
            for (int i=0;i<4;i++) call("POST", LESSON, record(i+6,i,0,0,true), null, 200);
            assertEquals(100,state().at("/profile/xp").asInt());
            assertEquals(4,state().at("/profile/bestCombo").asInt());
            assertEquals(100,state().at("/progress/http-01-request-lifecycle/bestAccuracy").asInt());
            assertEquals(0,app.getBean(org.springframework.jdbc.core.JdbcTemplate.class).queryForObject("SELECT count(*) FROM completions",Integer.class));
        }
        try (var ignored = start(false)) {
            assertEquals(100,state().at("/profile/xp").asInt());
            assertEquals("guided",state().at("/profile/mode").asText());
        }
    }

    @Test void challengeRequiresAllThreeCorrectAndUnlocksOnlyItsModule() throws Exception {
        try (var ignored = start(false)) {
            String skip=ROOT+"/modules/http/skip-unlock";
            call("POST",skip,"{\"passed\":true,\"answers\":[\"matched\",\"5:boolean\",\"application/json; charset=utf-8\"]}",null,422);
            assertTrue(state().path("unlocks").isEmpty());
            String answers = "{\"answers\":[\"missed\",\"5:boolean\",\"application/json; charset=utf-8\"]}";
            assertEquals("skip_quiz",call("POST",skip,answers,null,200).at("/unlocks/http").asText());
            assertEquals("skip_quiz",call("POST",skip,answers,null,200).at("/unlocks/http").asText());
            call("POST",ROOT+"/lessons/http-03-java-to-endpoint/progress",record(0,0,0,0,true),null,200);
            assertTrue(state().at("/unlocks/sql").isMissingNode());
        }
    }

    @Test void publicModeRoutesToLearnerDatabaseAndSeparatesRoles() throws Exception {
        try (var app = start(true)) {
            call("GET", ROOT + "/state", null, null, 401);
            String admin = call("POST","/api/v1/auth/login","{\"username\":\"admin\",\"password\":\""+PASSWORD+"\"}",null,200).path("token").asText();
            call("GET",ROOT+"/state",null,admin,403);
            var a=register("learner-a");
            var b=register("learner-b");
            String token=a.path("token").asText();
            call("PATCH",ROOT+"/unlock-mode","{\"mode\":\"open\"}",token,200);
            assertEquals("open",call("GET",ROOT+"/state",null,token,200).at("/profile/mode").asText());
            assertEquals("guided",call("GET",ROOT+"/state",null,b.path("token").asText(),200).at("/profile/mode").asText());
            var sources=app.getBean(dev.codesomething.storage.LearningDataSource.class);
            assertEquals("open",sources.learning(a.path("userId").asText()).queryForObject("SELECT mode FROM interactive_learner_profile",String.class));
        }
    }

    private JsonNode register(String username) throws Exception {
        return call("POST","/api/v1/auth/register",
            "{\"username\":\""+username+"\",\"email\":\""+username+"@example.test\",\"password\":\""+PASSWORD+"\"}",null,200);
    }
    private JsonNode state() throws Exception { return call("GET",ROOT+"/state",null,null,200); }
    private static String record(int revision,int step,int misses,int hints,boolean passed) {
        return """
            {"revision":%d,"action":"record","step":%d,"misses":%d,"hints":%d,"passed":%s}
            """.formatted(revision,step,misses,hints,passed);
    }
    private ConfigurableApplicationContext start(boolean publicMode) {
        byte[] secret=new byte[32];
        new java.security.SecureRandom().nextBytes(secret);
        var app = new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0",
            "--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath(),
            "--cs.public="+publicMode,"--cs.runner.enabled=false","--cs.auth.require-invite=false",
            "--cs.auth.initial-password="+PASSWORD,"--cs.auth.jwt-secret="+Base64.getEncoder().encodeToString(secret));
        base=URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port"));
        return app;
    }
    private JsonNode call(String method,String path,String body,String token,int status) throws Exception {
        var request=HttpRequest.newBuilder(base.resolve(path)).header("Content-Type","application/json");
        if(token!=null) request.header("Authorization","Bearer "+token);
        var result=client.send(request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
        assertEquals(status,result.statusCode(),method+" "+path+" -> "+result.body());
        return json.readTree(result.body());
    }
}

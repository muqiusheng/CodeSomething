package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class LearnerProfileApiTest {
    @TempDir Path directory;
    final HttpClient client=HttpClient.newHttpClient();
    final JsonMapper json=JsonMapper.builder().build();
    ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath());
    }
    HttpResponse<String> request(ConfigurableApplicationContext app,String path,Object body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/learner"+path)).header("Content-Type","application/json").method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body());}
    JsonNode knowledge(JsonNode profile,String stage){for(var k:profile.path("knowledge"))if(k.path("skill").path("stageId").asText().equals(stage))return k;throw new AssertionError(stage);}
    void sqlFixture(ConfigurableApplicationContext app,String id,String stage,String status,boolean complete){
        var jdbc=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        String time="2026-11-01T00:00:00Z";
        jdbc.update("INSERT INTO sql_attempts(id,course_version,stage_id,mode,source,digest,idempotency_key,status,created_at) VALUES(?,'1.0.0',?,'check','SELECT 1','digest',?,?,?)",id,stage,id,status,time);
        if(complete){jdbc.update("INSERT INTO sql_understanding VALUES(?,?,'sql-understanding-1','{}',1,?,?)","u-"+id,id,"u-"+id,time);jdbc.update("INSERT INTO sql_completions VALUES(?,'1.0.0',?,?,?,'digest','sql-understanding-1',?)","c-"+id,stage,id,"u-"+id,time);}
    }
    @Test void sourceEvidenceDistinguishesHelpRepeatedBusinessErrorsAndEnvironmentFailures() throws Exception {
        try(var app=start()) {
            sqlFixture(app,"done","db-connect","passed",true);
            sqlFixture(app,"helped","db-model","passed",true);
            sqlFixture(app,"wrong1","sql-read","business_error",false);
            sqlFixture(app,"wrong2","sql-read","sql_error",false);
            sqlFixture(app,"offline","sql-write","environment_error",false);
            var jdbc=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            jdbc.update("INSERT INTO tutor_requests(id,course_id,course_version,stage_id,help_level,question,context_manifest,prompt,fingerprint,idempotency_key,status,answer,created_at) VALUES('help','sql-foundations','1.0.0','db-model','example','q','lesson','p','hash','help','completed','example text','2026-10-31T00:00:00Z')");
            var profile=ok(request(app,"/profile",null));
            assertEquals("verified",knowledge(profile,"db-connect").path("state").asText());
            assertEquals("assisted",knowledge(profile,"db-model").path("state").asText());
            assertEquals("needs-review",knowledge(profile,"sql-read").path("state").asText());
            assertEquals(2,knowledge(profile,"sql-read").path("businessErrors").asInt());
            var offline=knowledge(profile,"sql-write");assertEquals("unverified",offline.path("state").asText());assertEquals(0,offline.path("businessErrors").asInt());assertEquals(1,offline.path("environmentErrors").asInt());
            assertEquals("digest",knowledge(profile,"db-connect").path("evidence").get(0).path("digest").asText());
        }
    }
    @Test void emptyProfileMakesNoMasteryClaimsAndCorrectionsSurviveRestart() throws Exception {
        try(var app=start()) {
            var profile=ok(request(app,"/profile",null));
            assertEquals("r5-1",profile.path("ruleVersion").asText());
            assertEquals(27,profile.path("knowledge").size());
            assertEquals(profile.path("knowledge").size(),profile.path("summary").path("total").asInt());
            for(var item:profile.path("knowledge"))assertEquals("unverified",item.path("state").asText());
            var body=Map.of("stageId","run-server","kind","dispute","reason","这次操作由同学代做","idempotencyKey","correction-1");
            var correction=ok(request(app,"/corrections",body));
            assertEquals(correction.path("id"),ok(request(app,"/corrections",body)).path("id"));
            assertEquals(400,request(app,"/corrections",Map.of("stageId","fake","kind","dispute","reason","错误","idempotencyKey","bad")).statusCode());
        }
        try(var app=start()) {
            var profile=ok(request(app,"/profile",null));
            assertEquals(1,profile.path("corrections").size());
            assertEquals("disputed",profile.path("knowledge").get(0).path("state").asText());
            assertEquals(0,profile.path("summary").path("completed").asInt());
        }
    }
    @Test void reviewUsesNewVariantsGradesOnServerAndDoesNotCompleteCourses() throws Exception {
        String id;
        try(var app=start()) {
            var opened=ok(request(app,"/reviews",Map.of("stageId","db-connect","help","none")));id=opened.path("id").asText();
            assertFalse(opened.toString().contains("correct"));assertFalse(opened.toString().contains("explanation"));
            assertEquals(id,ok(request(app,"/reviews",Map.of("stageId","db-connect","help","none"))).path("id").asText());
            assertEquals(400,request(app,"/reviews/"+id+"/answer",Map.of("answer",99)).statusCode());
            var result=ok(request(app,"/reviews/"+id+"/answer",Map.of("answer",1)));
            assertTrue(result.path("passed").asBoolean());
            assertEquals(result,ok(request(app,"/reviews/"+id+"/answer",Map.of("answer",1))));
            assertEquals(409,request(app,"/reviews/"+id+"/answer",Map.of("answer",0)).statusCode());
            var profile=ok(request(app,"/profile",null));assertEquals(0,profile.path("summary").path("completed").asInt());
            assertEquals("unverified",knowledge(profile,"db-connect").path("state").asText());
            assertEquals("即时变式独立答对",knowledge(profile,"db-connect").path("retention").asText());
            var next=ok(request(app,"/reviews",Map.of("stageId","db-connect","help","example")));
            assertNotEquals(opened.path("prompt"),next.path("prompt"));
            var later=ok(request(app,"/reviews/"+next.path("id").asText()+"/defer",Map.of("action","later")));
            assertEquals("later",later.path("status").asText());
            assertEquals(409,request(app,"/reviews/"+next.path("id").asText()+"/answer",Map.of("answer",0)).statusCode());
            assertEquals(0,ok(request(app,"/profile",null)).path("summary").path("completed").asInt());
        }
        try(var app=start()) {
            var queue=ok(request(app,"/reviews",null));assertTrue(queue.path("history").toString().contains(id));
            assertEquals("即时变式独立答对",knowledge(ok(request(app,"/profile",null)),"db-connect").path("retention").asText());
        }
    }
    @Test void adjustmentsRequireAcceptanceCanBeRejectedAndUndoCannotOverwriteNewerChanges() throws Exception {
        try(var app=start()) {
            var before=ok(request(app,"/profile",null)).path("plan");
            var large=ok(request(app,"/adjustments",Map.of("kind","focus-course","courseId","sql-foundations")));
            String largeId=large.path("id").asText();
            assertEquals(before,ok(request(app,"/profile",null)).path("plan"));
            assertEquals(15,large.path("afterMinutes").asInt());assertFalse(large.path("reason").asText().isBlank());
            ok(request(app,"/adjustments/"+largeId+"/decision",Map.of("action","reject")));
            assertEquals(before,ok(request(app,"/profile",null)).path("plan"));
            assertEquals(409,request(app,"/adjustments/"+largeId+"/decision",Map.of("action","accept")).statusCode());
            var one=ok(request(app,"/adjustments",Map.of("kind","daily-review","courseId","")));
            var two=ok(request(app,"/adjustments",Map.of("kind","focus-course","courseId","sql-foundations")));
            String oneId=one.path("id").asText();
            ok(request(app,"/adjustments/"+oneId+"/decision",Map.of("action","accept")));
            assertEquals(5,ok(request(app,"/profile",null)).path("plan").path("review_minutes").asInt());
            assertEquals(409,request(app,"/adjustments/"+two.path("id").asText()+"/decision",Map.of("action","accept")).statusCode());
            var newer=ok(request(app,"/adjustments",Map.of("kind","focus-course","courseId","sql-foundations")));
            String newerId=newer.path("id").asText();
            ok(request(app,"/adjustments/"+newerId+"/decision",Map.of("action","accept")));
            assertEquals(409,request(app,"/adjustments/"+oneId+"/decision",Map.of("action","undo")).statusCode());
            ok(request(app,"/adjustments/"+newerId+"/decision",Map.of("action","undo")));
            assertEquals(5,ok(request(app,"/profile",null)).path("plan").path("review_minutes").asInt());
            assertEquals("",ok(request(app,"/profile",null)).path("plan").path("focus_course").asText());
            assertEquals(0,ok(request(app,"/profile",null)).path("summary").path("completed").asInt());
        }
        try(var app=start()) {assertEquals(5,ok(request(app,"/profile",null)).path("plan").path("review_minutes").asInt());}
    }
    @Test void assistanceDeclaredDuringReviewIsRecordedAndCannotBeDowngraded() throws Exception {
        try(var app=start()) {
            var opened=ok(request(app,"/reviews",Map.of("stageId","db-connect","help","none")));String id=opened.path("id").asText();
            var answer=ok(request(app,"/reviews/"+id+"/answer",Map.of("answer",1,"help","example")));
            assertEquals("example",answer.path("help").asText());
            assertEquals("借助帮助答对",knowledge(ok(request(app,"/profile",null)),"db-connect").path("retention").asText());
            assertEquals(409,request(app,"/reviews/"+id+"/answer",Map.of("answer",1,"help","none")).statusCode());
            var next=ok(request(app,"/reviews",Map.of("stageId","db-model","help","example")));
            assertEquals(400,request(app,"/reviews/"+next.path("id").asText()+"/answer",Map.of("answer",0,"help","none")).statusCode());
        }
    }
    @Test void delayedReviewResolvesRecentWeaknessAndStageSummaryKeepsCodingIndependenceSeparate() throws Exception {
        try(var app=start()) {
            sqlFixture(app,"old-done","db-connect","passed",true);
            sqlFixture(app,"error1","db-connect","business_error",false);
            sqlFixture(app,"error2","db-connect","sql_error",false);
            app.getBean(org.springframework.jdbc.core.JdbcTemplate.class).update("UPDATE sql_attempts SET created_at='2026-11-02T00:00:00Z' WHERE id IN ('error1','error2')");
            var before=ok(request(app,"/profile",null));assertEquals("needs-review",knowledge(before,"db-connect").path("state").asText());
            assertFalse(before.path("snapshotId").asText().isBlank());
            assertEquals(before.path("snapshotId"),ok(request(app,"/profile",null)).path("snapshotId"));
            var opened=ok(request(app,"/reviews",Map.of("stageId","db-connect","help","none")));
            ok(request(app,"/reviews/"+opened.path("id").asText()+"/answer",Map.of("answer",1)));
            var after=ok(request(app,"/profile",null));
            assertEquals("verified",knowledge(after,"db-connect").path("state").asText());
            assertEquals("延迟变式独立答对",knowledge(after,"db-connect").path("retention").asText());
            assertEquals(1,after.path("summary").path("completed").asInt());
            assertEquals(5,after.path("summary").path("courses").size());
            var sql=after.path("summary").path("courses").get(1);
            assertEquals(1,sql.path("completed").asInt());assertEquals(1,sql.path("reviewCount").asInt());
            assertTrue(sql.path("independence").asText().contains("待验证"));
            assertNotEquals(before.path("snapshotId"),after.path("snapshotId"));
        }
    }
    @Test void repeatingAnExposedVariantIsLabeledAsRepetitionRatherThanNewIndependentEvidence() throws Exception {
        try(var app=start()) {
            for(int answer:List.of(1,0,1)){
                var r=ok(request(app,"/reviews",Map.of("stageId","db-connect","help","none")));
                assertTrue(ok(request(app,"/reviews/"+r.path("id").asText()+"/answer",Map.of("answer",answer))).path("passed").asBoolean());
            }
            assertEquals("重复变式答对",knowledge(ok(request(app,"/profile",null)),"db-connect").path("retention").asText());
        }
    }
    @Test void learnerCanStopExtraReviewAfterSeveralAdjustmentsWithoutReplayingOldUndos() throws Exception {
        try(var app=start()) {
            var focus=ok(request(app,"/adjustments",Map.of("kind","focus-course","courseId","task-manager")));
            ok(request(app,"/adjustments/"+focus.path("id").asText()+"/decision",Map.of("action","accept")));
            var pause=ok(request(app,"/adjustments",Map.of("kind","pause-review","courseId","")));
            assertEquals(15,pause.path("beforeMinutes").asInt());assertEquals(0,pause.path("afterMinutes").asInt());
            ok(request(app,"/adjustments/"+pause.path("id").asText()+"/decision",Map.of("action","accept")));
            var plan=ok(request(app,"/profile",null)).path("plan");assertEquals(0,plan.path("review_minutes").asInt());assertEquals("",plan.path("focus_course").asText());
        }
    }
}

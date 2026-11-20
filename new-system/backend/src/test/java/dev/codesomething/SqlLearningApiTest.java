package dev.codesomething;

import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class SqlLearningApiTest {
    @TempDir Path data;
    final HttpClient http=HttpClient.newHttpClient();
    final JsonMapper json=JsonMapper.builder().build();
    @Test void sqlCodeCompletionDoesNotRequireQuizAndRejectsEditedOrPracticeSql() throws Exception {
        try(var app=start()) {
            String source="SELECT 1 AS connected;",digest=dev.codesomething.sql.MysqlEnvironment.digest(source);
            var jdbc=app.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            var report=java.util.Map.of("snapshotDigest",digest,"ruleVersion",dev.codesomething.sql.SqlCourse.RULE,"policy","sql-db-connect-1","assertions",java.util.List.of(java.util.Map.of("name","连接","passed",true)));
            jdbc.update("INSERT INTO sql_attempts(id,course_version,stage_id,mode,source,digest,idempotency_key,status,report,created_at) VALUES('code-test','1.0.0','db-connect','check',?,?,?,'passed',?,?)",source,digest,"code-test",json.writeValueAsString(report),java.time.Instant.now().toString());
            String body=json.writeValueAsString(java.util.Map.of("attemptId","code-test","currentSql",source));
            assertEquals(200,request(app,"POST","/sql/complete-code",body).statusCode());
            assertEquals(200,request(app,"POST","/sql/complete-code",body).statusCode());
            var progress=json.readTree(request(app,"GET","/learning/progress/sql-foundations/1.0.0",null).body());
            assertEquals(1,progress.path("completedCount").asInt());
            assertTrue(progress.path("completions").get(0).path("understandingId").isNull());
            assertEquals(409,request(app,"POST","/sql/complete-code",json.writeValueAsString(java.util.Map.of("attemptId","code-test","currentSql","SELECT 2;"))).statusCode());
            jdbc.update("UPDATE sql_attempts SET mode='practice' WHERE id='code-test'");
            assertEquals(409,request(app,"POST","/sql/complete-code",body).statusCode());
        }
    }
    ConfigurableApplicationContext start(String... extra) {
        var args=new java.util.ArrayList<>(java.util.List.of("--server.port=0","--cs.data-directory="+data,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath(),"--cs.runner.enabled=false","--cs.sql.container=cs-sql-test-"+data.getFileName().toString().toLowerCase()));
        args.addAll(java.util.List.of(extra));
        return new SpringApplicationBuilder(CodeSomethingApplication.class).run(args.toArray(String[]::new));
    }
    HttpResponse<String> request(ConfigurableApplicationContext app,String method,String path,String body) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1"+path)).header("Content-Type","application/json");
        return http.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void sqlCourseIsVersionedAndReadingDoesNotCreateCompletion() throws Exception {
        try(var app=start()) {
            var course=request(app,"GET","/courses/sql-foundations/versions/1.0.0",null);
            assertEquals(200,course.statusCode(),course.body());
            assertEquals(6,json.readTree(course.body()).path("chapters").size());
            var progress=request(app,"GET","/learning/progress/sql-foundations/1.0.0",null);
            assertEquals(200,progress.statusCode(),progress.body());
            assertEquals(0,json.readTree(progress.body()).path("completedCount").asInt());
            assertEquals(6,json.readTree(progress.body()).path("totalCodeStages").asInt());
        }
    }
    @Test void unsupportedSqlAndCrossDatabaseAccessAreRejectedBeforeQueueing() throws Exception {
        try(var app=start()) {
            for(String sql:java.util.List.of("SELECT * FROM mysql.user;","SELECT SLEEP(9);","DROP DATABASE cs_practice;","SELECT 1; \\! whoami","SELECT 1 INTO OUTFILE '/tmp/a';")) {
                var r=request(app,"POST","/sql/attempts",json.writeValueAsString(java.util.Map.of("stageId","sql-read","courseVersion","1.0.0","mode","check","sql",sql,"idempotencyKey",java.util.UUID.randomUUID().toString())));
                assertEquals(400,r.statusCode(),r.body());
            }
            assertEquals(404,request(app,"POST","/sql/attempts","{\"stageId\":\"unknown\",\"courseVersion\":\"1.0.0\",\"mode\":\"check\",\"sql\":\"SELECT 1;\",\"idempotencyKey\":\"unknown\"}").statusCode());
        }
    }
    @Test void sqlCannotFallThroughToTheJavaWorkspaceAndUnknownVersionsStayUnpublished() throws Exception {
        try(var app=start()) {
            assertEquals(400,request(app,"POST","/workspace-previews","{\"directory\":\"x\",\"courseId\":\"sql-foundations\",\"courseVersion\":\"1.0.0\",\"stageId\":\"db-connect\"}").statusCode());
            var preview=request(app,"POST","/workspace-previews","{\"directory\":\"x\",\"courseId\":\"sql-foundations\",\"courseVersion\":\"1.0.0\",\"stageId\":\"db-connect\"}");
            assertTrue(preview.body().contains("SQL_SUBMISSION_REQUIRED"),preview.body());
            assertEquals(404,request(app,"GET","/courses/sql-foundations/versions/9.0.0",null).statusCode());
            assertEquals(404,request(app,"GET","/learning/progress/sql-foundations/9.0.0",null).statusCode());
        }
    }
    @Test void repeatedConcurrentSubmissionsAreOneSnapshotAndQueuedCancellationSurvivesRestart() throws Exception {
        String id;
        try(var app=start("--cs.sql.enabled=false")) {
            String body="{\"courseVersion\":\"1.0.0\",\"stageId\":\"db-connect\",\"mode\":\"check\",\"sql\":\"SELECT 1;\",\"idempotencyKey\":\"same\"}";
            var futures=new java.util.ArrayList<java.util.concurrent.CompletableFuture<HttpResponse<String>>>();
            for(int i=0;i<5;i++)futures.add(java.util.concurrent.CompletableFuture.supplyAsync(()->{try{return request(app,"POST","/sql/attempts",body);}catch(Exception e){throw new RuntimeException(e);}}));
            id=json.readTree(futures.getFirst().get().body()).path("id").asText();
            for(var f:futures){var response=f.get();assertEquals(200,response.statusCode(),response.body());assertEquals(id,json.readTree(response.body()).path("id").asText());}
            assertEquals(409,request(app,"POST","/sql/attempts",body.replace("SELECT 1","SELECT 2")).statusCode());
            assertEquals("cancelled",json.readTree(request(app,"POST","/sql/attempts/"+id+"/cancel","{}").body()).path("status").asText());
        }
        try(var app=start("--cs.sql.enabled=false")) {
            assertEquals("cancelled",json.readTree(request(app,"GET","/sql/attempts/"+id,null).body()).path("status").asText());
            assertEquals(1,json.readTree(request(app,"GET","/sql/attempts?stageId=db-connect",null).body()).size());
            assertEquals(0,json.readTree(request(app,"GET","/learning/progress/sql-foundations/1.0.0",null).body()).path("completedCount").asInt());
        }
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void realMysqlChecksBindDoubleResultsAndRestoreAfterRestart() throws Exception {
        String container="cs-sql-test-"+data.getFileName().toString().toLowerCase();
        try {
            try(var app=start()) {
                assertEquals(200,request(app,"POST","/sql/environment/start","{}").statusCode());
                var state=json.readTree("{}");
                for(int i=0;i<180;i++) {state=json.readTree(request(app,"GET","/sql/environment",null).body());if(!java.util.Set.of("starting","not_checked").contains(state.path("status").asText()))break;Thread.sleep(500);}
                assertEquals("ready",state.path("status").asText(),state.toString());
                var bad=check(app,"db-connect","SELECT 2 AS connected,DATABASE() AS current_database;","bad-connect");
                assertEquals("business_error",bad.path("status").asText(),bad.toString());
                var good=check(app,"db-connect","SELECT 1 AS connected,DATABASE() AS current_database;","good-connect");
                assertEquals("passed",good.path("status").asText(),good.toString());
                assertEquals(0,json.readTree(request(app,"GET","/learning/progress/sql-foundations/1.0.0",null).body()).path("completedCount").asInt());
                String sql=good.path("sql").asText(),id=good.path("id").asText();
                var body=new java.util.LinkedHashMap<String,Object>(java.util.Map.of("attemptId",id,"courseVersion","1.0.0","stageId","db-connect","ruleVersion","sql-understanding-1","currentSql",sql,"answers",java.util.Map.of("diagnose",0),"idempotencyKey","wrong-answer"));
                var wrong=request(app,"POST","/sql/understanding",json.writeValueAsString(body));assertEquals(200,wrong.statusCode(),wrong.body());assertFalse(json.readTree(wrong.body()).path("passed").asBoolean());
                body.put("answers",java.util.Map.of("diagnose",1));body.put("idempotencyKey","good-answer");
                body.put("currentSql",sql+" ");assertEquals(409,request(app,"POST","/sql/understanding",json.writeValueAsString(body)).statusCode());
                body.put("currentSql",sql);var passed=request(app,"POST","/sql/understanding",json.writeValueAsString(body));assertEquals(200,passed.statusCode(),passed.body());assertTrue(json.readTree(passed.body()).path("passed").asBoolean());
                assertEquals(passed.body(),request(app,"POST","/sql/understanding",json.writeValueAsString(body)).body().replace("已恢复原验证结果。","功能与理解均通过，完成证据已保存。"));
                var saved=request(app,"PUT","/learning/sessions/local","{\"courseId\":\"sql-foundations\",\"courseVersion\":\"1.0.0\",\"stageId\":\"db-connect\",\"step\":\"understanding\",\"expectedRevision\":0}");assertEquals(200,saved.statusCode(),saved.body());
                assertEquals(0,json.readTree(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null).body()).path("completedCount").asInt());
            }
            try(var app=start()) {
                var resume=json.readTree(request(app,"GET","/learning/continue",null).body());
                assertEquals("sql-foundations",resume.path("session").path("courseId").asText());
                assertEquals("db-model",resume.path("nextStageId").asText());
                assertEquals(1,resume.path("progress").path("completedCount").asInt());
            }
        }finally {
            new ProcessBuilder("docker","rm","-f",container).start().waitFor();
            new ProcessBuilder("docker","volume","rm",container+"-data").start().waitFor();
        }
    }
    tools.jackson.databind.JsonNode check(ConfigurableApplicationContext app,String stage,String sql,String key) throws Exception {
        return execute(app,stage,sql,key,"check");
    }
    tools.jackson.databind.JsonNode execute(ConfigurableApplicationContext app,String stage,String sql,String key,String mode) throws Exception {
        var result=request(app,"POST","/sql/attempts",json.writeValueAsString(java.util.Map.of("stageId",stage,"courseVersion","1.0.0","mode",mode,"sql",sql,"idempotencyKey",key)));
        assertEquals(200,result.statusCode(),result.body());var node=json.readTree(result.body());
        String id=node.path("id").asText();
        for(int i=0;i<160;i++){node=json.readTree(request(app,"GET","/sql/attempts/"+id,null).body());if(!java.util.Set.of("queued","running","cancelling").contains(node.path("status").asText()))return node;Thread.sleep(200);}
        fail("SQL check timeout: "+node);return node;
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void allSqlStagesRejectBrokenVariantsAndPracticeResetIsIsolated() throws Exception {
        String container="cs-sql-test-"+data.getFileName().toString().toLowerCase();
        var references=new java.util.LinkedHashMap<String,String>();
        references.put("db-connect","SELECT 1 AS connected,DATABASE() AS current_database;");
        references.put("db-model","CREATE TABLE tasks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,completed BOOLEAN NOT NULL DEFAULT 0);");
        references.put("sql-read","SELECT id,title FROM tasks WHERE completed=0 ORDER BY id;");
        references.put("sql-write","INSERT INTO tasks VALUES (9,'整理笔记',0); UPDATE tasks SET completed=1 WHERE id=1; DELETE FROM tasks WHERE id=2;");
        references.put("sql-page","SELECT id,title,completed FROM tasks ORDER BY completed,id LIMIT 2 OFFSET 2;");
        references.put("sql-transfer","CREATE TABLE bookmarks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,saved BOOLEAN NOT NULL DEFAULT 0); INSERT INTO bookmarks VALUES (1,'Java文档',0),(2,'SQL手册',0),(3,'接口笔记',0); UPDATE bookmarks SET saved=1 WHERE id=1; DELETE FROM bookmarks WHERE id=2; SELECT id,title FROM bookmarks WHERE saved=0 ORDER BY id;");
        var broken=java.util.Map.of("db-connect","SELECT 2 AS connected,DATABASE() AS current_database;","db-model","CREATE TABLE tasks (id INT,title VARCHAR(100),completed BOOLEAN);","sql-read","SELECT id,title FROM tasks WHERE completed=1 ORDER BY id;","sql-write","INSERT INTO tasks VALUES (9,'整理笔记',0); UPDATE tasks SET completed=1; DELETE FROM tasks WHERE id=2;","sql-page","SELECT id,title,completed FROM tasks ORDER BY completed,id LIMIT 2;","sql-transfer",references.get("sql-transfer").replace("saved=1 WHERE id=1","saved=1"));
        try(var app=start()) {
            request(app,"POST","/sql/environment/start","{}");
            for(int i=0;i<180;i++){var e=json.readTree(request(app,"GET","/sql/environment",null).body());if(e.path("status").asText().equals("ready"))break;if(e.path("status").asText().equals("environment_error"))fail(e.toString());Thread.sleep(500);}
            var preview=json.readTree(request(app,"POST","/sql/environment/reset-preview","{}").body());
            assertEquals(409,request(app,"POST","/sql/environment/reset",json.writeValueAsString(java.util.Map.of("target","mysql","token",preview.path("token").asText()))).statusCode());
            var modified=execute(app,"sql-write","UPDATE tasks SET title='个人练习' WHERE id=1; SELECT id,title FROM tasks WHERE id=1;","modify","practice");
            assertEquals("executed",modified.path("status").asText(),modified.toString());
            var future=check(app,"sql-read",references.get("sql-read"),"future");assertEquals("passed",future.path("status").asText(),future.toString());
            var futureAnswer=java.util.Map.of("attemptId",future.path("id").asText(),"courseVersion","1.0.0","stageId","sql-read","ruleVersion","sql-understanding-1","currentSql",references.get("sql-read"),"answers",java.util.Map.of("filter",2),"idempotencyKey","skip");
            assertEquals(409,request(app,"POST","/sql/understanding",json.writeValueAsString(futureAnswer)).statusCode());
            int count=0;
            for(var entry:references.entrySet()) {
                String stage=entry.getKey();
                var wrong=check(app,stage,broken.get(stage),"broken-"+stage);
                assertEquals("business_error",wrong.path("status").asText(),wrong.toString());
                var good=check(app,stage,entry.getValue(),"reference-"+stage);
                assertEquals("passed",good.path("status").asText(),good.toString());
                var rules=json.readTree(request(app,"GET","/sql/rules/"+stage,null).body());
                assertFalse(rules.toString().contains("solution"));
                int answer=stage.equals("sql-read")?2:stage.equals("sql-page")?0:1;
                var body=java.util.Map.of("attemptId",good.path("id").asText(),"courseVersion","1.0.0","stageId",stage,"ruleVersion","sql-understanding-1","currentSql",entry.getValue(),"answers",java.util.Map.of(rules.path("questions").get(0).path("id").asText(),answer),"idempotencyKey","answer-"+stage);
                var completion=request(app,"POST","/sql/understanding",json.writeValueAsString(body));
                assertEquals(200,completion.statusCode(),completion.body());assertTrue(json.readTree(completion.body()).path("passed").asBoolean(),completion.body());
                assertEquals(++count,json.readTree(request(app,"GET","/learning/progress/sql-foundations/1.0.0",null).body()).path("completedCount").asInt());
            }
            var practice=execute(app,"sql-read","SELECT id,title FROM tasks WHERE id=1;","still-modified","practice");
            assertTrue(practice.toString().contains("个人练习"),practice.toString());
            var resetBody=json.writeValueAsString(java.util.Map.of("target","cs_practice","token",preview.path("token").asText()));
            assertEquals(200,request(app,"POST","/sql/environment/reset",resetBody).statusCode());
            assertEquals(409,request(app,"POST","/sql/environment/reset",resetBody).statusCode());
            var restored=execute(app,"sql-read","SELECT id,title FROM tasks WHERE id=1;","reset-read","practice");
            assertTrue(restored.toString().contains("学习HTTP"),restored.toString());
            assertEquals(6,json.readTree(request(app,"GET","/learning/progress/sql-foundations/1.0.0",null).body()).path("completedCount").asInt());
            assertEquals(0,json.readTree(request(app,"GET","/learning/progress/http-json-basics/1.1.0",null).body()).path("completedCount").asInt());
        }finally{new ProcessBuilder("docker","rm","-f",container).start().waitFor();new ProcessBuilder("docker","volume","rm",container+"-data").start().waitFor();}
    }
}

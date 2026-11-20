package dev.codesomething;

import dev.codesomething.projects.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.net.URI;
import java.net.http.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

/** Real Docker matrix through the public project API, with independent learning storage. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class GeneratedCourseFlowTest {
    @TempDir Path directory;
    final JsonMapper json=JsonMapper.builder().build();final HttpClient client=HttpClient.newHttpClient();
    ConfigurableApplicationContext start(){return new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.data-directory="+directory,"--cs.course-directory="+Path.of("../course-packs").toAbsolutePath());}
    HttpResponse<String> request(ConfigurableApplicationContext app,String route,Object body)throws Exception{return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/projects"+route)).header("Content-Type","application/json").method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());}
    JsonNode ok(HttpResponse<String> r){assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body());}
    tools.jackson.databind.JsonNode untilDone(org.springframework.context.ConfigurableApplicationContext app,String route)throws Exception{
        tools.jackson.databind.JsonNode row=null;for(int i=0;i<1800;i++){row=ok(request(app,route,null));if(!Set.of("validating","queued","running").contains(row.path("status").asText()))return row;Thread.sleep(500);}throw new AssertionError(row);
    }
    @Test void gatesBuildReferenceRejectMutationsThenLearningRequiresCurrentDoubleResults()throws Exception{
        String courseId;
        try(var app=start()){
            var draft=ok(request(app,"/drafts",Map.of("interest","图书记录","kind","adapt","idempotencyKey","real-flow")));courseId=draft.path("id").asText();
            ok(request(app,"/drafts/"+courseId+"/validate",Map.of()));var ready=untilDone(app,"/drafts/"+courseId);assertEquals("ready",ready.path("status").asText(),ready.toPrettyString());assertTrue(ready.path("report").path("passed").asBoolean());assertEquals(7,ready.path("report").path("checks").size());
            var course=ok(request(app,"/drafts/"+courseId+"/publish",Map.of()));assertFalse(course.toString().contains("\"reference\""));assertFalse(course.toString().contains("\"answer\""));
            var pack=json.treeToValue(draft.path("payload"),GeneratedPackage.Pack.class);
            assertEquals(409,request(app,"/courses/"+courseId+"/checks",Map.of("stage","transfer","files",pack.chapters().get(2).reference(),"idempotencyKey","locked")).statusCode());
            for(var chapter:pack.chapters()){
                var body=Map.of("stage",chapter.id(),"files",chapter.reference(),"idempotencyKey","learn-"+chapter.id());var queued=ok(request(app,"/courses/"+courseId+"/checks",body));String attempt=queued.path("id").asText();assertEquals(attempt,ok(request(app,"/courses/"+courseId+"/checks",body)).path("id").asText());
                var passed=untilDone(app,"/checks/"+attempt);assertEquals("passed",passed.path("status").asText(),passed.toPrettyString());String digest=passed.path("digest").asText();assertEquals(409,request(app,"/checks/"+attempt+"/understanding",Map.of("digest","old","answer",0,"help","none","explanation","说明".repeat(30))).statusCode());
                assertFalse(ok(request(app,"/checks/"+attempt+"/understanding",Map.of("digest",digest,"answer",1,"help","none","explanation","说明".repeat(30)))).path("passed").asBoolean());
                if(chapter.id().equals("read"))ok(request(app,"/courses/"+courseId+"/stages/read/reference",null));
                var completed=ok(request(app,"/checks/"+attempt+"/understanding",Map.of("digest",digest,"answer",0,"help","none","explanation","请求经过控制器检查标题和布尔值，验证通过后写入内存，再转换为JSON响应。未知编号返回404，非法输入返回400。数据没有持久化，重启后清空。")));assertTrue(completed.path("passed").asBoolean());
            }
            var completed=ok(request(app,"/courses/"+courseId,null));assertEquals(3,completed.path("completions").size());assertEquals("example",completed.path("completions").get(0).path("help").asText());
            Files.writeString(directory.resolve("flow-evidence.json"),completed.toPrettyString());
        }
        try(var app=start()){assertEquals(3,ok(request(app,"/courses/"+courseId,null)).path("completions").size());}
    }
}

package dev.codesomething.lab;
import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

public class BusinessTest {
    static ConfigurableApplicationContext app;static String base;
    static final HttpClient http=HttpClient.newHttpClient();static final JsonMapper json=JsonMapper.builder().build();
    @BeforeAll static void start(){app=new SpringApplicationBuilder(Application.class).run("--server.port=0");base="http://127.0.0.1:"+((WebServerApplicationContext)app).getWebServer().getPort();}
    @AfterAll static void stop(){if(app!=null)app.close();}
    static HttpResponse<String> request(String method,String path,String token,Object input) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(base+path)).header("Content-Type","application/json");if(token!=null)builder.header("Authorization","Bearer "+token);
        return http.send(builder.method(method,input==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(input))).build(),HttpResponse.BodyHandlers.ofString());
    }
    static String login(String user) throws Exception {var r=request("POST","/api/auth/login",null,Map.of("username",user,"password","Learn-2026!"));assertEquals(200,r.statusCode(),r.body());return json.readTree(r.body()).path("token").asText();}
    @Test void outsiderCannotReadAnotherPlansTasks() throws Exception {
        var response=request("GET","/api/plans/1/tasks",login("eve"),null);assertEquals(403,response.statusCode(),response.body());
    }
    @Test void memberCannotBatchCreateAndCannotReadAudit() throws Exception {
        String bob=login("bob");assertEquals(403,request("POST","/api/plans/1/tasks/batch",bob,List.of(Map.of("title","禁止分配","assigneeId",2))).statusCode());
        assertEquals(403,request("GET","/api/admin/audit",bob,null).statusCode());
    }
    @Test void secondInvalidItemRollsBackFirstItemAndAudit() throws Exception {
        String owner=login("alice"),admin=login("admin");
        long plan=json.readTree(request("POST","/api/plans",owner,Map.of("title","事务集成测试")).body()).path("id").asLong();
        var before=request("GET","/api/admin/audit",admin,null).body();
        var bad=request("POST","/api/plans/"+plan+"/tasks/batch",owner,List.of(Map.of("title","必须回滚","assigneeId",1),Map.of("title","  ","assigneeId",1)));
        assertEquals(400,bad.statusCode(),bad.body());assertEquals(0,json.readTree(request("GET","/api/plans/"+plan+"/tasks",owner,null).body()).path("total").asInt());
        assertEquals(before,request("GET","/api/admin/audit",admin,null).body());
    }
    @Test void logoutRevokesTokenAndWrongPasswordFails() throws Exception {
        String token=login("bob");assertEquals(204,request("DELETE","/api/auth/session",token,null).statusCode());assertEquals(401,request("GET","/api/auth/me",token,null).statusCode());
        assertEquals(401,request("POST","/api/auth/login",null,Map.of("username","alice","password","wrong")).statusCode());
    }
}

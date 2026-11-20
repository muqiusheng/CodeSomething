package dev.codesomething.boot;

import dev.codesomething.workspaces.*;
import java.util.*;

/** Same chapter assertions regardless of where the application runs. */
public final class BootHttpChecks {
    private BootHttpChecks() {}
    private static void add(List<CheckReport.Assertion> checks,String name,boolean passed,String expected,LocalProjectRunner.Response r) {
        checks.add(new CheckReport.Assertion(name,passed,expected,"HTTP "+r.status()+" "+r.text()));
    }
    public static void verify(String stage,LocalProjectRunner.Request request,List<CheckReport.Assertion> checks)throws Exception {
        if(stage.equals("boot-start")) {
            var r=request.call("GET","/api/health",null);add(checks,"健康接口",r.json(200)&&r.body().path("status").isString()&&r.body().path("status").asText().equals("ok"),"200，status=字符串ok",r);
        } else if(stage.equals("boot-http")) {
            var r=request.call("GET","/api/echo/7?name=Java",null);add(checks,"路径与查询参数",r.json(200)&&r.body().path("id").isNumber()&&r.body().path("id").asInt()==7&&r.body().path("name").asText().equals("Java"),"id=7，name=Java",r);
            r=request.call("POST","/api/echo","{\"title\":\"新任务\",\"completed\":false}");add(checks,"DTO与201",r.json(201)&&r.body().path("title").asText().equals("新任务")&&r.body().path("completed").isBoolean()&&!r.body().path("completed").asBoolean(),"201，title与布尔completed",r);
            for(String input:List.of("{\"title\":\"a\",\"completed\":\"false\"}","{\"title\":\"a\"}")) {r=request.call("POST","/api/echo",input);add(checks,"拒绝错误类型或缺字段",r.json(400),"400 JSON",r);}
        } else if(stage.equals("boot-layers")) {
            var r=request.call("GET","/api/layers",null);add(checks,"三层组件调用",r.json(200)&&r.body().path("title").asText().equals("构造器注入"),"Repository→Service→Controller返回构造器注入",r);
        } else throw new IllegalArgumentException("Chapter requires isolated checks: "+stage);
    }
}

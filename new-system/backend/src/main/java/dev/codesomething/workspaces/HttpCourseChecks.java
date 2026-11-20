package dev.codesomething.workspaces;

import java.math.BigDecimal;
import java.util.*;

/** Shared HTTP course contract for native and isolated execution. */
public final class HttpCourseChecks {
    public static final String TEXT_POLICY="http-text-v1";
    private HttpCourseChecks() {}
    public static boolean textPractice(String course,String version,String stage) {
        return "http-json-basics".equals(course)&&"1.1.0".equals(version)&&"workspace-http-text".equals(stage);
    }
    static void verifyText(int status,String type,String body,List<CheckReport.Assertion> checks) {
        checks.add(new CheckReport.Assertion("GET /api/tasks/1 状态码",status==200,"HTTP 200","HTTP "+status));
        checks.add(new CheckReport.Assertion("响应格式",type.split(";",2)[0].strip().equalsIgnoreCase("text/plain"),"text/plain",type));
        checks.add(new CheckReport.Assertion("响应正文",!body.isBlank(),"返回你写的非空文字",body.isBlank()?"响应正文为空。":body));
    }
    public static void verify(String policy,LocalProjectRunner.Request request,List<CheckReport.Assertion> checks)throws Exception {
        if(TEXT_POLICY.equals(policy)) {
            var reply=request.call("GET","/api/tasks/1",null);
            verifyText(reply.status(),reply.type(),reply.text(),checks);
            return;
        }
        String base=policy.equals("notes-json-v1")?"/api/notes/":"/api/tasks/";
        for(int id=1;id<=2;id++) {
            var r=request.call("GET",base+id,null);
            if(policy.equals("server-smoke-v1")) {checks.add(new CheckReport.Assertion("GET "+base+id,true,"收到HTTP响应","HTTP "+r.status()+"\nContent-Type: "+r.type()+"\n\n"+r.text()));continue;}
            int expected=id==1?200:404;
            checks.add(new CheckReport.Assertion("GET "+base+id+" 状态码",r.status()==expected,"HTTP "+expected,"HTTP "+r.status()));
            checks.add(new CheckReport.Assertion("GET "+base+id+" 内容类型",r.type().toLowerCase(Locale.ROOT).split(";")[0].strip().equals("application/json"),"application/json",r.type()));
            var value=r.body();boolean valid;
            if(id==1) {
                String field=base.contains("notes")?"archived":"completed",title=base.contains("notes")?"第一条笔记":"学习 HTTP";
                valid=value.isObject()&&value.path("id").isNumber()&&value.path("id").decimalValue().compareTo(BigDecimal.ONE)==0
                    &&value.path("title").isString()&&title.equals(value.path("title").asText())&&value.path(field).isBoolean()&&!value.path(field).asBoolean();
            } else valid=value.isObject()&&value.path("message").isString()&&!value.path("message").asText().isBlank();
            checks.add(new CheckReport.Assertion("GET "+base+id+" JSON字段",valid,id==1?(base.contains("notes")?"id=数字1，title=第一条笔记，archived=布尔值false":"id=数字1，title=学习 HTTP，completed=布尔值false"):"message为非空字符串",r.text()));
        }
    }
}

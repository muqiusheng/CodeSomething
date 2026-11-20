package dev.codesomething.learning;

import dev.codesomething.api.ApiException;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/understanding-rules")
public class UnderstandingRules {
    private final dev.codesomething.boot.BootCourses boot;
    public UnderstandingRules(dev.codesomething.boot.BootCourses boot){this.boot=boot;}
    public static final String COURSE="http-json-basics", VERSION="1.1.0", RULE="1";
    public static final List<String> CODE_STAGES=List.of("run-server","fix-response","transfer");
    public record Question(String id,String prompt,List<String> options) {}
    public record Rule(String courseId,String courseVersion,String stageId,String ruleVersion,List<Question> questions) {}
    public record Practice(Map<String,Integer> answers) {}
    @PostMapping("/{course}/{version}/{stage}/practice")
    public Map<String,Object> practice(@PathVariable String course,@PathVariable String version,@PathVariable String stage,@RequestBody Practice write) {
        var rule=read(course,version,stage);
        if(write.answers()==null||!write.answers().keySet().equals(solution(stage).keySet()))throw ApiException.invalid("answers","请完成本组练习。 ");
        for(var question:rule.questions()) {var choice=write.answers().get(question.id());if(choice==null||choice<0||choice>=question.options().size())throw ApiException.invalid("answers","答案选项超出范围。");}
        boolean passed=solution(stage).equals(write.answers());
        return Map.of("passed",passed,"recorded",false,"feedback",passed?"思路正确。此次为即时练习，不写入正式理解或编码完成记录。":feedback(stage),"explanation",switch(stage){case "fix-response"->"404由未找到分支的状态码决定；JSON布尔false不加引号。";case "run-server"->"保存源码不会替换旧进程；修改端口后重新启动，并请求新监听端口。";case "transfer"->"资源的路径、分支、字段和类型需要一起迁移；未知资源仍返回404。";default->"对照当前章节的数据流、输入输出和失败分支，再检查每个选项。";});
    }
    @GetMapping("/{course}/{version}/{stage}")
    public Rule read(@PathVariable String course,@PathVariable String version,@PathVariable String stage) {
        if(dev.codesomething.boot.BootCourses.supports(course)){boot.require(course,version,stage);return new Rule(course,version,stage,"1",boot.questions(stage));}
        if(!COURSE.equals(course)||!VERSION.equals(version)||!CODE_STAGES.contains(stage))
            throw new ApiException(HttpStatus.NOT_FOUND,"UNDERSTANDING_UNAVAILABLE","此版本或章节暂无正式理解验证；可继续查看课程与历史报告。",Map.of());
        List<Question> questions=switch(stage) {
            case "run-server"->List.of(
                new Question("restart","把服务端口从8080改成8090并保存，旧进程还在运行。接下来怎样验证新程序？",List.of("只刷新原来的8080地址","停止旧程序，重新运行，再请求8090","修改浏览器的JSON显示方式")),
                new Question("connection","请求8090时显示连接被拒绝，应先核对什么？",List.of("把JSON布尔值改成字符串","把资源编号改成200","程序是否启动并监听8090")));
            case "fix-response"->List.of(
                new Question("status","GET /api/tasks/9应表示资源不存在。只把message写成“未找到”，HTTP状态仍为200。怎样修正？",List.of("将未找到分支的status改为404","把message改成英文","把端口改成404")),
                new Question("type","新字段urgent表示是否紧急，约定为布尔值。哪种JSON符合约定？",List.of("{\"urgent\":\"false\"}","{\"urgent\":false}","{\"urgent\":0}")));
            default->List.of(
                new Question("route","已有笔记1，现查询不存在的/api/notes/7。正确的响应约定是什么？",List.of("200与笔记1的数据","404与非空message字符串","修改监听端口为7")),
                new Question("mapping","把资源迁移成书签，并使用布尔字段saved，需要协调哪些代码？",List.of("只改课程标题","只把status改成200","注册路径、路径判断与JSON字段及类型")));
        };
        return new Rule(course,version,stage,RULE,questions);
    }
    public String policy(String stage){if(dev.codesomething.boot.BootCourses.BOOT.contains(stage)||dev.codesomething.boot.BootCourses.TASKS.contains(stage)||dev.codesomething.boot.BootCourses.COLLAB.contains(stage))return dev.codesomething.boot.BootCourses.policy(stage);return switch(stage){case "run-server"->"server-smoke-v1";case "fix-response"->"task-json-v1";case "transfer"->"notes-json-v1";default->"";};}
    public Map<String,Integer> solution(String stage){if(dev.codesomething.boot.BootCourses.BOOT.contains(stage)||dev.codesomething.boot.BootCourses.TASKS.contains(stage)||dev.codesomething.boot.BootCourses.COLLAB.contains(stage))return boot.solution(stage);return switch(stage){case "run-server"->Map.of("restart",1,"connection",2);case "fix-response"->Map.of("status",0,"type",1);default->Map.of("route",1,"mapping",2);};}
    public String feedback(String stage){if(dev.codesomething.boot.BootCourses.COLLAB.contains(stage))return "请对照本章的身份、成员关系与事务边界，预测新请求的数据和状态后重新回答。";if(dev.codesomething.boot.BootCourses.BOOT.contains(stage)||dev.codesomething.boot.BootCourses.TASKS.contains(stage))return "请对照本章数据流与新输入，重新预测后回答。";return switch(stage){case "run-server"->"核对保存文件、重启进程与监听端口的关系。";case "fix-response"->"分别核对HTTP状态与JSON字段类型；文字说明不会自动改变状态码。";default->"核对资源路径、成功数据与未找到分支，迁移时保持约定一致。";};}
}

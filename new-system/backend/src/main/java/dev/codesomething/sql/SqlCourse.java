package dev.codesomething.sql;

import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import dev.codesomething.api.ApiException;
import org.springframework.http.HttpStatus;

@Component
public class SqlCourse {
    public static final String ID="sql-foundations", VERSION="1.0.0", RULE="sql-understanding-1";
    public static final List<String> STAGES=List.of("db-connect","db-model","sql-read","sql-write","sql-page","sql-transfer");
    private final Path directory;
    public SqlCourse(@Value("${cs.course-directory:course-packs}") String directory){this.directory=Path.of(directory).resolve(ID).resolve(VERSION);}
    public Map<String,Object> project() {
        try {
            var mapper=JsonMapper.builder().build();var tree=mapper.readTree(Files.readString(directory.resolve("project.json")));
            if(tree.path("schemaVersion").asInt()!=3||!ID.equals(tree.path("courseId").asText())||!VERSION.equals(tree.path("courseVersion").asText())||!"published".equals(tree.path("status").asText())||tree.path("chapters").size()!=STAGES.size())throw new IllegalStateException("Invalid SQL course");
            var previous=new HashSet<String>();int index=0;
            for(var chapter:tree.path("chapters")) {
                if(!STAGES.get(index++).equals(chapter.path("stageId").asText())||chapter.path("concepts").size()<2||chapter.path("steps").isEmpty()||chapter.path("requirements").isEmpty()||chapter.path("question").path("answer").asInt(-1)<0||chapter.path("question").path("answer").asInt()>=chapter.path("question").path("options").size())throw new IllegalStateException("Invalid SQL chapter");
                for(var dep:chapter.path("dependsOn"))if(!previous.contains(dep.asText()))throw new IllegalStateException("Invalid SQL dependency");
                previous.add(chapter.path("stageId").asText());
            }
            return mapper.convertValue(tree,Map.class);
        }
        catch(Exception e){throw new IllegalStateException("SQL course unavailable",e);}
    }
    public String seed(boolean variant){try{return Files.readString(directory.resolve(variant?"seed-variant.sql":"seed.sql"));}catch(Exception e){throw new IllegalStateException("SQL seed unavailable",e);}}
    public void require(String stage){if(!STAGES.contains(stage))throw new ApiException(HttpStatus.NOT_FOUND,"COURSE_NOT_FOUND","SQL课程或关卡尚未发布。",Map.of());}
    public record Question(String id,String prompt,List<String> options) {}
    public List<Question> questions(String stage){require(stage);return switch(stage){
        case "db-connect"->List.of(new Question("diagnose","SELECT 1成功，查询表却提示不存在。下一步应做什么？",List.of("重新安装JDK","检查DATABASE()和表名","把JSON布尔值改为字符串")));
        case "db-model"->List.of(new Question("constraint","id为主键且已存在7，再插入id=7会怎样？",List.of("产生另一条编号7","违反主键约束","自动清空表")));
        case "sql-read"->List.of(new Question("filter","新数据中4和8已完成，5未完成。WHERE completed=0返回哪些编号？",List.of("4和8","全部编号","5")));
        case "sql-write"->List.of(new Question("scope","想删除编号20，DELETE FROM tasks没有WHERE会影响谁？",List.of("仅编号20","全部记录","零条")));
        case "sql-page"->List.of(new Question("page","每页3条取第3页，且状态值相同，哪个约定稳定？",List.of("ORDER BY completed,id LIMIT 3 OFFSET 6","LIMIT 3 OFFSET 3","只按completed排序")));
        default->List.of(new Question("transfer","将saved换为pinned并查询未置顶书签，需要同步什么？",List.of("只改网页标题","表结构、写入字段和查询条件","只改LIMIT")));
    };}
    public Map<String,Integer> solution(String stage){return Map.of(questions(stage).getFirst().id(),switch(stage){case "sql-read"->2;case "sql-page"->0;default->1;});}
}

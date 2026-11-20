package dev.codesomething.boot;

import dev.codesomething.api.ApiException;
import dev.codesomething.learning.UnderstandingRules;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class BootCourses {
    public static final String VERSION="1.0.0";
    public static final List<String> COLLAB=List.of("b-login","b-roles","b-plans","b-pagination","b-transaction","b-errors-logs","b-tests","b-deploy");
    public static final List<String> BOOT=List.of("boot-start","boot-http","boot-layers","boot-jdbc"),TASKS=List.of("a-read","a-create","a-update-delete","a-validation","a-pagination","a-transfer");
    private final Path directory;
    private final JsonMapper json=JsonMapper.builder().build();
    public BootCourses(@Value("${cs.course-directory:course-packs}") String directory){this.directory=Path.of(directory).toAbsolutePath().normalize();}
    public static boolean supports(String id){return Set.of("boot-foundations","task-manager","collaboration").contains(Objects.toString(id,""));}
    public static List<String> stages(String id){return "boot-foundations".equals(id)?BOOT:"task-manager".equals(id)?TASKS:"collaboration".equals(id)?COLLAB:List.of();}
    public static boolean jdbc(String stage){return "boot-jdbc".equals(stage)||TASKS.contains(stage)||COLLAB.contains(stage);}
    public static String policy(String stage){if(!BOOT.contains(stage)&&!TASKS.contains(stage)&&!COLLAB.contains(stage))throw new IllegalArgumentException("Unknown Boot strategy");return stage+"-v1";}
    public void require(String id,String version,String stage){if(!supports(id)||!VERSION.equals(version)||!stages(id).contains(stage))throw new ApiException(HttpStatus.NOT_FOUND,"COURSE_NOT_FOUND","此课程版本或关卡未发布。",Map.of());}
    @SuppressWarnings("unchecked") private Map<String,Object> raw(String id) {
        require(id,VERSION,stages(id).isEmpty()?"":stages(id).getFirst());
        try {
            var result=json.readValue(Files.readString(directory.resolve(id+"/"+VERSION+"/project.json")),Map.class);
            var chapters=(List<Map<String,Object>>)result.get("chapters");
            if(!id.equals(result.get("courseId"))||!VERSION.equals(result.get("courseVersion"))||!"published".equals(result.get("status"))||!stages(id).equals(chapters.stream().map(c->c.get("stageId")).toList()))throw new IllegalStateException("Invalid Boot course");
            return result;
        } catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}
    }
    @SuppressWarnings("unchecked") public Map<String,Object> project(String id){
        var result=raw(id);
        var chapters=(List<Map<String,Object>>)result.get("chapters");
        for(var chapter:chapters){chapter.remove("formalAnswer");chapter.put("starterFiles",files(id,(String)chapter.get("stageId"),"starter"));}
        return result;
    }
    public List<Map<String,String>> files(String id,String stage,String kind){
        require(id,VERSION,stage);
        if(!Set.of("starter","reference").contains(kind))throw new IllegalArgumentException();
        Path root=directory.resolve(id+"/"+VERSION+"/"+stage+"/"+kind);
        try(var paths=Files.walk(root)){
            var result=new ArrayList<Map<String,String>>();
            for(var path:paths.filter(Files::isRegularFile).sorted().toList())result.add(Map.of("path",root.relativize(path).toString().replace('\\','/'),"content",Files.readString(path)));
            return result;
        }catch(java.io.IOException e){throw new java.io.UncheckedIOException(e);}
    }
    @SuppressWarnings("unchecked") private Map<String,Object> chapter(String stage){String id=BOOT.contains(stage)?"boot-foundations":COLLAB.contains(stage)?"collaboration":"task-manager";require(id,VERSION,stage);return ((List<Map<String,Object>>)raw(id).get("chapters")).stream().filter(c->stage.equals(c.get("stageId"))).findFirst().orElseThrow();}
    @SuppressWarnings("unchecked") public Map<String,Integer> solution(String stage){return (Map<String,Integer>)chapter(stage).get("formalAnswer");}
    @SuppressWarnings("unchecked") public List<UnderstandingRules.Question> questions(String stage){return ((List<Map<String,Object>>)chapter(stage).get("formalQuestions")).stream().map(q->new UnderstandingRules.Question((String)q.get("id"),(String)q.get("prompt"),(List<String>)q.get("options"))).toList();}
}

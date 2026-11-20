package dev.codesomething.courses;

import dev.codesomething.api.ApiException;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/courses")
public class CourseController {
    private static final List<String> CHAPTERS=List.of("workspace","request","response","json","run-server","trace","fix-response","transfer");
    private final Path directory;
    private final dev.codesomething.sql.SqlCourse sqlCourse;
    private final dev.codesomething.boot.BootCourses boot;
    private final JsonMapper json = JsonMapper.builder().build();
    public CourseController(@Value("${cs.course-directory:course-packs}") String directory,dev.codesomething.sql.SqlCourse sqlCourse,dev.codesomething.boot.BootCourses boot) { this.directory = Path.of(directory).toAbsolutePath().normalize();this.sqlCourse=sqlCourse;this.boot=boot; }
    @GetMapping("/{id}/versions/{version}")
    public Map<String,Object> project(@PathVariable String id,@PathVariable String version) throws IOException {
        if(dev.codesomething.boot.BootCourses.supports(id)){boot.require(id,version,dev.codesomething.boot.BootCourses.stages(id).getFirst());return boot.project(id);}
        if(dev.codesomething.sql.SqlCourse.ID.equals(id)&&dev.codesomething.sql.SqlCourse.VERSION.equals(version))return sqlCourse.project();
        if(!"http-json-basics".equals(id)||!"1.1.0".equals(version)) throw missing();
        var content=json.readTree(Files.readString(directory.resolve("http-json-basics/1.1.0/project.json")));
        if(content.path("schemaVersion").asInt()!=2 || !id.equals(content.path("courseId").asText()) || !version.equals(content.path("courseVersion").asText()) || !"published".equals(content.path("status").asText()) || content.path("chapters").size()!=CHAPTERS.size()) throw new IllegalStateException("Invalid project package");
        Set<String> previous=new HashSet<>();
        for(int index=0;index<CHAPTERS.size();index++) {
            var chapter=content.path("chapters").get(index);
            if(!CHAPTERS.get(index).equals(chapter.path("stageId").asText()) || chapter.path("concepts").size()<2 || chapter.path("steps").isEmpty() || chapter.path("requirements").isEmpty() || chapter.path("question").path("answer").asInt(-1)<0 || chapter.path("question").path("answer").asInt()>=chapter.path("question").path("options").size()) throw new IllegalStateException("Invalid chapter");
            for(var dependency:chapter.path("dependsOn")) if(!previous.contains(dependency.asText())) throw new IllegalStateException("Invalid chapter dependency");
            previous.add(CHAPTERS.get(index));
        }
        @SuppressWarnings("unchecked") Map<String,Object> result=json.convertValue(content,Map.class);
        result.put("starter",Files.readString(directory.resolve("http-json-basics/1.1.0/TaskServer.java")));
        return result;
    }
    @GetMapping("/{id}/versions/{version}/stages/{stage}")
    public Map<String,Object> stage(@PathVariable String id, @PathVariable String version, @PathVariable String stage) throws IOException {
        requirePublished(id, version, stage);
        if(dev.codesomething.sql.SqlCourse.ID.equals(id)||dev.codesomething.boot.BootCourses.supports(id)) {
            var project=project(id,version);
            @SuppressWarnings("unchecked") var chapters=(List<Map<String,Object>>)project.get("chapters");
            return chapters.stream().filter(c->stage.equals(c.get("stageId"))).findFirst().orElseThrow();
        }
        if("1.1.0".equals(version)) {
            var project=project(id,version);
            @SuppressWarnings("unchecked") var chapters=(List<Map<String,Object>>)project.get("chapters");
            var result=new LinkedHashMap<>(chapters.stream().filter(chapter->stage.equals(chapter.get("stageId"))).findFirst().orElseThrow());
            for(String field:List.of("courseId","courseVersion","status","completionRule","sources","starter")) result.put(field,project.get(field));
            result.put("allowedFiles",List.of("TaskServer.java"));result.put("maxFileBytes",65536);
            return result;
        }
        var content = json.readTree(Files.readString(directory.resolve(id).resolve(version).resolve("stage.json")));
        if (content.path("schemaVersion").asInt() != 1 || !"published".equals(content.path("status").asText()) || !id.equals(content.path("courseId").asText()) || !version.equals(content.path("courseVersion").asText()) || !stage.equals(content.path("stageId").asText()))
            throw new IllegalStateException("Invalid course package");
        @SuppressWarnings("unchecked") Map<String,Object> result = json.convertValue(content, Map.class);
        result.put("starter", Files.readString(directory.resolve(id).resolve(version).resolve("TaskServer.java")));
        return result;
    }
    public void requirePublished(String id, String version, String stage) {
        if(dev.codesomething.boot.BootCourses.supports(id)){boot.require(id,version,stage);return;}
        if(dev.codesomething.sql.SqlCourse.ID.equals(id)&&dev.codesomething.sql.SqlCourse.VERSION.equals(version)&&dev.codesomething.sql.SqlCourse.STAGES.contains(stage))return;
        // Fixed published identifiers; request path segments never select arbitrary filesystem paths.
        if (!"http-json-basics".equals(id) || !("1.0.0".equals(version)&&"json-task-response".equals(stage) || "1.1.0".equals(version)&&CHAPTERS.contains(stage))) throw missing();
    }
    private ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND,"COURSE_NOT_FOUND","此课程版本或关卡尚未发布。",Map.of()); }
}

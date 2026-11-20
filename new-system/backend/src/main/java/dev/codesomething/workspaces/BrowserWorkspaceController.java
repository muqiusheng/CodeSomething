package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import dev.codesomething.boot.*;
import dev.codesomething.courses.CourseController;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

/** Browser drafts use the same authorized, immutable submissions as the IDE connector. */
@RestController
@RequestMapping("/api/v1/browser-workspaces")
@DependsOn("flyway")
public class BrowserWorkspaceController {
    private final JdbcTemplate jdbc;
    private final WorkspaceController workspaces;
    private final CourseController courses;
    private final JsonMapper json=JsonMapper.builder().build();
    public BrowserWorkspaceController(JdbcTemplate jdbc,WorkspaceController workspaces,CourseController courses){this.jdbc=jdbc;this.workspaces=workspaces;this.courses=courses;}
    public record Open(String courseId,String courseVersion,String stageId,String clientKey) {}
    public record Write(int expectedRevision,Map<String,String> files) {}
    public record Draft(String id,String token,int revision,List<BootProjectSnapshot.Source> files,String digest,String updatedAt,String submissionId,String jobId) {}

    @PostMapping
    @Transactional
    public Draft open(@RequestBody Open input) throws java.io.IOException {
        boolean textPractice=HttpCourseChecks.textPractice(input.courseId(),input.courseVersion(),input.stageId());
        courses.requirePublished(input.courseId(),input.courseVersion(),textPractice?"workspace":input.stageId());
        if(input.clientKey()==null||!input.clientKey().matches("[a-zA-Z0-9_-]{32,100}"))throw ApiException.invalid("clientKey","无法识别网页工作区，请重新打开。");
        boolean boot=BootCourses.supports(input.courseId());
        if(!boot&&!textPractice&&!ConsoleOutputCheck.applies(input.courseId(),input.courseVersion(),input.stageId())&&!("http-json-basics".equals(input.courseId())&&("1.0.0".equals(input.courseVersion())||Set.of("run-server","fix-response","transfer").contains(input.stageId()))))
            throw ApiException.invalid("stageId","本章不需要Java编程工作区。");
        var existing=jdbc.queryForList("SELECT b.id FROM workspace_bindings b JOIN browser_workspaces w ON w.binding_id=b.id WHERE b.course_id=? AND b.course_version=? AND b.stage_id=? AND b.token_hash=?",input.courseId(),input.courseVersion(),input.stageId(),WorkspaceController.hash(input.clientKey()));
        String id;
        if(existing.isEmpty()) {
            String firstStage=boot?BootCourses.stages(input.courseId()).getFirst():"1.0.0".equals(input.courseVersion())?input.stageId():"run-server";
            var stage=courses.stage(input.courseId(),input.courseVersion(),firstStage);
            List<BootProjectSnapshot.Source> files;
            if(boot) {
                @SuppressWarnings("unchecked") var values=(List<Map<String,String>>)stage.get("starterFiles");
                files=values.stream().filter(f->f.get("path").equals("pom.xml")||f.get("path").endsWith("/Application.java")).map(f->new BootProjectSnapshot.Source(f.get("path"),f.get("path").equals("pom.xml")?BootProjectSnapshot.trustedPom(BootCourses.jdbc(input.stageId())):f.get("content"))).toList();
            } else files=List.of(new BootProjectSnapshot.Source("TaskServer.java", """
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class TaskServer {
    public static void main(String[] args) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        // 在这里逐步实现任务接口：注册路径、读取请求、返回响应。
        server.start();
        System.out.println("Task server: http://localhost:8080/api/tasks/1");
    }
}
"""));
            int revision=0;
            var project=jdbc.queryForList("SELECT w.files,w.revision FROM browser_workspaces w JOIN workspace_bindings b ON b.id=w.binding_id WHERE b.course_id=? AND b.course_version=? AND b.token_hash=? ORDER BY w.revision DESC,w.updated_at DESC LIMIT 1",input.courseId(),input.courseVersion(),WorkspaceController.hash(input.clientKey()));
            if(!project.isEmpty()) {
                files=Arrays.asList(json.readValue((String)project.getFirst().get("files"),BootProjectSnapshot.Source[].class));
                revision=((Number)project.getFirst().get("revision")).intValue();
            }
            id=UUID.randomUUID().toString();String now=Instant.now().toString();
            jdbc.update("INSERT INTO workspace_bindings VALUES(?,?,?,?,?,?,?)",id,"browser:"+id,input.courseId(),input.courseVersion(),input.stageId(),WorkspaceController.hash(input.clientKey()),now);
            jdbc.update("INSERT INTO browser_workspaces VALUES(?,?,?,?)",id,json.writeValueAsString(files),revision,now);
        } else id=(String)existing.getFirst().get("id");
        return read(id,"Bearer "+input.clientKey(),input.clientKey());
    }
    @GetMapping("/{id}")
    public Draft get(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String auth){return read(id,auth,null);}

    private Draft read(String id,String auth,String token){
        var binding=workspaces.authorize(id,auth);
        var rows=jdbc.queryForList("SELECT * FROM browser_workspaces WHERE binding_id=?",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"WORKSPACE_NOT_FOUND","网页工作区不存在。",Map.of());
        var row=rows.getFirst();var files=Arrays.asList(json.readValue((String)row.get("files"),BootProjectSnapshot.Source[].class));
        var capture=workspaces.capture(binding.directory(),binding.courseId(),binding.stageId());
        var jobs=jdbc.queryForList("SELECT id,submission_id FROM check_jobs WHERE binding_id=? ORDER BY created_at DESC LIMIT 1",id);
        return new Draft(id,token,((Number)row.get("revision")).intValue(),files,capture.digest(),(String)row.get("updated_at"),jobs.isEmpty()?null:(String)jobs.getFirst().get("submission_id"),jobs.isEmpty()?null:(String)jobs.getFirst().get("id"));
    }
    @PostMapping("/{id}/draft")
    @Transactional
    public Draft save(@PathVariable String id,@RequestBody Write input,@RequestHeader(value="Authorization",required=false) String auth){
        var binding=workspaces.authorize(id,auth);var files=validate(input.files(),binding);
        if(jdbc.update("UPDATE browser_workspaces SET files=?,revision=revision+1,updated_at=? WHERE binding_id=? AND revision=?",json.writeValueAsString(files),Instant.now().toString(),id,input.expectedRevision())!=1)
            throw new ApiException(HttpStatus.CONFLICT,"DRAFT_CHANGED","其他页面已保存新版本。请先读取服务器版本，再决定保留哪份代码。",Map.of());
        // One mutable project source, separate immutable submissions/checks for each chapter.
        var siblings=jdbc.queryForList("SELECT b.id,b.stage_id FROM workspace_bindings b JOIN browser_workspaces w ON w.binding_id=b.id WHERE b.course_id=? AND b.course_version=? AND b.token_hash=? AND b.id<>?",binding.courseId(),binding.courseVersion(),binding.tokenHash(),id);
        for(var sibling:siblings){
            jdbc.update("UPDATE browser_workspaces SET files=?,revision=?,updated_at=? WHERE binding_id=?",json.writeValueAsString(files),input.expectedRevision()+1,Instant.now().toString(),sibling.get("id"));
        }
        return read(id,auth,null);
    }
    private List<BootProjectSnapshot.Source> validate(Map<String,String> input,WorkspaceController.Binding binding){
        if(BootCourses.supports(binding.courseId())) {
            try{return BootProjectSnapshot.fromFiles(input,BootCourses.jdbc(binding.stageId())).files();}
            catch(IllegalArgumentException e){throw ApiException.invalid("files",e.getMessage());}
        }
        if(input==null||input.size()!=1||!input.containsKey("TaskServer.java")||input.get("TaskServer.java")==null||input.get("TaskServer.java").getBytes(StandardCharsets.UTF_8).length>65536)throw ApiException.invalid("files","HTTP工程需要一个不超过64KiB的TaskServer.java。");
        return List.of(new BootProjectSnapshot.Source("TaskServer.java",input.get("TaskServer.java")));
    }
}

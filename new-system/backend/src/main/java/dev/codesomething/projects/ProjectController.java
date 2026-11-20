package dev.codesomething.projects;

import dev.codesomething.api.ApiException;
import dev.codesomething.profile.LearnerController;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {
    private final LearnerController learner;
    private final Path research;
    private final ProjectService projects;
    private final JsonMapper json=JsonMapper.builder().build();
    public ProjectController(LearnerController learner,ProjectService projects,@Value("${cs.course-directory:course-packs}") String courses){this.learner=learner;this.projects=projects;research=Path.of(courses).toAbsolutePath().normalize().resolveSibling("research");}
    public record Interest(String interest){}
    @PostMapping("/candidates") public Map<String,Object> candidates(@RequestBody Interest w)throws Exception {
        String interest=text(w.interest(),"interest",80);
        var profile=learner.profile();
        @SuppressWarnings("unchecked") var knowledge=(List<LearnerController.Knowledge>)profile.get("knowledge");
        var required=Set.of("boot-start","boot-http","boot-layers");
        var gaps=knowledge.stream().filter(k->required.contains(k.skill().stageId())&&!k.state().equals("verified")).map(k->Map.of("title",k.skill().title(),"state",k.state(),"route",k.skill().route(),"reason",k.reason())).toList();
        var sources=projects.sources();
        var next=knowledge.stream().filter(k->!k.state().equals("verified")).findFirst();
        String existing=next.map(k->switch(k.skill().courseId()){case "http-json-basics"->"/projects/backend-foundations";default->"/projects/"+k.skill().courseId();}).orElse("/projects/task-manager");
        var rows=List.of(
            Map.of("kind","existing","title",next.map(k->"继续巩固："+k.skill().title()).orElse("项目A独立复现"),"difference","按当前画像选择尚未验证或待巩固的现有课程，继续使用已发布教学与真实检查。","minutes",60,"gaps",List.of(),"route",existing),
            Map.of("kind","adapt","title",interest+" · 小型接口练习","difference","参考公开样例的数据访问与分层思路，收敛为内存REST练习；不复制上游代码，不包含JPA、登录或数据库。","minutes",150,"gaps",gaps,"route",""),
            Map.of("kind","generate","title",interest+" · 新题材项目","difference","用当前ChatGPT连接生成题材方案，再由固定Java21 / Spring Boot模板生成读取、新增校验和独立迁移三关；内存数据随重启清空。","minutes",150,"gaps",gaps,"route",""));
        return Map.of("interest",interest,"profileSnapshotId",profile.get("snapshotId"),"profileRule",profile.get("ruleVersion"),"verifiedCount",knowledge.stream().filter(k->k.state().equals("verified")).count(),"candidates",rows,"sources",sources,"scope","先修缺口给出补学入口，选择项目不会替换主线或增加每日学习时长。");
    }
    static String text(String value,String field,int max){if(value==null||value.isBlank()||value.length()>max||value.chars().anyMatch(c->c<32))throw ApiException.invalid(field,"请输入1—"+max+"字的有效内容。");return value.strip();}
    static ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"PROJECT_NOT_FOUND","项目尚未发布或记录不存在。",Map.of());}
    public record DraftWrite(String interest,String kind,String idempotencyKey){}
    @PostMapping("/drafts") public Map<String,Object> create(@RequestBody DraftWrite w)throws Exception{return projects.create(w.interest(),w.kind(),w.idempotencyKey());}
    @GetMapping("/drafts") public List<Map<String,Object>> drafts(){return projects.drafts();}
    @GetMapping("/drafts/{id}") public Map<String,Object> draft(@PathVariable String id){return projects.draft(id);}
    @PostMapping("/drafts/{id}/retry") public Map<String,Object> retry(@PathVariable String id)throws Exception{return projects.retry(id);}
    @PostMapping("/drafts/{id}/stop") public Map<String,Object> stop(@PathVariable String id){return projects.stop(id);}
    @PostMapping("/drafts/{id}/validate") public Map<String,Object> validate(@PathVariable String id)throws Exception{return projects.validate(id);}
    @PostMapping("/drafts/{id}/publish") public Map<String,Object> publish(@PathVariable String id)throws Exception{return projects.publish(id);}
    @GetMapping("/courses") public List<Map<String,Object>> courses(){return projects.courses();}
    @GetMapping("/courses/{id}") public Map<String,Object> course(@PathVariable String id){return projects.course(id);}
    @GetMapping("/courses/{id}/stages/{stage}/reference") public Map<String,String> reference(@PathVariable String id,@PathVariable String stage){return projects.reference(id,stage);}
    public record CheckWrite(String stage,Map<String,String> files,String idempotencyKey){}
    @PostMapping("/courses/{id}/checks") public Map<String,Object> check(@PathVariable String id,@RequestBody CheckWrite w){return projects.check(id,w.stage(),w.files(),w.idempotencyKey());}
    @GetMapping("/checks/{id}") public Map<String,Object> attempt(@PathVariable String id){return projects.attempt(id);}
    @PostMapping("/checks/{id}/stop") public Map<String,Object> stopCheck(@PathVariable String id){return projects.stopAttempt(id);}
    public record CodeWrite(String digest,String help){}
    @PostMapping("/checks/{id}/complete-code") public Map<String,Object> completeCode(@PathVariable String id,@RequestBody CodeWrite w){return projects.completeCode(id,w.digest(),w.help());}
    public record CompleteWrite(String digest,Integer answer,String help,String explanation){}
    @PostMapping("/checks/{id}/understanding") public Map<String,Object> complete(@PathVariable String id,@RequestBody CompleteWrite w){return projects.complete(id,w.digest(),w.answer(),w.help(),w.explanation());}
}

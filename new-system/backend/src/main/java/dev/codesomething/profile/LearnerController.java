package dev.codesomething.profile;

import dev.codesomething.api.ApiException;
import dev.codesomething.boot.BootCourses;
import dev.codesomething.sql.SqlCourse;
import java.time.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Projections never rewrite course completion or the authoritative learning cursor. */
@RestController
@RequestMapping("/api/v1/learner")
@DependsOn("flyway")
public class LearnerController {
    static final String RULE="r5-1";
    private final JdbcTemplate jdbc;
    private final tools.jackson.databind.json.JsonMapper json=tools.jackson.databind.json.JsonMapper.builder().build();
    public LearnerController(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public record Skill(String stageId,String courseId,String courseVersion,String title,String route) {}
    public static List<Skill> skills(){
        var all=new ArrayList<Skill>();
        add(all,"http-json-basics","1.1.0","/learn/http-json/1.1/",List.of("run-server","fix-response","transfer"),List.of("启动HTTP接口","修复响应与类型","迁移笔记接口"));
        add(all,SqlCourse.ID,"1.0.0","/learn/sql/1.0/",SqlCourse.STAGES,List.of("连接数据库","关系建模与约束","条件查询","安全增改删","稳定分页","迁移书签数据"));
        add(all,"boot-foundations","1.0.0","/learn/boot-foundations/1.0/",BootCourses.BOOT,List.of("启动Spring Boot","HTTP参数映射","分层与依赖","JDBC数据访问"));
        add(all,"task-manager","1.0.0","/learn/task-manager/1.0/",BootCourses.TASKS,List.of("读取任务","新增任务","修改与删除","输入校验","分页筛选","独立迁移书签"));
        add(all,"collaboration","1.0.0","/learn/collaboration/1.0/",BootCourses.COLLAB,List.of("登录会话","角色与对象权限","计划与成员关系","稳定分页筛选","批量事务","异常与日志","集成测试","部署与前端"));
        return all;
    }
    private static void add(List<Skill> all,String course,String version,String route,List<String> ids,List<String> names){for(int i=0;i<ids.size();i++)all.add(new Skill(ids.get(i),course,version,names.get(i),route+ids.get(i)));}
    private Skill skill(String id){return skills().stream().filter(s->s.stageId().equals(id)).findFirst().orElseThrow(()->ApiException.invalid("stageId","请选择已发布的知识关卡。"));}
    private static ApiException conflict(String message){return new ApiException(HttpStatus.CONFLICT,"LEARNER_CONFLICT",message,Map.of());}
    public record Evidence(String id,String type,String at,String ruleVersion,String digest,String detail) {}
    private String reportRule(String report){
        if(report==null)return "未记录";
        try{var r=json.readTree(report);return r.path("policy").asText("未记录")+" / "+r.path("ruleVersion").asText(r.path("harnessDigest").asText("未记录"));}catch(Exception e){return "报告无法解析";}
    }
    private String reportDetail(String status,String report){
        if(report==null)return status;
        try{var r=json.readTree(report);var failed=new ArrayList<String>();for(var a:r.path("assertions"))if(!a.path("passed").asBoolean())failed.add(a.path("name").asText("检查未通过"));return failed.isEmpty()?status:status+" · "+String.join("；",failed);}catch(Exception e){return status;}
    }
    private List<Evidence> evidence(Skill s){
        var list=new ArrayList<Evidence>();
        if(s.courseId().equals(SqlCourse.ID)) {
            list.addAll(jdbc.query("SELECT * FROM sql_completions WHERE course_version=? AND stage_id=?",(r,n)->new Evidence(r.getString("id"),"completion",r.getString("completed_at"),r.getString("rule_version"),r.getString("digest"),r.getString("understanding_id")==null?"SQL编程检查通过；概念巩固可选":"SQL功能与正式理解均通过"),s.courseVersion(),s.stageId()));
            list.addAll(jdbc.query("SELECT * FROM sql_attempts WHERE course_version=? AND stage_id=? AND mode='check' AND status IN ('business_error','sql_error','environment_error')",(r,n)->new Evidence(r.getString("id"),r.getString("status").equals("environment_error")?"environment":"business",r.getString("created_at"),reportRule(r.getString("report")),r.getString("digest"),reportDetail(r.getString("status"),r.getString("report"))),s.courseVersion(),s.stageId()));
        } else {
            list.addAll(jdbc.query("SELECT * FROM stage_completions WHERE course_id=? AND course_version=? AND stage_id=?",(r,n)->new Evidence(r.getString("id"),"completion",r.getString("completed_at"),r.getString("rule_version"),r.getString("snapshot_digest"),r.getString("understanding_id")==null?"编程检查通过；概念巩固可选":"功能与正式理解均通过"),s.courseId(),s.courseVersion(),s.stageId()));
            list.addAll(jdbc.query("SELECT j.id,j.status,j.created_at,j.report,s.digest FROM check_jobs j JOIN submissions s ON j.submission_id=s.id WHERE s.course_id=? AND s.course_version=? AND s.stage_id=? AND j.status IN ('business_error','compile_error','environment_error')",(r,n)->new Evidence(r.getString("id"),r.getString("status").equals("environment_error")?"environment":"business",r.getString("created_at"),reportRule(r.getString("report")),r.getString("digest"),reportDetail(r.getString("status"),r.getString("report"))),s.courseId(),s.courseVersion(),s.stageId()));
        }
        list.addAll(jdbc.query("SELECT id,created_at,help_level FROM tutor_requests WHERE course_id=? AND course_version=? AND stage_id=? AND length(answer)>0",(r,n)->new Evidence(r.getString("id"),"help",r.getString("created_at"),"tutor-1","",r.getString("help_level")),s.courseId(),s.courseVersion(),s.stageId()));
        list.sort(Comparator.comparing(Evidence::at).thenComparing(Evidence::id));return list;
    }
    public record Knowledge(Skill skill,String state,String reason,String independence,String retention,int businessErrors,int environmentErrors,List<Evidence> evidence,List<Map<String,Object>> corrections) {}
    private Knowledge knowledge(Skill s){
        var ev=evidence(s);var corrections=jdbc.queryForList("SELECT * FROM learner_corrections WHERE stage_id=? ORDER BY created_at,id",s.stageId());
        var completion=ev.stream().filter(e->e.type().equals("completion")).reduce((a,b)->b);
        String since=completion.map(Evidence::at).orElse("");
        boolean example=ev.stream().anyMatch(e->e.type().equals("help")&&e.detail().equals("example")&&completion.isPresent()&&e.at().compareTo(since)<=0);
        String correction=corrections.isEmpty()?"":corrections.getLast().get("kind").toString();
        var reviews=jdbc.queryForList("SELECT * FROM learner_reviews WHERE stage_id=? AND status='completed' ORDER BY finished_at,id",s.stageId());
        for(var r:reviews)ev.add(new Evidence(r.get("id").toString(),"review",r.get("finished_at").toString(),r.get("rule_version").toString(),"",(((Number)r.get("passed")).intValue()==1?"答对":"待巩固")+" / "+r.get("help")+" / 变式"+(((Number)r.get("variant")).intValue()+1)));
        ev.sort(Comparator.comparing(Evidence::at).thenComparing(Evidence::id));
        String checkedSince=reviews.stream().filter(r->((Number)r.get("passed")).intValue()==1&&r.get("help").equals("none")).map(r->r.get("finished_at").toString()).reduce(since,(a,b)->a.compareTo(b)>0?a:b);
        long recentErrors=ev.stream().filter(e->e.type().equals("business")&&e.at().compareTo(checkedSince)>0).count();
        String retention="尚未复习";
        if(!reviews.isEmpty()){var last=reviews.getLast();boolean repeated=reviews.stream().limit(reviews.size()-1).anyMatch(r->r.get("variant").equals(last.get("variant")));boolean delayed=completion.isPresent()&&Instant.parse(since).plus(Duration.ofDays(1)).isBefore(Instant.parse(last.get("created_at").toString()));retention=((Number)last.get("passed")).intValue()==1?("none".equals(last.get("help"))?(repeated?"重复变式答对":delayed?"延迟变式独立答对":"即时变式独立答对"):"借助帮助答对"):"变式待巩固";}
        String state=correction.equals("dispute")?"disputed":recentErrors>=2||retention.equals("变式待巩固")?"needs-review":completion.isPresent()?(example||correction.equals("assisted")?"assisted":"verified"):"unverified";
        String reason=switch(state){case "disputed"->"你对当前结论提出异议，原始证据保留。";case "needs-review"->"出现重复业务错误或复习未通过，建议换场景巩固。";case "assisted"->"编程检查通过，记录到示例帮助或你声明借助答案。";case "verified"->"课程编程检查通过，概念巩固和独立讲解另行记录。";default->"暂无编程完成证据。";};
        return new Knowledge(s,state,reason,"待独立编码与讲解验证",retention,(int)ev.stream().filter(e->e.type().equals("business")).count(),(int)ev.stream().filter(e->e.type().equals("environment")).count(),ev,corrections);
    }
    @GetMapping("/profile") @Transactional public synchronized Map<String,Object> profile(){
        var knowledge=skills().stream().map(this::knowledge).toList();
        for(var k:knowledge)for(var e:k.evidence())jdbc.update("INSERT OR IGNORE INTO learner_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID().toString(),k.skill().stageId(),k.skill().courseId(),k.skill().courseVersion(),e.type(),e.id(),e.ruleVersion(),e.digest(),e.detail(),e.at(),Instant.now().toString());
        String payload=json.writeValueAsString(List.of(RULE,knowledge,plan()));String fingerprint;
        try{fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        jdbc.update("INSERT OR IGNORE INTO learner_mastery_snapshots VALUES(?,?,?,?,?)",UUID.randomUUID().toString(),RULE,fingerprint,payload,Instant.now().toString());
        String snapshotId=jdbc.queryForObject("SELECT id FROM learner_mastery_snapshots WHERE fingerprint=?",String.class,fingerprint);
        long completed=knowledge.stream().filter(k->k.evidence().stream().anyMatch(e->e.type().equals("completion"))).count();
        var retrospectives=new ArrayList<Map<String,Object>>();
        for(String course:List.of("http-json-basics","sql-foundations","boot-foundations","task-manager","collaboration")){
            var group=knowledge.stream().filter(k->k.skill().courseId().equals(course)).toList();
            var pending=group.stream().filter(k->k.evidence().stream().noneMatch(e->e.type().equals("completion"))).findFirst();
            retrospectives.add(Map.of("courseId",course,"completed",group.stream().filter(k->k.evidence().stream().anyMatch(e->e.type().equals("completion"))).count(),"total",group.size(),"helpCount",group.stream().flatMap(k->k.evidence().stream()).filter(e->e.type().equals("help")).count(),"reviewCount",jdbc.queryForObject("SELECT count(*) FROM learner_reviews WHERE status='completed' AND stage_id IN ("+String.join(",",Collections.nCopies(group.size(),"?"))+")",Integer.class,group.stream().map(k->k.skill().stageId()).toArray()),"nextRoute",pending.map(k->k.skill().route()).orElse("/reviews"),"next",pending.map(k->"继续课程："+k.skill().title()).orElse("课程编码已完成，进行独立复现、数据流讲解和陌生小改动。"),"independence","独立编码与开放讲解待验证；选择题只记录概念保留。"));
        }
        return Map.of("snapshotId",snapshotId,"ruleVersion",RULE,"knowledge",knowledge,"corrections",jdbc.queryForList("SELECT * FROM learner_corrections ORDER BY created_at,id"),"summary",Map.of("completed",completed,"total",knowledge.size(),"independence","待独立编码与讲解验证","next",completed==0?"从入门实验室完成首个代码关卡，再查看证据。":"优先复习需要巩固的知识，再继续主线。","courses",retrospectives),"plan",plan());
    }
    public record CorrectionWrite(String stageId,String kind,String reason,String idempotencyKey) {}
    @PostMapping("/corrections") @Transactional public synchronized Map<String,Object> correct(@RequestBody CorrectionWrite w){
        skill(w.stageId());if(w.kind()==null||!Set.of("dispute","assisted","resolved").contains(w.kind()))throw ApiException.invalid("kind","请选择异议、借助答案或撤回纠正。");
        if(w.reason()==null||w.reason().isBlank()||w.reason().length()>500)throw ApiException.invalid("reason","请输入1—500字的纠正说明。");
        if(w.idempotencyKey()==null||!w.idempotencyKey().matches("[a-zA-Z0-9_-]{1,100}"))throw ApiException.invalid("idempotencyKey","请提供有效操作编号。");
        var old=jdbc.queryForList("SELECT * FROM learner_corrections WHERE idempotency_key=?",w.idempotencyKey());
        if(!old.isEmpty()){var row=old.getFirst();if(!w.stageId().equals(row.get("stage_id"))||!w.kind().equals(row.get("kind"))||!w.reason().equals(row.get("reason")))throw conflict("该操作编号已用于其他纠正。");return row;}
        String id=UUID.randomUUID().toString();jdbc.update("INSERT INTO learner_corrections VALUES(?,?,?,?,?,?)",id,w.stageId(),w.kind(),w.reason(),w.idempotencyKey(),Instant.now().toString());
        return jdbc.queryForMap("SELECT * FROM learner_corrections WHERE id=?",id);
    }
    private Map<String,Object> plan(){return jdbc.queryForMap("SELECT * FROM learner_plan WHERE id='local'");}

    public record ReviewStart(String stageId,String help) {}
    private Map<String,Object> review(String id){
        var rows=jdbc.queryForList("SELECT * FROM learner_reviews WHERE id=?",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"REVIEW_NOT_FOUND","复习记录不存在。",Map.of());
        var row=rows.getFirst();var q=ReviewQuestions.get(row.get("stage_id").toString(),((Number)row.get("variant")).intValue());
        var result=new LinkedHashMap<String,Object>();
        result.put("id",id);result.put("skill",skill(row.get("stage_id").toString()));result.put("ruleVersion",row.get("rule_version"));result.put("status",row.get("status"));result.put("help",row.get("help"));result.put("variant",row.get("variant"));result.put("prompt",q.prompt());result.put("options",q.options());result.put("dueAt",row.get("due_at"));
        if(row.get("answer")!=null){result.put("answer",row.get("answer"));result.put("passed",((Number)row.get("passed")).intValue()==1);result.put("correct",q.correct());result.put("explanation",q.explanation());}
        return result;
    }
    @GetMapping("/reviews") public Map<String,Object> reviews(){
        var config=plan();String focus=config.get("focus_course").toString();
        var items=new ArrayList<Map<String,Object>>();
        for(var s:skills()) {
            var k=knowledge(s);var previous=jdbc.queryForList("SELECT * FROM learner_reviews WHERE stage_id=? ORDER BY created_at DESC,id DESC LIMIT 1",s.stageId());
            String due=previous.isEmpty()?k.evidence().stream().filter(e->e.type().equals("completion")).map(e->Instant.parse(e.at()).plus(Duration.ofDays(1)).toString()).findFirst().orElse(""):previous.getFirst().get("due_at").toString();
            boolean scheduled=!due.isEmpty()&&!Instant.parse(due).isAfter(Instant.now());
            boolean snoozed=!previous.isEmpty()&&Set.of("later","skipped").contains(previous.getFirst().get("status"))&&!scheduled;
            boolean recommended=!snoozed&&(k.state().equals("needs-review")||k.state().equals("disputed")||scheduled);
            items.add(Map.of("skill",s,"state",k.state(),"retention",k.retention(),"recommended",recommended,"reason",snoozed?"你已暂缓，可随时主动开始":recommended?(k.state().equals("needs-review")?"重复错误或复习待巩固":"已到复查时间或存在异议"):"可主动选练，不改变主线解锁","dueAt",due,"lastStatus",previous.isEmpty()?"new":previous.getFirst().get("status"),"focus",focus.equals(s.courseId())));
        }
        items.sort(Comparator.<Map<String,Object>,Boolean>comparing(m->(Boolean)m.get("recommended")).reversed().thenComparing(m->!(Boolean)m.get("focus")));
        var history=jdbc.queryForList("SELECT id FROM learner_reviews ORDER BY created_at DESC,id DESC LIMIT 30").stream().map(r->review(r.get("id").toString())).toList();
        return Map.of("items",items,"history",history,"plan",config,"dailyLimit",Math.max(1,((Number)config.get("review_minutes")).intValue()/5));
    }
    @PostMapping("/reviews") @Transactional public synchronized Map<String,Object> startReview(@RequestBody ReviewStart w){
        skill(w.stageId());if(w.help()==null||!Set.of("none","hint","example").contains(w.help()))throw ApiException.invalid("help","请选择本次是否借助提示或答案。");
        var open=jdbc.queryForList("SELECT id,help FROM learner_reviews WHERE stage_id=? AND status='open'",w.stageId());
        if(!open.isEmpty()){if(!w.help().equals(open.getFirst().get("help")))throw conflict("这轮已按原帮助等级开始，请先完成、稍后或跳过。");return review(open.getFirst().get("id").toString());}
        int count=jdbc.queryForObject("SELECT count(*) FROM learner_reviews WHERE stage_id=?",Integer.class,w.stageId());
        String id=UUID.randomUUID().toString(),now=Instant.now().toString();
        jdbc.update("INSERT INTO learner_reviews(id,stage_id,variant,rule_version,status,help,created_at,due_at) VALUES(?,?,?,?,'open',?,?,?)",id,w.stageId(),count%2,RULE,w.help(),now,now);
        return review(id);
    }
    public record ReviewAnswer(Integer answer,String help) {}
    @PostMapping("/reviews/{id}/answer") @Transactional public synchronized Map<String,Object> answerReview(@PathVariable String id,@RequestBody ReviewAnswer w){
        var current=review(id);var q=ReviewQuestions.get(((Skill)current.get("skill")).stageId(),((Number)current.get("variant")).intValue());
        if(w.answer()==null||w.answer()<0||w.answer()>=q.options().size())throw ApiException.invalid("answer","请选择一道有效答案。");
        String help=w.help()==null?current.get("help").toString():w.help();var levels=List.of("none","hint","example");
        if(!levels.contains(help))throw ApiException.invalid("help","帮助等级无效。");
        if(!current.get("status").equals("open")){if(current.get("status").equals("completed")&&w.answer().equals(current.get("answer"))&&help.equals(current.get("help")))return current;throw conflict("这轮复习已结束，请开始新一轮。");}
        if(levels.indexOf(help)<levels.indexOf(current.get("help")))throw ApiException.invalid("help","已声明的帮助不能在提交时降级。");
        boolean pass=w.answer()==q.correct();int days=pass&&help.equals("none")?3:1;
        jdbc.update("UPDATE learner_reviews SET status='completed',help=?,answer=?,passed=?,finished_at=?,due_at=? WHERE id=? AND status='open'",help,w.answer(),pass?1:0,Instant.now().toString(),Instant.now().plus(Duration.ofDays(days)).toString(),id);
        return review(id);
    }
    public record ReviewDefer(String action) {}
    @PostMapping("/reviews/{id}/defer") @Transactional public synchronized Map<String,Object> deferReview(@PathVariable String id,@RequestBody ReviewDefer w){
        if(w.action()==null||!Set.of("later","skip").contains(w.action()))throw ApiException.invalid("action","请选择稍后或跳过。");
        var current=review(id);String status=w.action().equals("later")?"later":"skipped";
        if(current.get("status").equals(status))return current;
        if(!current.get("status").equals("open"))throw conflict("这轮已经结束。");
        jdbc.update("UPDATE learner_reviews SET status=?,finished_at=?,due_at=? WHERE id=? AND status='open'",status,Instant.now().toString(),Instant.now().plus(Duration.ofDays(status.equals("later")?1:7)).toString(),id);
        return review(id);
    }

    public record AdjustmentWrite(String kind,String courseId) {}
    private Map<String,Object> adjustment(String id){
        var rows=jdbc.queryForList("SELECT * FROM learner_adjustments WHERE id=?",id);
        if(rows.isEmpty())throw new ApiException(HttpStatus.NOT_FOUND,"ADJUSTMENT_NOT_FOUND","调整提案不存在。",Map.of());
        var r=new LinkedHashMap<>(rows.getFirst());boolean large=r.get("kind").equals("focus-course"),pause=r.get("kind").equals("pause-review");
        r.put("beforeMinutes",r.get("previous_minutes"));r.put("afterMinutes",pause?0:large?15:5);
        r.put("beforeFocus",r.get("previous_focus"));r.put("afterFocus",pause?"":large?r.get("course_id"):r.get("previous_focus"));
        r.put("reason",pause?"停止额外的每日复习安排，仍可主动选题。":large?"集中复查所选课程，复习列表优先呈现该课程；针对需要巩固的知识，也可主动选择。":"每天安排一题变式，观察概念保留，再继续课程。");
        r.put("impact","主线每日时长与先修规则保持当前设置；额外复习时间仅在接受后生效，可撤销。");
        return r;
    }
    @GetMapping("/adjustments") public List<Map<String,Object>> adjustments(){return jdbc.queryForList("SELECT id FROM learner_adjustments ORDER BY created_at DESC,id DESC LIMIT 30").stream().map(r->adjustment(r.get("id").toString())).toList();}
    @PostMapping("/adjustments") @Transactional public synchronized Map<String,Object> propose(@RequestBody AdjustmentWrite w){
        if(w.kind()==null||!Set.of("daily-review","focus-course","pause-review").contains(w.kind()))throw ApiException.invalid("kind","请选择每日复习、集中巩固或停止额外复习。");
        String course=Objects.toString(w.courseId(),"");
        if(w.kind().equals("focus-course")&&skills().stream().noneMatch(s->s.courseId().equals(course)))throw ApiException.invalid("courseId","请选择已发布课程。");
        var p=plan();String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO learner_adjustments(id,kind,course_id,status,expected_revision,previous_minutes,previous_focus,created_at) VALUES(?,?,?,'proposed',?,?,?,?)",id,w.kind(),course,p.get("revision"),p.get("review_minutes"),p.get("focus_course"),Instant.now().toString());
        return adjustment(id);
    }
    public record Decision(String action) {}
    @PostMapping("/adjustments/{id}/decision") @Transactional public synchronized Map<String,Object> decide(@PathVariable String id,@RequestBody Decision w){
        if(w.action()==null||!Set.of("accept","reject","undo").contains(w.action()))throw ApiException.invalid("action","请选择接受、拒绝或撤销。");
        var a=adjustment(id);String state=a.get("status").toString();var p=plan();long revision=((Number)p.get("revision")).longValue();
        if(w.action().equals("reject")){
            if(state.equals("rejected"))return a;if(!state.equals("proposed"))throw conflict("这项调整已处理。");
            jdbc.update("UPDATE learner_adjustments SET status='rejected' WHERE id=?",id);
        } else if(w.action().equals("accept")){
            if(state.equals("accepted"))return a;if(!state.equals("proposed"))throw conflict("这项提案不能再次接受。");
            if(revision!=((Number)a.get("expected_revision")).longValue())throw conflict("计划已有新变化，请重新生成提案查看差异。");
            jdbc.update("UPDATE learner_plan SET review_minutes=?,focus_course=?,revision=revision+1 WHERE id='local'",a.get("afterMinutes"),a.get("afterFocus"));
            jdbc.update("UPDATE learner_adjustments SET status='accepted',applied_revision=? WHERE id=?",revision+1,id);
        } else {
            if(state.equals("undone"))return a;if(!state.equals("accepted"))throw conflict("只有已接受的调整可以撤销。");
            if(revision!=((Number)a.get("applied_revision")).longValue())throw conflict("已有后续计划变化，不能用旧调整覆盖它。请生成新的提案。");
            jdbc.update("UPDATE learner_plan SET review_minutes=?,focus_course=?,revision=revision+1 WHERE id='local'",a.get("previous_minutes"),a.get("previous_focus"));
            jdbc.update("UPDATE learner_adjustments SET status='undone' WHERE id=?",id);
        }
        return adjustment(id);
    }
}

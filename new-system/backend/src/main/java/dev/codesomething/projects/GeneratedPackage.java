package dev.codesomething.projects;

import dev.codesomething.boot.BootProjectSnapshot;
import dev.codesomething.workspaces.WorkspaceController;
import java.nio.charset.StandardCharsets;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** A bounded compiler: provider prose cannot become commands, POMs, test code or filesystem paths. */
public final class GeneratedPackage {
    public static final String RULE="r6-1";
    public static final List<String> STAGES=List.of("read","validate","transfer");
    public static final String SOURCE="src/main/java/dev/codesomething/lab/";
    private static final JsonMapper JSON=JsonMapper.builder().build();
    public record Plan(String title,String resource,String itemTitle,String scenario){}
    public record Chapter(String id,String title,int minutes,List<String> dependsOn,List<String> teaching,List<String> requirements,List<String> tests,List<String> options,int answer,Map<String,String> starter,Map<String,String> reference){}
    public record Pack(String id,String version,String rule,Plan plan,String profileId,List<Map<String,Object>> sources,List<Chapter> chapters){}
    public static Plan parse(String output){
        var node=JSON.readTree(output.strip());
        if(!node.isObject()||node.size()!=4)throw new IllegalArgumentException("AI方案必须包含四个规定字段。");
        var plan=new Plan(ProjectController.text(node.path("title").asText(),"title",60),node.path("resource").asText(),ProjectController.text(node.path("itemTitle").asText(),"itemTitle",80),ProjectController.text(node.path("scenario").asText(),"scenario",600));
        if(!plan.resource().matches("[a-z]{4,24}")||Set.of("health","api").contains(plan.resource())||plan.scenario().length()<80)throw new IllegalArgumentException("题材方案的资源名或场景说明不符合生成范围。");return plan;
    }
    static String digest(Object value){return WorkspaceController.hash(JSON.writeValueAsString(value).getBytes(StandardCharsets.UTF_8));}
    static String literal(String value){return JSON.writeValueAsString(value);}
    public static List<String> tests(String stage){var tests=new ArrayList<>(List.of("read-json","missing-404","list-json"));if(!stage.equals("read"))tests.addAll(List.of("create-201","blank-400","type-400","missing-field-400","long-400","create-read"));if(stage.equals("transfer"))tests.add("resource-isolation");return List.copyOf(tests);}
    private static String scenario(Plan plan){return "围绕“"+plan.title()+"”实现个人记录接口。每条记录包含id（数字编号）、title（字符串标题）和completed（布尔完成状态），首条标题为“"+plan.itemTitle()+"”。第一关按编号和列表读取，未知编号返回404。第二关在写入内存前校验标题与布尔字段，新增成功返回201，错误输入返回400。第三关实现独立archive资源，验证两个集合互不影响。请求进入Controller后访问内存集合，返回值由Spring序列化为JSON。数据随进程重启清空。";}
    public static Pack compile(String id,Plan plan,String profile,List<Map<String,Object>> sources){
        // Provider prose is retained in the draft transcript. Published teaching is compiled from the executable contract.
        plan=new Plan(plan.title(),plan.resource(),plan.itemTitle(),scenario(plan));
        var chapters=new ArrayList<Chapter>();
        for(String stage:STAGES){boolean read=stage.equals("read"),transfer=stage.equals("transfer");
            String base="/api/"+(transfer?plan.resource()+"archive":plan.resource());
            var teaching=List.of(plan.scenario(),"请求进入Controller，路径变量选择编号。返回Map后由Spring转换为JSON，id为数字，title为字符串，completed为布尔值。未知编号用404和message说明原因。",read?"本关先把单条与列表读取打通，区别空列表和找不到单条。数据保存在内存，重启清空。":"新增时先核对title非空且去空白后不超过100字符，completed必须是布尔值；再分配编号写入内存。失败返回400，成功返回201。",transfer?"迁移到独立archive资源，不能改坏原资源。先写接口样例，再从最小启动类实现；用两个资源分别新增和读取，解释状态如何隔离。":"本项目只提供最小启动工程，所有章节在同一份代码上持续开发。亲手实现本章功能，保留前章代码，再运行并对照预期修正。功能通过后完成编码，选择题可选。");
            var requirements=new ArrayList<>(List.of("GET "+base+"/1 返回200及id=1、title="+plan.itemTitle()+"、completed=false","GET "+base+"/99999 返回404和非空message","GET "+base+" 返回JSON数组"));
            if(!read)requirements.add("POST "+base+" 接收title和completed，返回201；拒绝空标题、超过100字符、错误布尔类型或缺字段，返回400；新增后可按编号读取");
            if(transfer)requirements.add("原资源与archive资源分别保存数据，新增互不影响；说明请求到内存的数据流及重启清空的原因");
            var reference=files(plan,stage,false);var starter=files(plan,stage,true);
            chapters.add(new Chapter(stage,read?"读取题材资源":transfer?"独立迁移与资源隔离":"新增与输入校验",read?40:transfer?60:50,read?List.of():List.of(STAGES.get(STAGES.indexOf(stage)-1)),teaching,requirements,tests(stage),List.of("在写入前验证类型与内容，失败返回400；查不到单条返回404","只要请求能到达就返回200","先写入，失败后再修改响应状态"),0,starter,reference));
        }
        return new Pack(id,"1.0.0",RULE,plan,profile,sources,chapters);
    }
    public static void validate(Pack pack){
        if(pack==null||!RULE.equals(pack.rule())||!pack.id().matches("[a-f0-9-]{36}")||!pack.version().equals("1.0.0")||pack.sources().isEmpty())throw new IllegalArgumentException("课程标识、来源或规则缺失。");
        parse(JSON.writeValueAsString(pack.plan()));
        if(!scenario(pack.plan()).equals(pack.plan().scenario()))throw new IllegalArgumentException("教学场景与当前可执行契约不一致，请重新生成草稿。");
        if(!pack.chapters().stream().map(Chapter::id).toList().equals(STAGES))throw new IllegalArgumentException("关卡集合不正确。");
        var previous=new HashSet<String>();
        for(var c:pack.chapters()){
            if(c.dependsOn().stream().anyMatch(d->!previous.contains(d)))throw new IllegalArgumentException("先修存在循环、未知节点或倒置。");
            previous.add(c.id());
            if(!c.tests().equals(tests(c.id())))throw new IllegalArgumentException("测试缺少规定的正常与失败变式。");
            if(c.teaching().isEmpty()||!scenario(pack.plan()).equals(c.teaching().getFirst()))throw new IllegalArgumentException("讲解包含未核实的题材能力。");
            if(c.teaching().size()<4||c.teaching().stream().anyMatch(String::isBlank)||c.requirements().size()<3||c.options().size()!=3||c.answer()!=0||c.minutes()>60)throw new IllegalArgumentException("教学抽查未通过。");
            if(!c.reference().keySet().equals(files(pack.plan(),c.id(),false).keySet())||!c.starter().keySet().equals(c.reference().keySet()))throw new IllegalArgumentException("文件范围不正确。");
            if(!BootProjectSnapshot.trustedPom().equals(c.reference().get("pom.xml"))||!BootProjectSnapshot.trustedPom().equals(c.starter().get("pom.xml")))throw new IllegalArgumentException("构建依赖发生变化。");
        }
    }
    public static Map<String,String> files(Plan plan,String stage,boolean starter){
        String application="package dev.codesomething.lab;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n@SpringBootApplication public class Application { public static void main(String[] args){SpringApplication.run(Application.class,args);} }\n";
        String controller=starter?"package dev.codesomething.lab;\nimport org.springframework.web.bind.annotation.*;\n\n@RestController\npublic class ResourceController {\n    // TODO: 从本项目第一章开始，逐步实现读取、新增校验和资源扩展。\n}\n":controller(plan,stage,false);
        return Map.of("pom.xml",BootProjectSnapshot.trustedPom(),SOURCE+"Application.java",application,SOURCE+"ResourceController.java",controller);
    }
    private static String controller(Plan p,String stage,boolean starter){
        String code="package dev.codesomething.lab;\nimport java.util.*;\nimport org.springframework.web.bind.annotation.*;\nimport org.springframework.http.*;\n@RestController public class ResourceController {\n";
        code+=resource(p.resource(),p.itemTitle(),"main",!stage.equals("read"),starter);
        if(stage.equals("transfer"))code+=resource(p.resource()+"archive",p.itemTitle(),"archive",true,starter);
        return code+"}\n";
    }
    private static String resource(String resource,String title,String suffix,boolean create,boolean starter){
        String code="private final Map<Long,Map<String,Object>> "+suffix+" = new LinkedHashMap<>();\n{ "+suffix+".put(1L,Map.of(\"id\",1L,\"title\","+literal(title)+",\"completed\",false)); }\n";
        code+="@GetMapping(\"/api/"+resource+"\") public synchronized Object list"+suffix+"(){ return new ArrayList<>("+suffix+".values()); }\n";
        code+="@GetMapping(\"/api/"+resource+"/{id}\") public synchronized ResponseEntity<?> get"+suffix+"(@PathVariable long id){\n"+(starter?"// TODO: 找不到编号时返回404与message\nreturn ResponseEntity.ok(Map.of());\n":"var item="+suffix+".get(id); return item==null?ResponseEntity.status(404).body(Map.of(\"message\",\"未找到记录\")):ResponseEntity.ok(item);\n")+"}\n";
        if(create)code+="@PostMapping(\"/api/"+resource+"\") public synchronized ResponseEntity<?> create"+suffix+"(@RequestBody Map<String,Object> input){\n"+(starter?"// TODO: 类型与内容校验通过后分配编号并存入集合\nreturn ResponseEntity.badRequest().body(Map.of(\"message\",\"尚未实现\"));\n":"Object title=input.get(\"title\"), completed=input.get(\"completed\");\nif(!(title instanceof String)||((String)title).strip().isEmpty()||((String)title).strip().length()>100||!(completed instanceof Boolean)) return ResponseEntity.badRequest().body(Map.of(\"message\",\"标题与状态不合法\"));\nlong id="+suffix+".keySet().stream().mapToLong(Long::longValue).max().orElse(0)+1;\nvar item=Map.<String,Object>of(\"id\",id,\"title\",((String)title).strip(),\"completed\",completed); "+suffix+".put(id,item);return ResponseEntity.status(201).body(item);\n")+"}\n";
        return code;
    }
    public static Chapter chapter(Pack pack,String stage){return pack.chapters().stream().filter(c->c.id().equals(stage)).findFirst().orElseThrow(()->ProjectController.missing());}
}

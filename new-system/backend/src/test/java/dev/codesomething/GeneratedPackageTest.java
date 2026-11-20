package dev.codesomething;
import dev.codesomething.projects.GeneratedPackage;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class GeneratedPackageTest {
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void generatedRuntimeAcceptsOwnNamespaceAndArtifactAfterHttpReadiness(@org.junit.jupiter.api.io.TempDir java.nio.file.Path data)throws Exception {
        var p=pack();var chapter=p.chapters().getFirst();var files=new TreeMap<String,String>();
        for(var file:chapter.reference().entrySet()){
            String name=file.getKey().replace(GeneratedPackage.SOURCE,"src/main/java/com/example/library/").replace("/Application.java","/ReaderApplication.java");
            String content=file.getValue().replace("dev.codesomething.lab","com.example.library").replaceAll("\\bApplication\\b","ReaderApplication");
            if(name.equals("pom.xml"))content=content.replace("boot-lab","reading-project");files.put(name,content);
        }
        var runner=new dev.codesomething.projects.GeneratedRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.toString(),180);
        var result=runner.run(p,chapter.id(),files,()->false);assertEquals("passed",result.status(),result.toString());
        String root=System.getenv("CS_BOOT_EVIDENCE_DIRECTORY");if(root!=null){java.nio.file.Files.createDirectories(java.nio.file.Path.of(root));java.nio.file.Files.writeString(java.nio.file.Path.of(root).resolve("generated-own-package.json"),tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(result));}
    }
    static final GeneratedPackage.Plan PLAN=new GeneratedPackage.Plan("阅读书库","books","第一本书","这是个人阅读书库练习。用户希望通过接口查看自己的阅读记录，再新增一本书，验证输入并处理找不到记录的情况。请求通过路径和请求体进入控制器，内存集合保存记录，响应使用数字编号、字符串标题和布尔完成状态。重启会清空数据，需要学员解释这一行为与持久化数据库的区别。");
    GeneratedPackage.Pack pack(){return GeneratedPackage.compile(UUID.randomUUID().toString(),PLAN,"profile",List.of(Map.of("id","jdbc-guide")));}
    @Test void curriculumIncludesRunnableFilesAndDecreasingScaffolding(){var p=pack();GeneratedPackage.validate(p);assertEquals(3,p.chapters().size());assertEquals(150,p.chapters().stream().mapToInt(GeneratedPackage.Chapter::minutes).sum());assertTrue(p.chapters().get(2).starter().get(GeneratedPackage.SOURCE+"ResourceController.java").contains("TODO"));assertFalse(p.chapters().get(2).reference().get(GeneratedPackage.SOURCE+"ResourceController.java").contains("TODO"));}
    @Test void cyclicPrerequisitesAndIneffectiveTestsCannotPassStructuralGate(){var p=pack();var c=p.chapters().getFirst();var cyclic=new GeneratedPackage.Chapter(c.id(),c.title(),c.minutes(),List.of("transfer"),c.teaching(),c.requirements(),c.tests(),c.options(),c.answer(),c.starter(),c.reference());var list=new ArrayList<>(p.chapters());list.set(0,cyclic);assertThrows(IllegalArgumentException.class,()->GeneratedPackage.validate(new GeneratedPackage.Pack(p.id(),p.version(),p.rule(),p.plan(),p.profileId(),p.sources(),list)));var weak=new GeneratedPackage.Chapter(c.id(),c.title(),c.minutes(),c.dependsOn(),c.teaching(),c.requirements(),List.of("read-json"),c.options(),c.answer(),c.starter(),c.reference());list.set(0,weak);assertThrows(IllegalArgumentException.class,()->GeneratedPackage.validate(new GeneratedPackage.Pack(p.id(),p.version(),p.rule(),p.plan(),p.profileId(),p.sources(),list)));}
    @Test void providerCannotControlPathsDependenciesOrInjectJava(){assertThrows(Exception.class,()->GeneratedPackage.parse("{\"title\":\"x\",\"resource\":\"../../tmp\",\"itemTitle\":\"x\",\"scenario\":\"x\"}"));var hostile=new GeneratedPackage.Plan("标题","books","\"; Runtime.getRuntime(); //",PLAN.scenario());var p=GeneratedPackage.compile(UUID.randomUUID().toString(),hostile,"profile",List.of(Map.of("id","jdbc")));assertTrue(p.chapters().get(0).reference().get(GeneratedPackage.SOURCE+"ResourceController.java").contains("\\\"; Runtime.getRuntime(); //"));}
    @Test void publishedTeachingDescribesOnlyImplementedFieldsAndDataFlow(){var suggestion=new GeneratedPackage.Plan("阅读记录","books","第一本书",PLAN.scenario()+"作者字段、登录权限、数据库和服务层自动完成。");var p=GeneratedPackage.compile(UUID.randomUUID().toString(),suggestion,"profile",List.of(Map.of("id","jdbc")));assertFalse(p.plan().scenario().contains("作者字段"));assertFalse(p.chapters().getFirst().teaching().getFirst().contains("登录权限"));assertTrue(p.plan().scenario().contains("completed（布尔完成状态）"));assertTrue(p.plan().scenario().contains("数据随进程重启清空"));}
}

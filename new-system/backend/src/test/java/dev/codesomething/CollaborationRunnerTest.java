package dev.codesomething;
import dev.codesomething.boot.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class CollaborationRunnerTest {
    @TempDir Path data;
    static final String SOURCE=BootProjectSnapshot.SOURCE_DIRECTORY+"/";
    @Test void everyStageAcceptsReferenceAndRejectsItsSpecificBusinessMutation() throws Exception {
        for(String stage:BootCourses.COLLAB){
            if(System.getenv("CS_R7_STAGE_FILTER")!=null&&!stage.matches(System.getenv("CS_R7_STAGE_FILTER")))continue;
            Path reference=Path.of("../course-packs/collaboration/1.0.0/"+stage+"/reference").toAbsolutePath().normalize();
            var runner=new BootCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.resolve("jobs"),180);
            var positive=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(reference,true),"1.0.0",stage,()->false);
            evidence(stage+"-reference",positive);assertEquals("passed",positive.status(),stage+": "+positive);
            Path mutant=data.resolve(stage);try(var paths=Files.walk(reference)){for(Path path:paths.filter(Files::isRegularFile).toList()){Path to=mutant.resolve(reference.relativize(path));Files.createDirectories(to.getParent());Files.copy(path,to);}}
            String file=switch(stage){case "b-login","b-roles"->SOURCE+"AuthService.java";case "b-plans","b-pagination","b-transaction"->SOURCE+"PlanService.java";case "b-errors-logs"->SOURCE+"ApiErrors.java";case "b-tests"->"src/test/java/dev/codesomething/lab/BusinessTest.java";default->SOURCE+"DemoController.java";};
            Path path=mutant.resolve(file);String content=Files.readString(path).replace("\r\n","\n");
            String changed=switch(stage){
                case "b-login"->content.replace("db.update(\"DELETE FROM sessions WHERE token_hash=?\",hash(authorization.substring(7)))","db.update(\"DELETE FROM sessions WHERE token_hash=?\",\"wrong\")");
                case "b-roles"->content.replace("if (!member(u,plan))","if (false)");
                case "b-plans"->content.replace("title(input),user.id()","\"wrong\",user.id()");
                case "b-pagination"->content.replace("\"total\",total","\"total\",999");
                case "b-transaction"->content.replace("@Transactional\n    public Map<String,Object> batch","public Map<String,Object> batch");
                case "b-errors-logs"->content.replace("status(e.status)","status(200)");
                case "b-tests"->"package dev.codesomething.lab; import org.junit.jupiter.api.Test; public class BusinessTest { @Test void noBehavior() { org.junit.jupiter.api.Assertions.assertTrue(true); } }";
                default->content.replace("<form id=\"login-form\">","<form id=\"broken-login\">");
            };
            assertNotEquals(content,changed,"Mutation did not change source: "+stage);Files.writeString(path,changed);
            var negative=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(mutant,true),"1.0.0",stage,()->false);
            evidence(stage+"-mutant",negative);assertEquals("business_error",negative.status(),stage+": "+negative);
        }
    }
    static void evidence(String name,Object value)throws Exception{String directory=System.getenv("CS_R7_EVIDENCE_DIRECTORY");if(directory!=null){Path root=Path.of(directory);Files.createDirectories(root);Files.writeString(root.resolve(name+".json"),tools.jackson.databind.json.JsonMapper.builder().build().writerWithDefaultPrettyPrinter().writeValueAsString(value));}}
}

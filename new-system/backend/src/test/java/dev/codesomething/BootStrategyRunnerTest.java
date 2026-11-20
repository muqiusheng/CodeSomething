package dev.codesomething;
import dev.codesomething.boot.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class BootStrategyRunnerTest {
    @TempDir Path data;
    @Test void projectCompilerConfigurationCanEnableItsDeclaredLombokProcessorInsideTheSandbox() throws Exception {
        String pom=BootProjectSnapshot.trustedPom().replace("<maven.compiler.proc>none</maven.compiler.proc>","<maven.compiler.proc>full</maven.compiler.proc>").replace("</dependencies>","<dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><version>1.18.42</version><scope>provided</scope></dependency></dependencies>");
        var files=Map.of("pom.xml",pom,
            "src/main/java/com/example/OwnApplication.java","package com.example; @org.springframework.boot.autoconfigure.SpringBootApplication public class OwnApplication { public static void main(String[] args){org.springframework.boot.SpringApplication.run(OwnApplication.class,args);} }",
            "src/main/java/com/example/HealthController.java","package com.example; @org.springframework.web.bind.annotation.RestController public class HealthController { @lombok.Getter public static class Health { private final String status=\"ok\"; } @org.springframework.web.bind.annotation.GetMapping(\"/api/health\") public Health health(){return new Health();} }");
        var runner=new BootCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.resolve("jobs"),180);
        var result=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.fromFiles(files,false),"1.0.0","boot-start",()->false);evidence("own-compiler-lombok",result);assertEquals("passed",result.status(),result.toString());
    }
    @Test void initializrProjectUsesItsOwnBootVersionPackageStartupNameJarNameAndResources() throws Exception {
        var files=Map.of(
            "pom.xml", """
                <project><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.0.9</version><relativePath/></parent>
                <groupId>com.example</groupId><artifactId>learn-spboot</artifactId><version>0.0.1-SNAPSHOT</version><properties><java.version>21</java.version></properties>
                <dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency></dependencies>
                <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>
                """,
            "src/main/java/com/example/demo/LearnSpbootApplication.java","package com.example.demo; @org.springframework.boot.autoconfigure.SpringBootApplication public class LearnSpbootApplication { public static void main(String[] args){ org.springframework.boot.SpringApplication.run(LearnSpbootApplication.class,args); } }",
            "src/main/java/com/example/demo/controller/HealthController.java","package com.example.demo.controller; @org.springframework.web.bind.annotation.RestController public class HealthController { @org.springframework.beans.factory.annotation.Value(\"${check.status}\") String status; @org.springframework.web.bind.annotation.GetMapping(\"/api/health\") public java.util.Map<String,String> health(){return java.util.Map.of(\"status\",status);} }",
            "src/main/resources/application.properties","check.status=ok\n");
        var runner=new BootCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.resolve("jobs"),180);
        var result=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.fromFiles(files,false),"1.0.0","boot-start",()->false);
        evidence("initializr-own-project",result);assertEquals("passed",result.status(),result.toString());
        var changed=new java.util.HashMap<>(files);changed.put("src/main/resources/application.properties","check.status=wrong\n");
        var bad=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.fromFiles(changed,false),"1.0.0","boot-start",()->false);
        evidence("initializr-own-project-failure",bad);assertEquals("business_error",bad.status(),bad.toString());
        changed.put("src/main/resources/application.properties","some.other.property=unused\n");
        var startupFailure=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.fromFiles(changed,false),"1.0.0","boot-start",()->false);
        evidence("initializr-startup-failure",startupFailure);assertEquals("business_error",startupFailure.status(),startupFailure.toString());assertTrue(startupFailure.report().log().contains("check.status"));
    }
    @Test void eachPublishedStrategyAcceptsItsReferenceAndRejectsItsBehavioralMutant() throws Exception {
        for(String course:List.of("boot-foundations","task-manager"))for(String stage:BootCourses.stages(course)) {
            if(System.getenv("CS_BOOT_STAGE_FILTER")!=null&&!stage.matches(System.getenv("CS_BOOT_STAGE_FILTER")))continue;
            Path reference=Path.of("../course-packs/"+course+"/1.0.0/"+stage+"/reference").toAbsolutePath().normalize();
            var runner=new BootCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.resolve("jobs"),180);
            var result=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(reference,BootCourses.jdbc(stage)),"1.0.0",stage,()->false);
            evidence(stage+"-reference",result);
            assertEquals("passed",result.status(),stage+": "+result);
            Path mutant=data.resolve(stage);Files.createDirectories(mutant);
            try(var paths=Files.walk(reference)){for(var path:paths.filter(Files::isRegularFile).toList()){Path to=mutant.resolve(reference.relativize(path));Files.createDirectories(to.getParent());Files.copy(path,to);}}
            String filename=stage.equals("boot-start")?"HealthController":stage.equals("boot-http")?"EchoController":stage.equals("boot-layers")?"TaskService":"TaskController";
            Path source=mutant.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/"+filename+".java");
            String content=Files.readString(source);
            content=stage.equals("boot-start")?content.replace("\"ok\"","\"wrong\""):stage.equals("boot-http")?content.replace("status(201)","status(200)"):stage.equals("boot-layers")?content.replace("return repository.title();","return \"wrong\";"):content.replace("return service.get(resource,id);","throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,\"wrong\");");
            Files.writeString(source,content);
            var bad=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(mutant,BootCourses.jdbc(stage)),"1.0.0",stage,()->false);
            evidence(stage+"-mutant",bad);
            assertEquals("business_error",bad.status(),stage+": "+bad);
        }
    }
    static void evidence(String name,Object result) throws Exception {String root=System.getenv("CS_BOOT_EVIDENCE_DIRECTORY");if(root!=null){Files.createDirectories(Path.of(root));Files.writeString(Path.of(root).resolve(name+".json"),tools.jackson.databind.json.JsonMapper.builder().build().writerWithDefaultPrettyPrinter().writeValueAsString(result));}}
    @Test void jdbcLearnerCannotUseRemoteRootOrGlobalDdlOrExternalNetwork() throws Exception {
        Path reference=Path.of("../course-packs/boot-foundations/1.0.0/boot-jdbc/reference").toAbsolutePath().normalize(),project=data.resolve("isolation");Files.createDirectories(project);
        try(var paths=Files.walk(reference)){for(Path path:paths.filter(Files::isRegularFile).toList()){Path target=project.resolve(reference.relativize(path));Files.createDirectories(target.getParent());Files.copy(path,target);}}
        Path controller=project.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/TaskController.java");
        String guard="""
            try {Class.forName("com.mysql.cj.jdbc.Driver");
                String url=System.getenv("SPRING_DATASOURCE_URL");
                try(var connection=java.sql.DriverManager.getConnection(url,"root","")){throw new AssertionError("remote root allowed");}catch(java.sql.SQLException expected){}
                try(var connection=java.sql.DriverManager.getConnection(url,System.getenv("SPRING_DATASOURCE_USERNAME"),System.getenv("SPRING_DATASOURCE_PASSWORD"));var statement=connection.createStatement()){
                    try{statement.execute("CREATE DATABASE outside_scope");throw new AssertionError("global DDL allowed");}catch(java.sql.SQLException expected){}
                }
                try(var socket=new java.net.Socket()){socket.connect(new java.net.InetSocketAddress("1.1.1.1",53),500);throw new AssertionError("external network reachable");}catch(java.io.IOException expected){}
                System.out.println("ACCOUNT_ISOLATION_OK");
            } catch(java.sql.SQLException|ClassNotFoundException e){throw new IllegalStateException(e);}
            """;
        Files.writeString(controller,Files.readString(controller).replace("return service.get(resource,id);",guard+"return service.get(resource,id);"));
        var result=new BootCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.resolve("jobs"),180)
            .run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(project,true),"1.0.0","boot-jdbc",()->false);
        evidence("jdbc-account-isolation",result);assertEquals("passed",result.status(),result.toString());assertTrue(result.report().log().contains("ACCOUNT_ISOLATION_OK"));
    }
}

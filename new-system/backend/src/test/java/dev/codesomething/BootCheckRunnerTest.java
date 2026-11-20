package dev.codesomething;

import dev.codesomething.boot.*;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class BootCheckRunnerTest {
    @TempDir Path directory;
    final String docker="C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe";
    BootCheckRunner.Outcome run(Path root,int timeout,java.util.function.BooleanSupplier cancelled,String label) throws Exception {
        var result=new BootCheckRunner(docker,directory.resolve("jobs"),timeout)
            .run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(root),cancelled);
        String evidence=System.getenv("CS_BOOT_EVIDENCE_DIRECTORY");
        if(evidence!=null) {
            Files.createDirectories(Path.of(evidence));
            Files.writeString(Path.of(evidence).resolve(label+".json"),tools.jackson.databind.json.JsonMapper.builder().build().writerWithDefaultPrettyPrinter().writeValueAsString(result));
        }
        try(var files=Files.list(directory.resolve("jobs"))){assertEquals(0,files.count(),"临时输入必须清理");}
        return result;
    }
    Path starter() throws Exception {
        Path root=directory.resolve("project");
        var src=root.resolve(BootProjectSnapshot.SOURCE_DIRECTORY);
        Files.createDirectories(src);
        Files.writeString(root.resolve("pom.xml"),BootProjectSnapshot.trustedPom());
        for(String file:java.util.List.of("Application.java","HealthController.java"))
            Files.copy(Path.of("../runner/boot/starter").resolve(BootProjectSnapshot.SOURCE_DIRECTORY).resolve(file),src.resolve(file));
        return root;
    }
    @Test void cleanMultiFileBootProjectBuildsOfflineAndReturnsRealHealthResponse() throws Exception {
        var snapshot=BootProjectSnapshot.capture(starter());
        var result=run(directory.resolve("project"),120,()->false,"reference");
        assertEquals("passed",result.status(),result.toString());
        assertEquals(snapshot.digest(),result.report().snapshotDigest());
        assertTrue(result.report().functionalPassed());
        assertTrue(result.report().assertions().stream().anyMatch(a->a.name().contains("/api/health")&&a.passed()));
        try(var files=Files.list(directory.resolve("jobs"))){assertEquals(0,files.count());}
    }

    @Test void wrongHealthValueIsABusinessFailureAndInvalidJavaHasCompilationDiagnostics() throws Exception {
        Path project=starter(),controller=project.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/HealthController.java");
        Files.writeString(controller,Files.readString(controller).replace("new Health(\"ok\")","new Health(\"wrong\")"));
        var business=run(project,120,()->false,"wrong-health");
        assertEquals("business_error",business.status(),business.toString());
        assertFalse(business.report().functionalPassed());
        assertTrue(business.report().assertions().stream().anyMatch(a->!a.passed()&&a.actual().contains("wrong")));
        Files.writeString(controller,"package dev.codesomething.lab; public class HealthController { broken }");
        var compile=run(project,120,()->false,"compile-error");
        assertEquals("compile_error",compile.status(),compile.toString());
        assertTrue(compile.report().log().contains("HealthController.java"));
    }

    @Test void learnerCodeCannotWriteSourceOrDependencyCacheOrRootOrReachExternalNetwork() throws Exception {
        Path project=starter(),controller=project.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/HealthController.java");
        String guard="""
            for(String path:java.util.List.of("/input/project/pom.xml","/input/Probe.java","/etc/cs-write-test","/opt/repository/cs-write-test")) {
                try {java.nio.file.Files.writeString(java.nio.file.Path.of(path),"changed"); throw new AssertionError("writable: "+path);}
                catch(java.io.IOException expected) {}
            }
            try(var socket=new java.net.Socket()) {socket.connect(new java.net.InetSocketAddress("1.1.1.1",53),500);throw new AssertionError("network available");}
            catch(java.io.IOException expected) {}
            if(java.nio.file.Files.exists(java.nio.file.Path.of("/var/run/docker.sock")))throw new AssertionError("Docker socket exposed");
            System.out.println("BOOT_ISOLATION_OK");
            """;
        Files.writeString(controller,Files.readString(controller).replace("return new Health",guard+"return new Health"));
        var result=run(project,120,()->false,"isolation");
        assertEquals("passed",result.status(),result.toString());
        assertTrue(result.report().log().contains("BOOT_ISOLATION_OK"));
    }

    @Test void cancellingAndTimingOutCleanTheContainerAndTemporaryInput() throws Exception {
        Path project=starter();
        long started=System.nanoTime();
        var cancelled=run(project,120,()->System.nanoTime()-started>java.util.concurrent.TimeUnit.SECONDS.toNanos(3),"cancelled");
        assertEquals("cancelled",cancelled.status(),cancelled.toString());
        var controller=project.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/HealthController.java");
        Files.writeString(controller,Files.readString(controller).replace("return new Health", "try { Thread.sleep(60000); } catch(InterruptedException e) {Thread.currentThread().interrupt();} return new Health"));
        var timed=run(project,15,()->false,"timed-out");
        assertEquals("timed_out",timed.status(),timed.toString());
        assertTrue(timed.report().assertions().stream().anyMatch(a->a.name().equals("离线Maven构建")&&a.passed()),"超时应覆盖构建后的运行阶段");
    }

    @Test void unavailableDockerIsAnEnvironmentFailureAndInvalidJobIdIsRejected() throws Exception {
        var snapshot=BootProjectSnapshot.capture(starter());
        var runner=new BootCheckRunner(directory.resolve("missing-docker.exe").toString(),directory.resolve("jobs"),30);
        assertThrows(IllegalArgumentException.class,()->runner.run("../outside",snapshot,()->false));
        var result=runner.run(UUID.randomUUID().toString(),snapshot,()->false);
        assertEquals("environment_error",result.status(),result.toString());
        assertFalse(result.report().functionalPassed());
        try(var files=Files.list(directory.resolve("jobs"))){assertEquals(0,files.count());}
    }

    @Test void aContainerNameCollisionPreservesTheOtherRunsContainer() throws Exception {
        String id=UUID.randomUUID().toString(),name="cs-r331-"+id;
        String image=tools.jackson.databind.json.JsonMapper.builder().build()
            .readTree(BootCheckRunner.class.getResourceAsStream("/runner/boot/image-lock.json")).path("image").asText();
        var create=new ProcessBuilder(docker,"create","--name",name,"--label=codesomething.boot-owner=other-run","--network=none",image,"sleep","30")
            .redirectErrorStream(true).start();
        String output=new String(create.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(0,create.waitFor(),output);
        try {
            var snapshot=BootProjectSnapshot.capture(starter());
            var result=new BootCheckRunner(docker,directory.resolve("jobs"),30).run(id,snapshot,()->false);
            assertEquals("environment_error",result.status(),result.toString());
            var inspect=new ProcessBuilder(docker,"inspect",name).redirectErrorStream(true).start();
            inspect.getInputStream().readAllBytes();
            assertEquals(0,inspect.waitFor(),"冲突时必须保留另一运行的容器");
        } finally {
            var remove=new ProcessBuilder(docker,"rm","-f",name).redirectErrorStream(true).start();
            remove.getInputStream().readAllBytes();assertEquals(0,remove.waitFor());
        }
    }
}

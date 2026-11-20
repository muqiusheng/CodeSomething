package dev.codesomething;

import dev.codesomething.boot.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class ProbeEnvironmentTest {
    @TempDir Path root;
    @Test void preparedEnvironmentReusesReadOnlyCompiledProbesAndHonorsCancellation() throws Exception {
        String docker="C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe";
        String base;
        try(var in=getClass().getResourceAsStream("/runner/boot/image-lock.json")) {
            base=tools.jackson.databind.json.JsonMapper.builder().build().readTree(in.readAllBytes()).path("image").asText();
        }
        var snapshot=BootProjectSnapshot.fromFiles(Map.of("pom.xml",BootProjectSnapshot.trustedPom(),
            "src/main/java/example/Application.java","package example; public class Application {}"),false);
        String image=MavenBuildEnvironment.prepare(docker,root,snapshot,false,base,()->false);
        var process=new ProcessBuilder(docker,"run","--rm","--pull=never","--network=none","--read-only",
            "--user=65534:65534",image,"sh","-c",
            "test -r /opt/codesomething-probes/BootProbe.class && test -r /opt/codesomething-probes/Probe.class && test -r /opt/codesomething-probes/R7Probe.class && test -r /opt/codesomething-probes/WaitForHttp.class && test ! -w /opt/codesomething-probes/BootProbe.class")
            .redirectErrorStream(true).start();
        assertTrue(process.waitFor(30,TimeUnit.SECONDS));
        assertEquals(0,process.exitValue(),new String(process.getInputStream().readAllBytes()));
        assertEquals(image,MavenBuildEnvironment.prepare(docker,root,snapshot,false,base,()->false));
        assertThrows(InterruptedException.class,()->MavenBuildEnvironment.prepare(docker,root,snapshot,false,base,()->true));
        try(var files=Files.list(root)){assertEquals(0,files.count(),"Preparation inputs must be removed");}
    }
}

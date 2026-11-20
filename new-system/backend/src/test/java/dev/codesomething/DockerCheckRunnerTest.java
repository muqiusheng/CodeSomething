package dev.codesomething;

import dev.codesomething.workspaces.*;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class DockerCheckRunnerTest {
    @TempDir Path directory;
    DockerCheckRunner runner(int timeout){return new DockerCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",directory.toString(),timeout);}
    DockerCheckRunner.Outcome run(String source,String stage,String policy,int timeout,java.util.function.BooleanSupplier cancel) {
        byte[] bytes=source.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return runner(timeout).run(UUID.randomUUID().toString(),bytes,WorkspaceController.hash(bytes),"1.1.0",stage,policy,cancel);
    }
    String starter() throws Exception {return Files.readString(Path.of("../course-packs/http-json-basics/1.1.0/TaskServer.java"));}
    String fixed() throws Exception {
        String source=starter().replace("\"completed\":\"false\"","\"completed\":false");
        int last=source.lastIndexOf("status = 200;");
        return source.substring(0,last)+source.substring(last).replaceFirst("status = 200;","status = 404;");
    }
    @Test void trailingJsonObjectsAreRejectedRatherThanReadingOnlyTheFirstObject() throws Exception {
        var outcome=run(fixed().replace("\"completed\":false}","\"completed\":false} {}"),"fix-response","task-json-v1",45,()->false);
        assertEquals("business_error",outcome.status(),outcome.report().toString());
    }
    @Test void learnerProcessCannotWriteMountedSourceOrRootFilesystemOrReachExternalNetwork() throws Exception {
        String guard="""
            try { java.nio.file.Files.writeString(java.nio.file.Path.of("/input/TaskServer.java"),"changed"); throw new AssertionError("source writable"); } catch(java.io.IOException expected) {}
            try { java.nio.file.Files.writeString(java.nio.file.Path.of("/etc/cs-write-test"),"changed"); throw new AssertionError("root writable"); } catch(java.io.IOException expected) {}
            try(var socket=new java.net.Socket()) { socket.connect(new java.net.InetSocketAddress("1.1.1.1",53),500); throw new AssertionError("external network available"); } catch(java.io.IOException expected) {}
            if(java.nio.file.Files.exists(java.nio.file.Path.of("/var/run/docker.sock"))) throw new AssertionError("docker socket exposed");
            System.out.println("ISOLATION_OK");
            """;
        var outcome=run(fixed().replace("var server =",guard+"var server ="),"fix-response","task-json-v1",45,()->false);
        assertEquals("passed",outcome.status(),outcome.report().toString());
        assertTrue(outcome.report().log().contains("ISOLATION_OK"));
    }
    @Test void invalidJavaHasCompilationDiagnostics() {
        var outcome=run("public class TaskServer { broken }","fix-response","task-json-v1",45,()->false);
        assertEquals("compile_error",outcome.status(),outcome.report().log());assertTrue(outcome.report().log().contains("TaskServer.java"));
    }
    @Test void starterRunsButFailsBusinessContract() throws Exception {
        var outcome=run(starter(),"fix-response","task-json-v1",45,()->false);
        assertEquals("business_error",outcome.status(),outcome.report().toString());
        assertTrue(outcome.report().assertions().stream().anyMatch(a->a.name().contains("JSON字段")&&!a.passed()));
    }
    @Test void smokeCheckAcceptsTheIntentionallyUnfixedStarter() throws Exception {
        var outcome=run(starter(),"run-server","server-smoke-v1",45,()->false);assertEquals("passed",outcome.status(),outcome.report().toString());
        assertTrue(outcome.report().assertions().stream().anyMatch(a->a.name().equals("GET /api/tasks/1")&&a.actual().contains("学习 HTTP")&&a.actual().contains("Content-Type:")),"Smoke results must retain the actual response for the learner's project preview");
    }
    @Test void correctedTaskAndTransferredNotesPassTheirOwnContract() throws Exception {
        String source=starter().replace("\"completed\":\"false\"","\"completed\":false");
        int last=source.lastIndexOf("status = 200;");source=source.substring(0,last)+source.substring(last).replaceFirst("status = 200;","status = 404;");
        var task=run(source,"fix-response","task-json-v1",45,()->false);assertEquals("passed",task.status(),task.report().toString());
        var notes=run(source.replace("/api/tasks/","/api/notes/").replace("学习 HTTP","第一条笔记").replace("completed","archived"),"transfer","notes-json-v1",45,()->false);
        assertEquals("passed",notes.status(),notes.report().toString());
    }
    @Test void blockingProgramTimesOutAndCancellationStopsRunningWork() {
        String source="public class TaskServer { public static void main(String[] a) { while(true){} } }";
        var timed=run(source,"fix-response","task-json-v1",5,()->false);assertEquals("timed_out",timed.status(),timed.report().toString());
        long start=System.nanoTime();var cancelled=run(source,"fix-response","task-json-v1",45,()->System.nanoTime()-start>java.util.concurrent.TimeUnit.SECONDS.toNanos(3));
        assertEquals("cancelled",cancelled.status(),cancelled.report().toString());
        try(var files=Files.list(directory.resolve("runner"))){assertEquals(0,files.count());}catch(Exception e){fail(e);}
    }
}

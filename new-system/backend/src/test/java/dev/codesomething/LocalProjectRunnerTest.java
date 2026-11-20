package dev.codesomething;

import dev.codesomething.workspaces.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class LocalProjectRunnerTest {
    @TempDir Path data;
    @Test void consoleCheckValidatesRealStandardOutputAndNormalExit() {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",20);
        String prefix="package com.example.task; public class TaskServer { public static void main(String[] args) {";
        var valid=runner.runHttp("first",(prefix+"System.out.println(\"你好，Java！\"); }}").getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.1.0","workspace","console-output-v1",()->false);
        assertEquals("passed",valid.status(),valid.toString());
        assertTrue(valid.report().assertions().stream().anyMatch(a->a.actual().contains("你好，Java！")));
        for(String body:List.of("", "System.err.println(\"你好，Java！\");", "System.out.println(\"你好，Java！\");System.exit(1);")) {
            var failed=runner.runHttp("first",(prefix+body+"}}").getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.1.0","workspace","console-output-v1",()->false);
            assertEquals("business_error",failed.status(),failed.toString());
        }
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_LOCAL_TESTS",matches="true")
    void realMavenProjectBuildsWithOriginalPomAndUsesSameChapterChecks() throws Exception {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"D:/Download/apache-maven-3.9.14",120,
            "../runtime/maven-repository","../tooling/maven-settings.xml");
        var snapshot=dev.codesomething.boot.BootProjectSnapshot.capture(Path.of("../course-packs/boot-foundations/1.0.0/boot-http/reference").toAbsolutePath());
        long start=System.nanoTime();
        var good=runner.runBoot("boot-http",snapshot,"1.0.0","boot-http",()->false);
        System.out.println("LOCAL_BOOT_HTTP_SECONDS="+(System.nanoTime()-start)/1e9);
        assertEquals("passed",good.status(),good.toString());
        var files=new TreeMap<String,String>();for(var f:snapshot.files())files.put(f.path(),f.content());
        files.replaceAll((path,text)->path.endsWith("EchoController.java")?text.replace("status(201)","status(200)"):text);
        var bad=runner.runBoot("boot-http",dev.codesomething.boot.BootProjectSnapshot.fromFiles(files,false),"1.0.0","boot-http",()->false);
        System.out.println("LOCAL_BOOT_HTTP_PAIR_SECONDS="+(System.nanoTime()-start)/1e9);
        assertEquals("business_error",bad.status(),bad.toString());
        assertFalse(bad.report().functionalPassed());
        runner.close();
    }
    @Test void localHttpUsesCurrentSourceAndRejectsBusinessAndCompilationErrors() throws Exception {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",90);
        String source=Files.readString(Path.of("../course-packs/http-json-basics/1.0.0/TaskServer.java"));
        var good=runner.runHttp("same-project",source.getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.0.0","fix-response","task-json-v1",()->false);
        assertEquals("business_error",good.status(),good.toString());
        String fixed=source.replace("\"completed\":\"false\"","\"completed\":false").replace("status = 200;\n                body", "status = 404;\n                body");
        var passed=runner.runHttp("same-project",fixed.getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.0.0","fix-response","task-json-v1",()->false);
        assertEquals("passed",passed.status(),passed.toString());
        var invalid=runner.runHttp("same-project","public class TaskServer { broken }".getBytes(),"1.0.0","fix-response","task-json-v1",()->false);
        assertEquals("compile_error",invalid.status(),invalid.toString());
        assertFalse(invalid.report().functionalPassed());
        assertEquals(WorkspaceController.hash("public class TaskServer { broken }".getBytes()),invalid.report().snapshotDigest());
    }
    @Test void cancelledOrBrokenCodeNeverFallsBackButMissingJdkDoes() {
        var runner=new LocalProjectRunner(data.toString(),data.resolve("missing-jdk").toString(),"",30);
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        java.util.function.Supplier<LocalProjectRunner.Outcome> backup=()->{calls.incrementAndGet();return new LocalProjectRunner.Outcome("environment_error",new CheckReport("d","v","s","p","backup","h",false,List.of(),"backup unavailable",java.time.Instant.now().toString()));};
        var cancelled=LocalFirstCheck.run(()->runner.runHttp("p","invalid".getBytes(),"v","s","p",()->true),backup);
        assertEquals("cancelled",cancelled.status());assertEquals(0,calls.get());
        var unavailable=LocalFirstCheck.run(()->runner.runHttp("p","invalid".getBytes(),"v","s","p",()->false),backup);
        assertEquals("environment_error",unavailable.status());assertEquals(1,calls.get());
        assertTrue(unavailable.report().log().contains("本机JDK不可用"));
        for(String status:List.of("compile_error","business_error","timed_out")) {
            LocalFirstCheck.run(()->new LocalProjectRunner.Outcome(status,unavailable.report()),backup);
            assertEquals(1,calls.get());
        }
    }
    @Test void packagedHttpSourceRunsLocallyAndEmptyClassReportsMissingEntryPoint() throws Exception {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",30);
        String packageLine="package com.example.task;\n";
        String source=packageLine+Files.readString(Path.of("../course-packs/http-json-basics/1.0.0/TaskServer.java"));
        var empty=LocalFirstCheck.run(()->runner.runHttp("packaged",(packageLine+"public class TaskServer {}").getBytes(),"1.0.0","run-server","server-smoke-v1",()->false),
            ()->{throw new AssertionError("Compiled source with no main must not fall back to Docker");});
        assertEquals("business_error",empty.status(),empty.toString());
        assertTrue(empty.report().log().contains("public static void main"),empty.toString());
        for(int run=0;run<2;run++) {
            var outcome=runner.runHttp("packaged",source.getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.0.0","run-server","server-smoke-v1",()->false);
            assertEquals("passed",outcome.status(),outcome.toString());
            assertTrue(outcome.report().image().startsWith("local-jdk:"));
        }
    }
    @Test void cancellationStopsOnlyTheProcessCreatedForThisCheck() throws Exception {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",30);
        var cancel=new java.util.concurrent.atomic.AtomicBoolean();
        String source="public class TaskServer { public static void main(String[] args)throws Exception {Thread.sleep(60000);} }";
        try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var task=executor.submit(()->runner.runHttp("cancel",source.getBytes(),"v","s","task-json-v1",cancel::get));
            long until=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
            Path receipt=data.resolve("local-runner").resolve(WorkspaceController.hash("cancel".getBytes())).resolve("process.json");
            while((!Files.exists(receipt)||!Files.exists(receipt.resolveSibling("server.log")))&&System.nanoTime()<until)Thread.sleep(50);
            assertTrue(Files.exists(receipt));cancel.set(true);
            assertEquals("cancelled",task.get(10,java.util.concurrent.TimeUnit.SECONDS).status());
            assertFalse(Files.exists(receipt));
        } finally {runner.close();}
    }
    @Test void normalConsoleExitDoesNotPassAnHttpCheckAndExplainsTheMissingService() {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",30);
        String source="public class TaskServer { public static void main(String[] args) {System.out.println(\"今天我写出了第一个程序\");} }";
        var outcome=runner.runHttp("console",source.getBytes(java.nio.charset.StandardCharsets.UTF_8),"1.1.0","run-server","server-smoke-v1",()->false);
        assertEquals("business_error",outcome.status(),outcome.toString());
        assertFalse(outcome.report().functionalPassed());
        assertTrue(outcome.report().assertions().stream().anyMatch(a->!a.passed()&&a.actual().contains("正常退出")),outcome.toString());
        assertTrue(outcome.report().log().contains("今天我写出了第一个程序"));
    }
    @Test void occupiedLearnerPortIsPreservedAndStartupFailureIsReportedAsBusinessFailure()throws Exception {
        var runner=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"",30);
        String source="public class TaskServer { public static void main(String[] args) {throw new IllegalStateException(\"own-startup-failure\");} }";
        try(var socket=new java.net.ServerSocket()) {
            socket.bind(new java.net.InetSocketAddress("127.0.0.1",8080));
            var busy=runner.runHttp("busy",source.getBytes(),"v","s","task-json-v1",()->false);
            assertEquals("local_unavailable",busy.status());assertFalse(socket.isClosed());
        }
        var failed=runner.runHttp("busy",source.getBytes(),"v","s","task-json-v1",()->false);
        assertEquals("business_error",failed.status());assertTrue(failed.report().log().contains("own-startup-failure"));
        runner.close();
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
    void unavailableNativeJdkFallsBackToRealIsolatedCheck()throws Exception {
        var local=new LocalProjectRunner(data.toString(),data.resolve("missing-jdk").toString(),"",60);
        var docker=new DockerCheckRunner("C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe",data.toString(),90);
        byte[] source=("package com.example.task;\n"+Files.readString(Path.of("../course-packs/http-json-basics/1.0.0/TaskServer.java"))
            .replace("\"completed\":\"false\"","\"completed\":false").replace("status = 200;\n                body","status = 404;\n                body")).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var result=LocalFirstCheck.run(()->local.runHttp("fallback",source,"1.0.0","fix-response","task-json-v1",()->false),()->{
            var backup=docker.run(UUID.randomUUID().toString(),source,WorkspaceController.hash(source),"1.0.0","fix-response","task-json-v1",()->false);
            return new LocalProjectRunner.Outcome(backup.status(),backup.report());
        });
        assertEquals("passed",result.status(),result.toString());assertEquals(DockerCheckRunner.IMAGE,result.report().image());
        assertTrue(result.report().log().contains("本机JDK不可用"));assertEquals(WorkspaceController.hash(source),result.report().snapshotDigest());
    }
    @Test @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="CS_RUN_LOCAL_TESTS",matches="true")
    void generatedProjectUsesNativeChecksForReferenceAndBusinessMutant()throws Exception {
        var local=new LocalProjectRunner(data.toString(),System.getProperty("java.home"),"D:/Download/apache-maven-3.9.14",120,"../runtime/maven-repository","../tooling/maven-settings.xml");
        var generated=new dev.codesomething.projects.GeneratedRunner("missing-docker",data.toString(),120);
        generated.configureLocal(local,true);
        var pack=new GeneratedPackageTest().pack();var chapter=pack.chapters().getFirst();
        var good=generated.run(pack,chapter.id(),chapter.reference(),()->false);
        assertEquals("passed",good.status(),good.toString());assertTrue(good.report().image().startsWith("local-jdk:"));
        var mutant=new TreeMap<>(chapter.reference());
        mutant.replaceAll((path,text)->path.endsWith(".java")?text.replace(pack.plan().itemTitle(),"错误标题"):text);
        var bad=generated.run(pack,chapter.id(),mutant,()->false);
        assertEquals("business_error",bad.status(),bad.toString());
        local.close();
    }
}


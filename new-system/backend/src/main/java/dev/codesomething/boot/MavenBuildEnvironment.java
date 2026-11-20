package dev.codesomething.boot;

import dev.codesomething.workspaces.WorkspaceController;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

/** Resolve declared dependencies in a source-free container, then run learner code offline. */
public final class MavenBuildEnvironment {
    private MavenBuildEnvironment() {}
    public static final String READINESS_SOURCE="""
        import java.net.URI;
        import java.net.http.*;
        import java.nio.file.*;
        import java.time.Duration;
        class WaitForHttp {
            public static void main(String[] args) throws Exception {
                long pid=Long.parseLong(Files.readString(Path.of("/tmp/server.pid")).strip());
                long until=System.nanoTime()+Duration.ofSeconds(30).toNanos();
                var client=HttpClient.newBuilder().connectTimeout(Duration.ofMillis(500)).build();
                while(System.nanoTime()<until) {
                    if(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)==false)throw new IllegalStateException("Application process exited before readiness");
                    try {
                        var response=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/api/health")).timeout(Duration.ofSeconds(2)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
                        response.body().close();return;
                    } catch(java.io.IOException e){Thread.sleep(100);}
                }
                throw new IllegalStateException("Application did not become HTTP-ready within 30 seconds");
            }
        }
        """;
    public static final String START_JAR="set -- target/*.jar; if [ \"$#\" -ne 1 ] || [ ! -f \"$1\" ]; then echo '需要且只能生成一个可运行JAR，请检查pom.xml的打包配置' > /tmp/server.log; exit 1; fi; echo $$ > /tmp/server.pid; exec java -Xmx192m -XX:ActiveProcessorCount=1 -jar \"$1\" --server.port=8080 --server.address=127.0.0.1 > /tmp/server.log 2>&1";
    public static String prepare(String docker,Path root,BootProjectSnapshot snapshot,boolean jdbc,String baseImage,BooleanSupplier cancelled) throws Exception {
        if(cancelled.getAsBoolean())throw new InterruptedException("依赖准备已取消。");
        Files.createDirectories(root);
        String dependencies=prepareDependencies(docker,root,snapshot,jdbc,baseImage,cancelled);
        return prepareProbes(docker,root,dependencies,cancelled);
    }
    /** Only platform resources enter this cache; learner sources are never compiled here. */
    private static String prepareProbes(String docker,Path root,String image,BooleanSupplier cancelled) throws Exception {
        var sources=new TreeMap<String,String>();
        for(String resource:List.of("/runner/Probe.java","/runner/boot/BootProbe.java","/runner/collaboration/R7Probe.java")) {
            try(var in=MavenBuildEnvironment.class.getResourceAsStream(resource)) {
                sources.put(resource.substring(resource.lastIndexOf('/')+1),new String(Objects.requireNonNull(in).readAllBytes(),StandardCharsets.UTF_8));
            }
        }
        sources.put("WaitForHttp.java",READINESS_SOURCE);
        String key=WorkspaceController.hash((image+sources+"compiled-probes-v1").getBytes(StandardCharsets.UTF_8));
        String tag="codesomething-compiled-probes:"+key;
        var cached=command(docker,30,cancelled,"image","inspect","--format={{.Id}}",tag);
        if(cached.code==0&&cached.output.strip().matches("sha256:[a-f0-9]{64}"))return cached.output.strip();
        Files.createDirectories(root);
        Path context=Files.createTempDirectory(root,"probe-preparation-");
        String name="cs-probe-preparation-"+UUID.randomUUID();
        try {
            for(var source:sources.entrySet())Files.writeString(context.resolve(source.getKey()),source.getValue(),StandardCharsets.UTF_8);
            var created=command(docker,30,cancelled,"create","--name",name,"--pull=never","--network=none",
                "--cpus=1","--memory=256m","--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges","--user=0:0",
                "--mount","type=bind,source="+context+",target=/input,readonly",image,"sh","-c",
                "mkdir -p /opt/codesomething-probes && javac -J-Xmx128m -J-XX:ActiveProcessorCount=1 -proc:none -encoding UTF-8 -d /opt/codesomething-probes /input/*.java && chmod -R a+rX /opt/codesomething-probes");
            if(created.code!=0)throw new IOException(created.output);
            var compiled=command(docker,60,cancelled,"start","--attach",name);
            var state=command(docker,30,cancelled,"inspect","--format={{.State.ExitCode}}",name);
            if(compiled.code!=0||state.code!=0||!state.output.strip().equals("0"))throw new IOException("平台检查程序准备失败："+compiled.output);
            var committed=command(docker,60,cancelled,"commit","--change","USER 65534:65534","--change","WORKDIR /tmp","--change","CMD [\"sleep\",\"240\"]",name,tag);
            if(committed.code!=0)throw new IOException(committed.output);
            return committed.output.strip();
        } finally {
            try {command(docker,30,()->false,"rm","-f",name);}
            finally {try(var paths=Files.walk(context)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(path);}}
        }
    }
    private static String prepareDependencies(String docker,Path root,BootProjectSnapshot snapshot,boolean jdbc,String baseImage,BooleanSupplier cancelled) throws Exception {
        dev.codesomething.workspaces.CheckProgress.update("preparing","正在准备项目依赖与运行环境",1);
        String pom=snapshot.files().stream().filter(f->f.path().equals("pom.xml")).findFirst().orElseThrow().content();
        String dependencies=MavenProjectConfig.parse(pom).dependencyPom();
        if(dependencies.equals(MavenProjectConfig.parse(BootProjectSnapshot.trustedPom(jdbc)).dependencyPom()))return baseImage;
        String key=WorkspaceController.hash((baseImage+dependencies+"maven-cache-v1").getBytes(StandardCharsets.UTF_8)),tag="codesomething-project-dependencies:"+key;
        var found=command(docker,30,cancelled,"image","inspect","--format={{.Id}}",tag);
        if(found.code==0&&found.output.strip().matches("sha256:[a-f0-9]{64}"))return found.output.strip();
        Files.createDirectories(root);Path context=Files.createTempDirectory(root,"dependency-preparation-");
        try {
            Files.writeString(context.resolve("pom.xml"),dependencies,StandardCharsets.UTF_8);
            Files.createDirectories(context.resolve("src/main/java"));
            Files.writeString(context.resolve("src/main/java/DependencyPreparation.java"),"public class DependencyPreparation { public static void main(String[] args) {} }");
            if(dependencies.contains("junit-jupiter")||dependencies.contains("spring-boot-starter-test")){Files.createDirectories(context.resolve("src/test/java"));Files.writeString(context.resolve("src/test/java/DependencyPreparationTest.java"),"public class DependencyPreparationTest { @org.junit.jupiter.api.Test void cachedProvider() {} }");}
            String name="cs-dependency-preparation-"+UUID.randomUUID();
            try {
                var created=command(docker,30,cancelled,"create","--name",name,"--label=codesomething.dependency-preparation="+key,"--pull=never","--network=bridge","--cpus=1","--memory=1024m","--pids-limit=256","--cap-drop=ALL","--security-opt=no-new-privileges","--user=0:0","--mount","type=bind,source="+context+",target=/input,readonly","--workdir=/tmp",baseImage,"sh","-c","cp -R /input /tmp/dependency-preparation && cd /tmp/dependency-preparation && sh /opt/maven/bin/mvn -B -ntp -s /opt/settings.xml -Dmaven.repo.local=/opt/repository -Dmaven.compiler.proc=none test package && chmod -R a+rX /opt/repository");
                if(created.code!=0)throw new IOException(created.output);
                var built=command(docker,420,cancelled,"start","--attach",name);
                var state=command(docker,30,cancelled,"inspect","--format={{.State.ExitCode}}",name);
                if(built.code!=0||!state.output.strip().equals("0"))throw new IOException("工程依赖准备失败，请检查pom.xml依赖版本或网络后重试：\n"+built.output);
                var committed=command(docker,60,cancelled,"commit","--change","USER 65534:65534","--change","WORKDIR /tmp","--change","CMD [\"sleep\",\"240\"]",name,tag);
                if(committed.code!=0)throw new IOException(committed.output);
            } finally {command(docker,30,()->false,"rm","-f",name);}
            var image=command(docker,30,cancelled,"image","inspect","--format={{.Id}}",tag);
            if(image.code!=0||!image.output.strip().matches("sha256:[a-f0-9]{64}"))throw new IOException("无法确认工程依赖镜像。");
            return image.output.strip();
        } finally {try(var paths=Files.walk(context)){for(Path file:paths.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(file);}}
    }
    private record Result(int code,String output) {}
    private static Result command(String docker,int seconds,BooleanSupplier cancelled,String... args)throws Exception {
        if(cancelled.getAsBoolean())throw new InterruptedException("依赖准备已取消。");
        var argv=new ArrayList<String>();argv.add(docker);argv.addAll(List.of(args));
        var process=new ProcessBuilder(argv).redirectErrorStream(true).start();var output=new ByteArrayOutputStream();
        Thread reader=Thread.ofVirtual().start(()->{try(var in=process.getInputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)synchronized(output){if(output.size()+n>32768){byte[] previous=output.toByteArray();output.reset();output.write(previous,Math.max(0,previous.length-16384),Math.min(16384,previous.length));}output.write(buffer,0,n);}}catch(IOException ignored){}});
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
        try {while(!process.waitFor(100,TimeUnit.MILLISECONDS)){if(cancelled.getAsBoolean())throw new InterruptedException("依赖准备已取消。");if(System.nanoTime()>deadline)throw new IOException("首次工程依赖准备超时，请检查网络后重试。");}reader.join(2000);synchronized(output){return new Result(process.exitValue(),output.toString(StandardCharsets.UTF_8));}}
        finally {if(process.isAlive())process.destroyForcibly();}
    }
}

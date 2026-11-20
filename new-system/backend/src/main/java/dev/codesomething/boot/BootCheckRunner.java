package dev.codesomething.boot;

import dev.codesomething.workspaces.CheckReport;
import dev.codesomething.workspaces.WorkspaceController;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import tools.jackson.databind.json.JsonMapper;

/** Standalone R3.3.1 execution seam; not yet registered as a published course or completion policy. */
public final class BootCheckRunner {
    private final String docker;
    private final Path root;
    private final int timeout;
    private final JsonMapper json=JsonMapper.builder().build();
    public record Outcome(String status, CheckReport report) {}
    private record Command(int exit,String output) {}
    private static class Stopped extends Exception {
        final String status;
        Stopped(String status){this.status=status;}
    }
    public BootCheckRunner(String docker,Path root,int timeout) {
        this.docker=docker;this.root=root.toAbsolutePath().normalize();this.timeout=Math.clamp(timeout,5,180);
    }
    private Command command(long deadline,BooleanSupplier cancelled,String... args) throws Exception {
        dev.codesomething.workspaces.CheckProgress.command(List.of(args));
        if(cancelled.getAsBoolean())throw new Stopped("cancelled");
        if(System.nanoTime()>deadline)throw new Stopped("timed_out");
        var argv=new ArrayList<String>();argv.add(docker);argv.addAll(List.of(args));
        var process=new ProcessBuilder(argv).redirectErrorStream(true).start();
        var bytes=new ByteArrayOutputStream();
        Thread reader=Thread.ofVirtual().start(()->{
            try(var in=process.getInputStream()) {
                byte[] buffer=new byte[2048];int count;
                while((count=in.read(buffer))!=-1) synchronized(bytes) {
                    int room=32768-bytes.size();if(room>0)bytes.write(buffer,0,Math.min(count,room));
                }
            } catch(IOException ignored){}
        });
        try {
            while(!process.waitFor(50,TimeUnit.MILLISECONDS)) {
                if(cancelled.getAsBoolean())throw new Stopped("cancelled");
                if(System.nanoTime()>deadline)throw new Stopped("timed_out");
            }
            reader.join(1000);
            synchronized(bytes){return new Command(process.exitValue(),bytes.toString(StandardCharsets.UTF_8));}
        } finally {if(process.isAlive())process.destroyForcibly();}
    }
    private static void require(Command result) throws IOException {
        if(result.exit()!=0)throw new IOException(result.output());
    }
    public Outcome run(String id,BootProjectSnapshot snapshot,BooleanSupplier cancelled) {
        // Validate before any filesystem operation or container removal.
        if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException("Expected a canonical job UUID");
        String name="cs-r331-"+id,owner=UUID.randomUUID().toString(),status="environment_error",log="",image="",harnessDigest="";
        Path input=root.resolve(id);boolean inputCreated=false,createAttempted=false;
        var checks=new ArrayList<CheckReport.Assertion>();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try {
            if(cancelled.getAsBoolean())throw new Stopped("cancelled");
            byte[] lock,probe;
            try(var in=getClass().getResourceAsStream("/runner/boot/image-lock.json")) {lock=Objects.requireNonNull(in,"Boot image lock is missing").readAllBytes();}
            var environment=json.readTree(lock);image=environment.path("image").asText();
            if(!image.matches("sha256:[a-f0-9]{64}"))throw new IOException("Boot image must use a full content-addressed ID");
            if(!WorkspaceController.hash(BootProjectSnapshot.trustedPom().getBytes(StandardCharsets.UTF_8)).equals(environment.path("pomDigest").asText()))
                throw new IOException("Boot image and fixed POM do not match; rebuild the runner image");
            image=MavenBuildEnvironment.prepare(docker,root,snapshot,false,image,cancelled);
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
            try(var in=getClass().getResourceAsStream("/runner/Probe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            harnessDigest=WorkspaceController.hash((WorkspaceController.hash(probe)+WorkspaceController.hash(lock)+WorkspaceController.hash(MavenBuildEnvironment.READINESS_SOURCE.getBytes(StandardCharsets.UTF_8))+"boot-health-v1").getBytes(StandardCharsets.UTF_8));
            Files.createDirectories(root);Files.createDirectory(input);inputCreated=true;
            for(var file:snapshot.files()) {
                Path target=input.resolve("project").resolve(file.path());
                Files.createDirectories(target.getParent());Files.writeString(target,file.content(),StandardCharsets.UTF_8);
            }
            Files.write(input.resolve("Probe.java"),probe);
            Files.writeString(input.resolve("WaitForHttp.java"),MavenBuildEnvironment.READINESS_SOURCE);
            createAttempted=true;
            require(command(deadline,cancelled,"create","--name",name,"--label=codesomething.boot-owner="+owner,"--pull=never","--network=none","--read-only",
                "--cpus=1","--memory=640m","--memory-swap=640m","--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges",
                "--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777",
                "--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp",
                "--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp",image,"sleep","240"));
            require(command(deadline,cancelled,"start",name));
            require(command(deadline,cancelled,"exec",name,"cp","-R","/input/project","/tmp/project"));
            var compile=command(deadline,cancelled,"exec","--workdir=/tmp/project",name,"sh","/opt/maven/bin/mvn",
                "-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository","-DskipTests","package");
            checks.add(new CheckReport.Assertion("离线Maven构建",compile.exit()==0,"固定依赖、Java21多文件构建成功",compile.output()));
            if(compile.exit()!=0) {
                status=compile.output().contains("COMPILATION ERROR")||compile.output().contains("Unable to find main class")?"compile_error":"environment_error";
                log=compile.output();
            } else {
                require(command(deadline,cancelled,"exec","--workdir=/tmp/project","-d",name,"sh","-c",
                    MavenBuildEnvironment.START_JAR));
                require(command(deadline,cancelled,"exec",name,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","WaitForHttp"));
                var response=command(deadline,cancelled,"exec",name,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","Probe","/api/health");
                boolean valid=false;String actual=response.output();
                if(response.exit()==0) {
                    var lines=response.output().split("\\R",-1);
                    if(lines.length<3)throw new IOException("Boot HTTP probe output is incomplete");
                    String type=new String(Base64.getDecoder().decode(lines[1]),StandardCharsets.UTF_8);
                    String body=new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8);
                    actual="HTTP "+lines[0]+"; "+type+"; "+body;
                    try {
                        var value=json.readTree(body);
                        valid="200".equals(lines[0])&&type.toLowerCase(Locale.ROOT).split(";")[0].trim().equals("application/json")
                            &&value.isObject()&&value.path("status").isString()&&"ok".equals(value.path("status").asText());
                    } catch(RuntimeException ignored){}
                }
                checks.add(new CheckReport.Assertion("GET /api/health",valid,"HTTP 200，application/json，status为字符串ok",actual));
                status=valid?"passed":"business_error";
                var logs=command(deadline,cancelled,"exec",name,"head","-c","8192","/tmp/server.log");
                require(logs);log=logs.output();
            }
        } catch(InterruptedException e){status="cancelled";log=e.getMessage();}
        catch(Stopped e){status=e.status;log="cancelled".equals(status)?"Boot检查已取消。":"Boot检查超出"+timeout+"秒限制。";}
        catch(Exception e){status="environment_error";log=e.getClass().getSimpleName()+": "+e.getMessage();}
        finally {
            if(createAttempted)try {
                long cleanupDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
                var inspected=command(cleanupDeadline,()->false,"inspect","--format={{json .Config.Labels}}",name);
                if(inspected.exit()==0) {
                    if(owner.equals(json.readTree(inspected.output()).path("codesomething.boot-owner").asText()))
                        require(command(cleanupDeadline,()->false,"rm","-f",name));
                } else if(!inspected.output().contains("No such"))throw new IOException(inspected.output());
            } catch(Exception e){status="environment_error";log+="\nBoot容器清理失败："+e.getMessage();}
            if(inputCreated)try(var paths=Files.walk(input)) {
                for(Path file:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(file);
            } catch(IOException e){status="environment_error";log+="\nBoot临时输入清理失败："+e.getMessage();}
        }
        return new Outcome(status,new CheckReport(snapshot.digest(),"draft-r331","boot-start","boot-health-v1",image,harnessDigest,
            "passed".equals(status),List.copyOf(checks),log.substring(0,Math.min(log.length(),8192)),Instant.now().toString()));
    }
    public Outcome run(String id,BootProjectSnapshot snapshot,String version,String stage,BooleanSupplier cancelled) {
        if(BootCourses.COLLAB.contains(stage))return new CollaborationRunner(docker,root,timeout).run(id,snapshot,version,stage,cancelled);
        return new BootProjectRunner(docker,root,timeout).run(id,snapshot,version,stage,cancelled);
    }
}

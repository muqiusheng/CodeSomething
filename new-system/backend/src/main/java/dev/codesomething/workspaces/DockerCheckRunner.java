package dev.codesomething.workspaces;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class DockerCheckRunner {
    public static final String IMAGE="eclipse-temurin@sha256:4b1a74fbffbe6b4e7b6f0171a472478282fb463790a51edf10e465d578f22b69";
    private final String docker;
    private final Path root;
    private final int timeout;
    private final JsonMapper json=JsonMapper.builder().build();
    public DockerCheckRunner(@Value("${cs.runner.docker:C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe}") String docker,
        @Value("${cs.data-directory}") String data, @Value("${cs.runner.timeout-seconds:45}") int timeout) {
        this.docker=docker;this.root=Path.of(data).toAbsolutePath().normalize().resolve("runner");this.timeout=Math.clamp(timeout,5,120);
    }
    public record Outcome(String status,CheckReport report) {}
    private record Command(int exit,String output) {}
    private static class Stopped extends Exception {final String status;Stopped(String status){this.status=status;}}
    public static String containerName(String id) {return "cs-r23-"+id;}
    public void cleanup(String id) throws Exception {
        var result=docker(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"rm","-f",containerName(id));
        if(result.exit()!=0&&!result.output().contains("No such container"))throw new IOException(result.output());
    }
    private Command command(List<String> args,long deadline,BooleanSupplier cancelled) throws Exception {
        var process=new ProcessBuilder(args).redirectErrorStream(true).start();
        var bytes=new ByteArrayOutputStream();
        Thread reader=Thread.ofVirtual().start(()->{try(var in=process.getInputStream()){
            byte[] buffer=new byte[2048];int n;while((n=in.read(buffer))!=-1){synchronized(bytes){int room=32768-bytes.size();if(room>0)bytes.write(buffer,0,Math.min(n,room));}}
        }catch(IOException ignored){}});
        try {
            while(!process.waitFor(100,TimeUnit.MILLISECONDS)) {
                if(cancelled.getAsBoolean())throw new Stopped("cancelled");
                if(System.nanoTime()>deadline)throw new Stopped("timed_out");
            }
            reader.join(1000);synchronized(bytes){return new Command(process.exitValue(),bytes.toString(StandardCharsets.UTF_8));}
        } finally {if(process.isAlive())process.destroyForcibly();}
    }
    private Command docker(long deadline,BooleanSupplier cancelled,String... args) throws Exception {
        CheckProgress.command(List.of(args));
        var list=new ArrayList<String>();list.add(docker);list.addAll(List.of(args));return command(list,deadline,cancelled);
    }
    private static void require(Command command) throws IOException {if(command.exit()!=0)throw new IOException(command.output());}
    public Outcome run(String id,byte[] source,String digest,String version,String stage,String policy,BooleanSupplier cancelled) {
        if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException("Invalid job ID");
        int hardTimeout = Math.min(timeout, 30);
        String status="environment_error", log="", harnessDigest="";
        String timeoutLog="检查超出"+hardTimeout+"秒限制。";
        var checks=new ArrayList<CheckReport.Assertion>();
        Path input=root.resolve(id);long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(hardTimeout);
        try {
            if(cancelled.getAsBoolean())throw new Stopped("cancelled");
            Files.createDirectories(input);
            byte[] probe;try(var in=getClass().getResourceAsStream("/runner/Probe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            harnessDigest=WorkspaceController.hash(probe);
            Files.write(input.resolve("TaskServer.java"),source);Files.write(input.resolve("Probe.java"),probe);
            var create=docker(deadline,cancelled,"create","--name",containerName(id),"--label=codesomething.check-job="+id,
                "--label="+dev.codesomething.admin.RunnerInventory.scopeLabel(root.getParent()),"--pull=never","--network=none","--read-only",
                "--cpus=1","--memory=512m","--memory-swap=512m","--pids-limit=64","--cap-drop=ALL","--security-opt=no-new-privileges",
                "--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777",
                "--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp",IMAGE,"sleep",Integer.toString(hardTimeout));
            require(create);require(docker(deadline,cancelled,"start",containerName(id)));
            var compile=docker(deadline,cancelled,"exec",containerName(id),"javac","-J-Xmx96m","-proc:none","--release","21","--add-modules","jdk.httpserver","-encoding","UTF-8","-d","/tmp/classes","/input/TaskServer.java");
            if(compile.exit()!=0) {
                require(docker(deadline,cancelled,"inspect","--format","{{.State.Running}}",containerName(id)));
                status=compile.exit()==1?"compile_error":"environment_error";log=compile.output();
                checks.add(new CheckReport.Assertion("编译",false,"JDK21编译成功",log));
            } else {
                checks.add(new CheckReport.Assertion("编译",true,"JDK21编译成功","编译成功"));
                var artifacts=docker(deadline,cancelled,"exec",containerName(id),"find","/tmp/classes","-type","f","-name","TaskServer.class");
                require(artifacts);
                if(artifacts.output().isBlank()) {
                    status="compile_error";
                    log="TaskServer.java 需要声明一个名为 TaskServer 的顶层类。";
                    checks.add(new CheckReport.Assertion("启动类",false,"声明 TaskServer 顶层类",log));
                } else {
                    String artifact=artifacts.output().lines().findFirst().orElseThrow();
                    String mainClass=LocalProjectRunner.httpMainClass(artifact.substring("/tmp/classes/".length()));
                    if(ConsoleOutputCheck.POLICY.equals(policy)) {
                        CheckProgress.update("starting","正在隔离运行 TaskServer.main",3);
                        String jobTimeoutLog=timeoutLog;
                        timeoutLog="控制台程序未在运行时限内退出。";
                        var execution=docker(Math.min(deadline,System.nanoTime()+TimeUnit.SECONDS.toNanos(10)),cancelled,"exec",containerName(id),"sh","-c","exec java -Xmx96m -cp /tmp/classes \"$1\" 2>/tmp/console.err","java",mainClass);
                        timeoutLog=jobTimeoutLog;
                        require(docker(deadline,cancelled,"inspect","--format","{{.State.Running}}",containerName(id)));
                        CheckProgress.update("checking","正在核对控制台输出和退出状态",4);
                        status=ConsoleOutputCheck.verify(execution.exit(),execution.output(),checks);
                        log=LocalProjectRunner.httpStartupLog(docker(deadline,cancelled,"exec",containerName(id),"head","-c","4096","/tmp/console.err").output());
                    } else {
                    require(docker(deadline,cancelled,"exec","-d",containerName(id),"sh","-c","exec java -Xmx96m -XX:ActiveProcessorCount=1 --add-modules jdk.httpserver -cp /tmp/classes \"$1\" > /tmp/server.log 2>&1","java",mainClass));
                    String base="notes-json-v1".equals(policy)?"/api/notes/":"/api/tasks/";
                    boolean smoke="server-smoke-v1".equals(policy);
                    boolean text=HttpCourseChecks.TEXT_POLICY.equals(policy);
                    for(int number=1;number<=(text?1:2);number++) {
                        var response=docker(deadline,cancelled,"exec",containerName(id),"java","-Xmx64m","-XX:ActiveProcessorCount=1","/input/Probe.java",base+number);
                        if(response.exit()!=0) {
                            require(docker(deadline,cancelled,"inspect","--format","{{.State.Running}}",containerName(id)));
                            checks.add(new CheckReport.Assertion("GET "+base+number,false,"服务在8080端口响应",response.output()));continue;
                        }
                        var lines=response.output().split("\\R",-1);
                        if(lines.length<3)throw new IOException("检查探针输出不完整");
                        int code=Integer.parseInt(lines[0]);String type=new String(Base64.getDecoder().decode(lines[1]),StandardCharsets.UTF_8);
                        String body=new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8);
                        if(text){HttpCourseChecks.verifyText(code,type,body,checks);continue;}
                        if(smoke){checks.add(new CheckReport.Assertion("GET "+base+number,true,"收到HTTP响应","HTTP "+code+"\nContent-Type: "+type+"\n\n"+body));continue;}
                        int expected=number==1?200:404;
                        checks.add(new CheckReport.Assertion("GET "+base+number+" 状态码",code==expected,"HTTP "+expected,"HTTP "+code));
                        checks.add(new CheckReport.Assertion("GET "+base+number+" 内容类型",type.toLowerCase(Locale.ROOT).split(";")[0].trim().equals("application/json"),"application/json",type));
                        try {
                            var value=json.readTree(body);boolean valid;
                            if(number==1) {
                                String field=base.contains("notes")?"archived":"completed",title=base.contains("notes")?"第一条笔记":"学习 HTTP";
                                valid=value.isObject()&&value.path("id").isNumber()&&value.path("id").decimalValue().compareTo(java.math.BigDecimal.ONE)==0
                                    &&value.path("title").isString()&&title.equals(value.path("title").asText())&&value.path(field).isBoolean()&&!value.path(field).asBoolean();
                            } else valid=value.isObject()&&value.path("message").isString()&&!value.path("message").asText().isBlank();
                            checks.add(new CheckReport.Assertion("GET "+base+number+" JSON字段",valid,number==1?(base.contains("notes")?"id=数字1，title=第一条笔记，archived=布尔值false":"id=数字1，title=学习 HTTP，completed=布尔值false"):"message为非空字符串",body));
                        } catch(RuntimeException e){checks.add(new CheckReport.Assertion("JSON语法",false,"有效JSON对象",body));}
                    }
                    status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";
                    var logs=docker(deadline,cancelled,"exec",containerName(id),"head","-c","8192","/tmp/server.log");require(logs);log=LocalProjectRunner.httpStartupLog(logs.output());
                    }
                }
            }
        } catch(Stopped e){status=e.status;log="cancelled".equals(status)?"检查已取消。":timeoutLog;
            try {docker(System.nanoTime()+TimeUnit.SECONDS.toNanos(3),()->false,"kill",containerName(id));} catch(Exception ignored) { /* Cleanup also forcibly removes the container. */ }}
        catch(Exception e){status="environment_error";log=e.getClass().getSimpleName()+": "+e.getMessage();}
        finally {
            try{cleanup(id);}catch(Exception e){status="environment_error";log+="\n容器清理失败："+e.getMessage();}
            try {Files.deleteIfExists(input.resolve("TaskServer.java"));Files.deleteIfExists(input.resolve("Probe.java"));Files.deleteIfExists(input);}catch(IOException e){status="environment_error";log+="\n临时快照清理失败。";}
        }
        return new Outcome(status,new CheckReport(digest,version,stage,policy,IMAGE,harnessDigest,"passed".equals(status),checks,
            log.substring(0,Math.min(log.length(),8192)),Instant.now().toString()));
    }
}

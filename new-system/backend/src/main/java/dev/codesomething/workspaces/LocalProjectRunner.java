package dev.codesomething.workspaces;

import dev.codesomething.boot.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Native execution for the owner's submitted snapshots. No learner IDE process is reused or stopped. */
@Component
public class LocalProjectRunner {
    @org.springframework.beans.factory.annotation.Value("${cs.runner.mode:local_first}") private String runnerMode;
    private final Path root,javaHome,mavenHome,repository,settings;
    private final int timeout;
    private final JsonMapper json=JsonMapper.builder().build();
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    public record Outcome(String status,CheckReport report) {}
    public record Response(int status,String type,String text) {
        public tools.jackson.databind.JsonNode body(){try{return JsonMapper.builder().build().readTree(text);}catch(Exception e){return JsonMapper.builder().build().readTree("null");}}
        public boolean json(int expected){return status==expected&&type.toLowerCase(Locale.ROOT).split(";")[0].strip().equals("application/json");}
    }
    @FunctionalInterface public interface Request {Response call(String method,String path,String body)throws Exception;}
    @FunctionalInterface public interface Verification {void check(Request request,List<CheckReport.Assertion> checks)throws Exception;}
    private record Command(int exit,String output) {}
    private static class Stop extends Exception {final String status;Stop(String status){this.status=status;}}
    private final java.util.concurrent.ConcurrentMap<Long,Process> running=new java.util.concurrent.ConcurrentHashMap<>();
    private volatile boolean closing;
    public LocalProjectRunner(String data,String javaHome,String mavenHome,int timeout) {this(data,javaHome,mavenHome,timeout,"","");}
    @Autowired
    public LocalProjectRunner(@Value("${cs.data-directory}")String data,
        @Value("${cs.runner.local-java-home:${java.home}}")String javaHome,
        @Value("${cs.runner.local-maven-home:}")String mavenHome,
        @Value("${cs.runner.local-timeout-seconds:120}")int timeout,
        @Value("${cs.runner.local-repository:}")String repository,
        @Value("${cs.runner.local-settings:}")String settings) {
        Path dataPath=Path.of(data).toAbsolutePath().normalize();root=dataPath.resolve("local-runner");
        this.javaHome=Path.of(javaHome);this.mavenHome=Path.of(mavenHome.isBlank()?Objects.toString(System.getenv("CS_MAVEN_HOME"),"D:/Download/apache-maven-3.9.14"):mavenHome);
        Path userMaven=Path.of(System.getProperty("user.home"),".m2");
        this.repository=repository.isBlank()?(Files.isDirectory(userMaven.resolve("repository"))?userMaven.resolve("repository"):dataPath.getParent().resolve("maven-repository")):Path.of(repository).toAbsolutePath();
        this.settings=settings.isBlank()?(Files.isDirectory(userMaven.resolve("repository"))?userMaven.resolve("settings.xml"):dataPath.getParent().getParent().resolve("tooling/maven-settings.xml")):Path.of(settings).toAbsolutePath();
        this.timeout=Math.clamp(timeout,5,420);
    }
    @jakarta.annotation.PreDestroy public void close() {closing=true;for(var process:running.values())stop(process);}
    @jakarta.annotation.PostConstruct public void recover() throws IOException {
        if("docker_only".equals(runnerMode)||!Files.isDirectory(root))return;
        try(var folders=Files.list(root)){for(Path work:folders.filter(p->p.getFileName().toString().matches("[a-f0-9]{64}")&&Files.isDirectory(p,LinkOption.NOFOLLOW_LINKS)).toList())recover(work);}
    }
    private void recover(Path work)throws IOException {
        Path receipt=work.resolve("process.json");if(!Files.isRegularFile(receipt,LinkOption.NOFOLLOW_LINKS))return;
        try {
            var record=json.readTree(Files.readString(receipt));
            ProcessHandle.of(record.path("pid").asLong()).ifPresent(process->{
                var info=process.info();
                boolean owned=info.startInstant().map(i->i.toString().equals(record.path("started").asText())).orElse(false)
                    &&Arrays.stream(info.arguments().orElse(new String[0])).anyMatch(a->a.contains(work.toString()));
                if(owned){for(var child:process.descendants().toList().reversed())child.destroyForcibly();process.destroyForcibly();}
            });
        } catch(Exception e){Files.writeString(work.resolve("recovery-error.log"),e.toString());}
        finally {Files.deleteIfExists(receipt);}
    }
    private void track(Path work,Process process)throws IOException {
        running.put(process.pid(),process);
        Files.writeString(work.resolve("process.json"),json.writeValueAsString(Map.of("pid",process.pid(),"started",process.info().startInstant().map(Instant::toString).orElse(""))));
    }
    private void forget(Path work,Process process)throws IOException {running.remove(process.pid());Files.deleteIfExists(work.resolve("process.json"));}
    private String binary(String name){return javaHome.resolve("bin/"+name+(System.getProperty("os.name").startsWith("Windows")?".exe":"")).toString();}
    private static void stop(Process process) {
        var children=process.descendants().toList();
        for(var child:children.reversed())child.destroyForcibly();
        process.destroyForcibly();
        try{process.waitFor(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
    }
    private void guard(long end,BooleanSupplier cancelled)throws Stop {
        if(closing||cancelled.getAsBoolean()||Thread.currentThread().isInterrupted())throw new Stop("cancelled");
        if(System.nanoTime()>end)throw new Stop("timed_out");
    }
    private Command command(Path directory,long end,BooleanSupplier cancelled,List<String> args)throws Exception {
        guard(end,cancelled);
        Path output=directory.resolve("build.log");
        var process=new ProcessBuilder(args).directory(directory.toFile()).redirectErrorStream(true).redirectOutput(output.toFile()).start();
        try {track(directory,process);while(!process.waitFor(75,TimeUnit.MILLISECONDS))guard(end,cancelled);guard(end,cancelled);return new Command(process.exitValue(),read(output,32768));}
        finally {if(process.isAlive())stop(process);forget(directory,process);}
    }
    private static String read(Path path,int limit)throws IOException {
        if(!Files.isRegularFile(path))return "";
        try(var file=new RandomAccessFile(path.toFile(),"r")){file.seek(Math.max(0,file.length()-limit));byte[] bytes=new byte[(int)Math.min(limit,file.length())];file.readFully(bytes);return new String(bytes,StandardCharsets.UTF_8);}
    }
    private Response request(int port,String method,String path,String body,long end,BooleanSupplier cancelled)throws Exception {
        guard(end,cancelled);
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(2)).header("Content-Type","application/json")
            .method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
        byte[] bytes;try(var in=response.body()){bytes=in.readNBytes(16385);}
        if(bytes.length>16384)throw new IOException("接口响应超过16KiB。");
        return new Response(response.statusCode(),response.headers().firstValue("Content-Type").orElse(""),new String(bytes,StandardCharsets.UTF_8));
    }
    private static void clear(Path folder)throws IOException {
        if(!Files.exists(folder,LinkOption.NOFOLLOW_LINKS))return;
        try(var paths=Files.walk(folder)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}
    }
    private static Path httpArtifact(Path classes)throws IOException {
        if(!Files.isDirectory(classes))return null;
        try(var files=Files.find(classes,Integer.MAX_VALUE,
            (path,attributes)->attributes.isRegularFile()&&path.getFileName().toString().equals("TaskServer.class"))) {
            return files.findFirst().orElse(null);
        }
    }
    static String httpMainClass(String classPath) {
        return classPath.substring(0,classPath.length()-".class".length()).replace('\\','.').replace('/','.');
    }
    static String httpStartupLog(String log) {
        if(log.lines().anyMatch(line->line.equals("   public static void main(String[] args)")))
            return "TaskServer 缺少启动入口。请添加 public static void main(String[] args) 并在其中启动 HTTP 服务。\n"+log;
        return log;
    }
    private List<String> maven(Path work)throws IOException {
        if(!Files.isRegularFile(mavenHome.resolve("bin/m2.conf")))throw new IOException("本机Maven不可用："+mavenHome);
        Path launcher;try(var paths=Files.list(mavenHome.resolve("boot"))){launcher=paths.filter(p->p.getFileName().toString().matches("plexus-classworlds-.*\\.jar")).findFirst().orElseThrow();}
        var args=new ArrayList<>(List.of(binary("java"),"-Xmx256m","-Dmaven.home="+mavenHome,"-Dmaven.multiModuleProjectDirectory="+work,
            "-Dclassworlds.conf="+mavenHome.resolve("bin/m2.conf"),"-cp",launcher.toString(),"org.codehaus.plexus.classworlds.launcher.Launcher","-B","-ntp","-Dmaven.repo.local="+repository,"-DskipTests","package"));
        if(Files.isRegularFile(settings))args.addAll(List.of("-s",settings.toString()));
        return args;
    }
    public synchronized Outcome runHttp(String scope,byte[] source,String version,String stage,String policy,BooleanSupplier cancelled) {
        if ("docker_only".equals(runnerMode)) throw new IllegalStateException("Host execution is disabled");
        return execute(scope,Map.of("TaskServer.java",new String(source,StandardCharsets.UTF_8)),WorkspaceController.hash(source),version,stage,policy,false,cancelled,
            (request,checks)->HttpCourseChecks.verify(policy,request,checks));
    }
    public synchronized Outcome runBoot(String scope,BootProjectSnapshot snapshot,String version,String stage,BooleanSupplier cancelled) {
        if ("docker_only".equals(runnerMode)) throw new IllegalStateException("Host execution is disabled");
        if(BootCourses.jdbc(stage))return unavailable(snapshot.digest(),version,stage,BootCourses.policy(stage),"本章需要临时数据库和隔离验证。");
        var files=new TreeMap<String,String>();for(var source:snapshot.files())files.put(source.path(),source.content());
        return execute(scope,files,snapshot.digest(),version,stage,BootCourses.policy(stage),true,cancelled,
            (request,checks)->BootHttpChecks.verify(stage,request,checks));
    }
    public synchronized Outcome runProject(String scope,Map<String,String> files,String digest,String version,String stage,String policy,BooleanSupplier cancelled,Verification verifier) {
        if ("docker_only".equals(runnerMode)) throw new IllegalStateException("Host execution is disabled");
        try {BootProjectSnapshot.fromFiles(files,false);}
        catch(IllegalArgumentException e){return result("compile_error",digest,version,stage,policy,"local-jdk",List.of(),e.getMessage());}
        return execute(scope,files,digest,version,stage,policy,true,cancelled,verifier);
    }
    private Outcome unavailable(String digest,String version,String stage,String policy,String log) {
        return new Outcome("local_unavailable",new CheckReport(digest,version,stage,policy,"local-jdk","local-v1",false,List.of(),log,Instant.now().toString()));
    }
    private Outcome execute(String scope,Map<String,String> files,String digest,String version,String stage,String policy,boolean boot,BooleanSupplier cancelled,Verification verifier) {
        String status="environment_error",log="",environment="local-jdk:"+System.getProperty("java.version");
        Path work=root.resolve(WorkspaceController.hash(scope.getBytes(StandardCharsets.UTF_8)));Process application=null;
        var checks=new ArrayList<CheckReport.Assertion>();long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try {
            guard(end,cancelled);CheckProgress.update("preparing","正在使用本机JDK与构建缓存",1);
            if(!Files.isRegularFile(Path.of(binary("javac"))))return unavailable(digest,version,stage,policy,"本机JDK不可用："+javaHome);
            Files.createDirectories(work);recover(work);
            // Replace only a private snapshot. Clear target on changed inputs so deleted classes/resources cannot survive.
            String previous=Files.exists(work.resolve("snapshot.digest"))?Files.readString(work.resolve("snapshot.digest")):"";
            String cacheKey=digest+"|"+javaHome+"|"+System.getProperty("java.version")+"|local-v1";
            boolean same=previous.equals(cacheKey);
            if(!same){clear(work.resolve("src"));clear(work.resolve("target"));clear(work.resolve("classes"));Files.deleteIfExists(work.resolve("snapshot.digest"));}
            for(var file:files.entrySet()) {
                if(!(file.getKey().equals("TaskServer.java")||BootProjectSnapshot.allowedPath(file.getKey())))throw new IOException("源码路径不在允许范围内。");
                Path target=work.resolve(file.getKey());Files.createDirectories(target.getParent());
                if(!Files.exists(target)||!Files.readString(target).equals(file.getValue()))Files.writeString(target,file.getValue(),StandardCharsets.UTF_8);
            }
            CheckProgress.update("compiling","正在本机编译项目代码",2);
            Path artifact;
            Path classes=work.resolve("classes"), artifactHash=work.resolve("artifact.sha256");
            if(boot) {
                var build=command(work,end,cancelled,maven(work));log=build.output();
                if(build.exit()!=0) {
                    boolean dependency=log.contains("Could not resolve")||log.contains("Non-resolvable")||log.contains("Could not transfer")||log.contains("PluginResolutionException")||log.contains("DependencyResolutionException");
                    status=dependency?"local_unavailable":"compile_error";
                    checks.add(new CheckReport.Assertion("本机Maven构建",false,"按原pom.xml构建成功",log));
                    return result(status,digest,version,stage,policy,environment,checks,log);
                }
                try(var targets=Files.list(work.resolve("target"))){var jars=targets.filter(p->p.getFileName().toString().endsWith(".jar")).toList();if(jars.size()!=1)throw new IOException("工程需要生成一个可运行JAR。");artifact=jars.getFirst();}
            } else {
                artifact=same?httpArtifact(classes):null;
                if(artifact==null||!Files.isRegularFile(artifactHash)||!WorkspaceController.hash(Files.readAllBytes(artifact)).equals(Files.readString(artifactHash))) {
                    clear(classes);
                    Files.createDirectories(classes);
                    var build=command(work,end,cancelled,List.of(binary("javac"),"-J-Dstdout.encoding=UTF-8","-J-Dstderr.encoding=UTF-8","-proc:none","--release","21","--add-modules","jdk.httpserver","-encoding","UTF-8","-d",classes.toString(),work.resolve("TaskServer.java").toString()));
                    if(build.exit()!=0)return result("compile_error",digest,version,stage,policy,environment,checks,build.output());
                    artifact=httpArtifact(classes);
                    if(artifact==null)return result("compile_error",digest,version,stage,policy,environment,checks,"TaskServer.java 需要声明一个名为 TaskServer 的顶层类。");
                    Files.writeString(artifactHash,WorkspaceController.hash(Files.readAllBytes(artifact)));
                }
            }
            Files.writeString(work.resolve("snapshot.digest"),cacheKey);
            checks.add(new CheckReport.Assertion("本机编译",true,"当前快照编译成功",boot?"使用本机JDK与持久Maven缓存。":"使用本机JDK编译 TaskServer.java。"));
            if(ConsoleOutputCheck.POLICY.equals(policy)) {
                CheckProgress.update("starting","正在运行 TaskServer.main",3);
                Path stdout=work.resolve("console.out"), stderr=work.resolve("console.err");
                application=new ProcessBuilder(binary("java"),"-Xmx192m","-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8","-cp",classes.toString(),httpMainClass(classes.relativize(artifact).toString()))
                    .directory(work.toFile()).redirectOutput(stdout.toFile()).redirectError(stderr.toFile()).start();
                track(work,application);
                long runEnd=Math.min(end,System.nanoTime()+TimeUnit.SECONDS.toNanos(8));
                while(!application.waitFor(75,TimeUnit.MILLISECONDS))guard(runEnd,cancelled);
                guard(runEnd,cancelled);
                CheckProgress.update("checking","正在核对控制台输出和退出状态",4);
                status=ConsoleOutputCheck.verify(application.exitValue(),read(stdout,4096),checks);
                log=httpStartupLog(read(stderr,4096));
                return result(status,digest,version,stage,policy,environment,checks,log);
            }
            int port;
            try(var socket=new ServerSocket()){socket.bind(new InetSocketAddress("127.0.0.1",boot?0:8080));port=socket.getLocalPort();}
            catch(BindException e){return unavailable(digest,version,stage,policy,"本机8080端口已占用，保留原进程并使用备用隔离环境。");}
            var launch=new ArrayList<>(List.of(binary("java"),"-Xmx192m","-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8"));
            if(boot)launch.addAll(List.of("-jar",artifact.toString(),"--server.port="+port,"--server.address=127.0.0.1"));
            else launch.addAll(List.of("--add-modules","jdk.httpserver","-cp",classes.toString(),httpMainClass(classes.relativize(artifact).toString())));
            CheckProgress.update("starting","正在启动本机应用",3);
            Path serverLog=work.resolve("server.log");
            application=new ProcessBuilder(launch).directory(work.toFile()).redirectErrorStream(true).redirectOutput(serverLog.toFile()).start();
            track(work,application);
            long readyEnd=Math.min(end,System.nanoTime()+TimeUnit.SECONDS.toNanos(30));
            while(true) {
                guard(readyEnd,cancelled);
                if(!application.isAlive()){
                    String startupLog=read(serverLog,8192);
                    int exit=application.exitValue();
                    String feedback=exit==0?"程序已正常退出（退出码 0）。本关需要启动 HTTP 服务并保持运行，才能收到请求。":"程序在收到 HTTP 请求前退出（退出码 "+exit+"）。请查看运行日志。";
                    checks.add(new CheckReport.Assertion("HTTP 服务启动",false,"服务保持运行并返回 HTTP 响应",feedback));
                    return result("business_error",digest,version,stage,policy,environment,checks,"应用启动失败：\n"+(boot?startupLog:httpStartupLog(startupLog)));
                }
                try {request(port,"GET",boot?"/api/health":"/api/tasks/1",null,end,cancelled);break;}
                catch(IOException e){Thread.sleep(100);}
            }
            CheckProgress.update("checking","正在检查本机接口与功能行为",4);
            verifier.check((method,path,body)->request(port,method,path,body,end,cancelled),checks);
            status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";
            log=read(serverLog,8192);
        } catch(Stop e){status=e.status;log="cancelled".equals(status)?"本机检查已取消。":ConsoleOutputCheck.POLICY.equals(policy)?"程序没有在时限内退出。请检查 main 是否还在等待输入或持续运行。":"本机检查超时，请检查启动与接口是否阻塞。";}
        catch(InterruptedException e){status="cancelled";log="本机检查已取消。";Thread.currentThread().interrupt();}
        catch(Exception e){status=application==null?"local_unavailable":"business_error";log=e.getClass().getSimpleName()+": "+e.getMessage();}
        finally {CheckProgress.update("finishing","正在整理结果与停止本次检查进程",5);if(application!=null){stop(application);try{forget(work,application);}catch(IOException e){status="environment_error";log+="\n进程记录清理失败："+e.getMessage();}}}
        return result(status,digest,version,stage,policy,environment,checks,log);
    }
    private Outcome result(String status,String digest,String version,String stage,String policy,String environment,List<CheckReport.Assertion> checks,String log) {
        String harness="local-v1";
        try(var bytes=getClass().getResourceAsStream("LocalProjectRunner.class")){harness=WorkspaceController.hash(Objects.requireNonNull(bytes).readAllBytes());}catch(IOException ignored){}
        return new Outcome(status,new CheckReport(digest,version,stage,policy,environment,harness,status.equals("passed"),List.copyOf(checks),log,Instant.now().toString()));
    }
}

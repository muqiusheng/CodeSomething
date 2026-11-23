package dev.codesomething.projects;

import dev.codesomething.boot.BootProjectSnapshot;
import dev.codesomething.workspaces.CheckReport;
import dev.codesomething.workspaces.WorkspaceController;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Local execution first; isolated runner remains available when local tools are unavailable. */
@Component
public class GeneratedRunner {
    private final String docker;private final Path root;private final int timeout;
    private final boolean hardened;
    private dev.codesomething.workspaces.LocalProjectRunner local;
    @org.springframework.beans.factory.annotation.Autowired
    public void configureLocal(dev.codesomething.workspaces.LocalProjectRunner runner,@Value("${cs.runner.local-enabled:true}")boolean enabled){if(enabled&&!hardened)this.local=runner;}
    private final JsonMapper json=JsonMapper.builder().build();
    private record Command(int code,String output){}
    private record Response(int code,String type,String text,JsonNode body){}
    public record Result(String status,CheckReport report){}
    private static final class Stop extends Exception {final String status;Stop(String status){this.status=status;}}
    public GeneratedRunner(String docker,String data,int timeout){this(docker,data,timeout,"local_first");}
    @org.springframework.beans.factory.annotation.Autowired
    public GeneratedRunner(@Value("${cs.runner.docker}")String docker,@Value("${cs.data-directory}")String data,
                           @Value("${cs.projects.timeout-seconds:120}")int timeout,@Value("${cs.runner.mode}")String mode){
        this.docker=docker;this.root=Path.of(data).toAbsolutePath().normalize().resolve("generated-runner");
        this.hardened="docker_only".equals(mode);this.timeout=hardened?30:Math.clamp(timeout,10,180);
    }
    private String scope(){return GeneratedPackage.digest(root.toString());}
    public String fingerprint(){try{var hashes=new ArrayList<String>();for(String resource:List.of("/dev/codesomething/projects/GeneratedRunner.class","/dev/codesomething/projects/GeneratedPackage.class","/runner/boot/image-lock.json","/runner/boot/BootProbe.java","/dev/codesomething/workspaces/LocalProjectRunner.class","/dev/codesomething/workspaces/LocalFirstCheck.class"))try(var in=getClass().getResourceAsStream(resource)){hashes.add(WorkspaceController.hash(Objects.requireNonNull(in).readAllBytes()));}return GeneratedPackage.digest(hashes);}catch(IOException e){throw new UncheckedIOException(e);}}
    public void recover()throws Exception{
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);var containers=cmd(()->false,end,"ps","-aq","--filter=label=codesomething.r6-scope="+scope());require(containers);
        for(String id:containers.output().split("\\R"))if(!id.isBlank()){if(!id.matches("[a-f0-9]{12,64}"))throw new IOException("恢复容器标识不正确");var inspected=cmd(()->false,end,"inspect","--format={{json .Config.Labels}}",id);require(inspected);if(scope().equals(json.readTree(inspected.output()).path("codesomething.r6-scope").asText()))require(cmd(()->false,end,"rm","-f",id));}
        if(Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS))try(var entries=Files.list(root)){for(Path dir:entries.toList())if(dir.getFileName().toString().matches("[a-f0-9-]{36}")&&dir.normalize().startsWith(root))try(var paths=Files.walk(dir)){for(Path file:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}}
    }
    private Command cmd(BooleanSupplier cancelled,long deadline,String... args)throws Exception {
        if(cancelled.getAsBoolean()||Thread.currentThread().isInterrupted())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");
        var command=new ArrayList<String>();command.add(docker);command.addAll(List.of(args));var process=new ProcessBuilder(command).redirectErrorStream(true).start();var bytes=new ByteArrayOutputStream();
        var reader=Thread.ofVirtual().start(()->{try(var in=process.getInputStream()){byte[] buffer=new byte[2048];int n;while((n=in.read(buffer))!=-1)synchronized(bytes){if(bytes.size()<32768)bytes.write(buffer,0,Math.min(n,32768-bytes.size()));}}catch(IOException ignored){}});
        try{while(!process.waitFor(100,TimeUnit.MILLISECONDS)){if(cancelled.getAsBoolean()||Thread.currentThread().isInterrupted())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");}reader.join(1000);return new Command(process.exitValue(),bytes.toString(StandardCharsets.UTF_8));}finally{if(process.isAlive())process.destroyForcibly();}
    }
    private void require(Command c)throws IOException{if(c.code()!=0)throw new IOException(c.output());}
    private Response request(String name,BooleanSupplier cancelled,long deadline,String method,String path,String body)throws Exception {
        var args=new ArrayList<>(List.of("exec",name,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","BootProbe",method,path));if(body!=null)args.add(Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)));
        var result=cmd(cancelled,deadline,args.toArray(String[]::new));if(result.code()!=0)return new Response(0,"",result.output(),json.readTree("null"));
        var lines=result.output().split("\\R",-1);if(lines.length<3)throw new IOException("HTTP探针输出不完整");
        String type=new String(Base64.getDecoder().decode(lines[1]),StandardCharsets.UTF_8),text=new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8);JsonNode bodyJson;
        try{bodyJson=json.readTree(text);}catch(Exception e){bodyJson=json.readTree("null");}return new Response(Integer.parseInt(lines[0]),type,text,bodyJson);
    }
    private boolean valid(Response r,int status){return r.code()==status&&r.type().toLowerCase(Locale.ROOT).split(";")[0].strip().equals("application/json");}
    private void check(List<CheckReport.Assertion> list,String name,boolean passed,String expected,Response r){list.add(new CheckReport.Assertion(name,passed,expected,"HTTP "+r.code()+" "+r.text()));}
    private void localAssertion(List<CheckReport.Assertion> checks,String name,boolean passed,String expected,dev.codesomething.workspaces.LocalProjectRunner.Response response){checks.add(new CheckReport.Assertion(name,passed,expected,"HTTP "+response.status()+" "+response.text()));}
    private void verify(GeneratedPackage.Pack pack,String stage,dev.codesomething.workspaces.LocalProjectRunner.Request request,List<CheckReport.Assertion> checks)throws Exception {
                String base="/api/"+pack.plan().resource()+(stage.equals("transfer")?"archive":"");
                var r=request.call("GET",base+"/1",null);localAssertion(checks,"read-json",r.json(200)&&r.body().path("id").isNumber()&&r.body().path("id").asLong()==1&&r.body().path("title").isString()&&r.body().path("title").asText().equals(pack.plan().itemTitle())&&r.body().path("completed").isBoolean()&&!r.body().path("completed").asBoolean(),"200，id数字1，题材标题，completed布尔false",r);
                r=request.call("GET",base+"/99999",null);localAssertion(checks,"missing-404",r.json(404)&&r.body().path("message").isString()&&!r.body().path("message").asText().isBlank(),"404与非空message",r);
                r=request.call("GET",base,null);localAssertion(checks,"list-json",r.json(200)&&r.body().isArray()&&r.body().size()==1,"200与初始单项数组",r);
                if(!stage.equals("read")){
                    r=request.call("POST",base,"{\"title\":\"  O'Reilly  \",\"completed\":true}");long id=r.body().path("id").asLong(-1);localAssertion(checks,"create-201",r.json(201)&&id>1&&r.body().path("title").asText().equals("O'Reilly")&&r.body().path("completed").isBoolean()&&r.body().path("completed").asBoolean(),"201与去空白的标题、true和新编号",r);
                    for(var item:Map.of("blank-400","{\"title\":\"  \",\"completed\":false}","type-400","{\"title\":\"书\",\"completed\":\"false\"}","missing-field-400","{\"title\":\"书\"}","long-400",json.writeValueAsString(Map.of("title","长".repeat(101),"completed",false))).entrySet()){r=request.call("POST",base,item.getValue());localAssertion(checks,item.getKey(),r.json(400)&&r.body().path("message").isString()&&!r.body().path("message").asText().isBlank(),"400与非空message",r);}
                    r=request.call("GET",base+"/"+id,null);localAssertion(checks,"create-read",r.json(200)&&r.body().path("id").asLong(-1)==id&&r.body().path("title").asText().equals("O'Reilly"),"新增编号可读取",r);
                }
                if(stage.equals("transfer")){r=request.call("GET","/api/"+pack.plan().resource(),null);localAssertion(checks,"resource-isolation",r.json(200)&&r.body().isArray()&&r.body().size()==1&&r.body().get(0).path("title").asText().equals(pack.plan().itemTitle()),"原资源保持一项初始记录",r);}
    }
    public Result run(GeneratedPackage.Pack pack,String stage,Map<String,String> files,BooleanSupplier cancelled){
        return run(UUID.randomUUID().toString(),pack,stage,files,cancelled);
    }
    public Result run(String job,GeneratedPackage.Pack pack,String stage,Map<String,String> files,BooleanSupplier cancelled){
        if(!UUID.fromString(job).toString().equals(job))throw new IllegalArgumentException("Invalid job ID");
        if(hardened) {
            try(var slot=dev.codesomething.boot.PublicJdbcSandbox.acquire(cancelled)) {
                if(slot!=null)return runIsolated(job,pack,stage,files,cancelled);
            }
            return new Result("cancelled",new CheckReport(GeneratedPackage.digest(new TreeMap<>(files)),pack.version(),
                stage,GeneratedPackage.RULE,"","",false,List.of(),"检查已取消。",Instant.now().toString()));
        }
        if(local==null)return runIsolated(job,pack,stage,files,cancelled);
        var result=dev.codesomething.workspaces.LocalFirstCheck.run(
            ()->local.runProject("generated-"+pack.id(),files,GeneratedPackage.digest(new TreeMap<>(files)),pack.version(),stage,GeneratedPackage.RULE,cancelled,(request,checks)->verify(pack,stage,request,checks)),
            ()->{var isolated=runIsolated(job,pack,stage,files,cancelled);return new dev.codesomething.workspaces.LocalProjectRunner.Outcome(isolated.status(),isolated.report());});
        return new Result(result.status(),result.report());
    }
    private Result runIsolated(String job,GeneratedPackage.Pack pack,String stage,Map<String,String> files,BooleanSupplier cancelled){
        String name="cs-r6-"+job,owner=UUID.randomUUID().toString(),image="",harness="",status="environment_error",log="";
        Path input=root.resolve(job);boolean created=false,attempted=false;var checks=new ArrayList<CheckReport.Assertion>();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try{
            var snapshot=BootProjectSnapshot.fromFiles(files,false);
            byte[] lock,probe;try(var in=getClass().getResourceAsStream("/runner/boot/image-lock.json")){lock=Objects.requireNonNull(in).readAllBytes();}try(var in=getClass().getResourceAsStream("/runner/boot/BootProbe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            var config=json.readTree(lock);image=config.path("image").asText();if(!image.matches("sha256:[a-f0-9]{64}")||!WorkspaceController.hash(BootProjectSnapshot.trustedPom().getBytes(StandardCharsets.UTF_8)).equals(config.path("pomDigest").asText()))throw new IOException("运行镜像与POM锁不匹配");
            image=hardened?dev.codesomething.boot.MavenBuildEnvironment.preparePublic(docker,root,snapshot,image,cancelled):
                dev.codesomething.boot.MavenBuildEnvironment.prepare(docker,root,snapshot,false,image,cancelled);
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
            byte[] engine;try(var in=getClass().getResourceAsStream("GeneratedRunner.class")){engine=Objects.requireNonNull(in).readAllBytes();}
            harness=GeneratedPackage.digest(List.of(GeneratedPackage.RULE,WorkspaceController.hash(lock),WorkspaceController.hash(probe),WorkspaceController.hash(engine),WorkspaceController.hash(dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE.getBytes(StandardCharsets.UTF_8)),pack.plan(),GeneratedPackage.tests(stage)));
            Files.createDirectories(root);Files.createDirectory(input);created=true;for(var entry:files.entrySet()){Path file=input.resolve("project").resolve(entry.getKey());Files.createDirectories(file.getParent());Files.writeString(file,entry.getValue());}Files.write(input.resolve("BootProbe.java"),probe);Files.writeString(input.resolve("WaitForHttp.java"),dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE);
            String memory=hardened?"512m":"640m";
            attempted=true;require(cmd(cancelled,deadline,"create","--name",name,"--label=codesomething.r6-owner="+owner,"--label=codesomething.r6-scope="+scope(),"--label="+dev.codesomething.admin.RunnerInventory.scopeLabel(root.getParent()),"--pull=never","--network=none","--read-only","--cpus=1","--memory="+memory,"--memory-swap="+memory,hardened?"--pids-limit=64":"--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges","--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777","--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp","--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp",image,"sleep",hardened?"30":"240"));require(cmd(cancelled,deadline,"start",name));require(cmd(cancelled,deadline,"exec",name,"cp","-R","/input/project","/tmp/project"));
            var build=cmd(cancelled,deadline,"exec","--workdir=/tmp/project",name,"sh","/opt/maven/bin/mvn","-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository","-DskipTests","package");checks.add(new CheckReport.Assertion("offline-build",build.code()==0,"Java21固定依赖离线构建",build.output()));
            if(build.code()!=0){status=build.output().contains("COMPILATION ERROR")?"compile_error":"environment_error";log=build.output();}
            else{
                require(cmd(cancelled,deadline,"exec","--workdir=/tmp/project","-d",name,"sh","-c",dev.codesomething.boot.MavenBuildEnvironment.START_JAR));require(cmd(cancelled,deadline,"exec",name,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","WaitForHttp"));
                final long checkDeadline=deadline;
                verify(pack,stage,(method,path,payload)->{
                    var response=request(name,cancelled,checkDeadline,method,path,payload);
                    return new dev.codesomething.workspaces.LocalProjectRunner.Response(response.code(),response.type(),response.text());
                },checks);
                status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";log=cmd(cancelled,deadline,"exec",name,"head","-c","8192","/tmp/server.log").output();
            }
        }catch(InterruptedException e){status="cancelled";log=e.getMessage();}catch(Stop e){status=e.status;log="检查已停止或超时。";}catch(Exception e){status="environment_error";log=e.getMessage();}
        finally{
            if(attempted)try{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);var inspected=cmd(()->false,end,"inspect","--format={{json .Config.Labels}}",name);if(inspected.code()==0&&owner.equals(json.readTree(inspected.output()).path("codesomething.r6-owner").asText()))require(cmd(()->false,end,"rm","-f",name));else if(inspected.code()!=0&&!inspected.output().contains("No such"))throw new IOException(inspected.output());}catch(Exception e){status="environment_error";log+="；容器清理失败";}
            if(created)try(var paths=Files.walk(input)){for(var p:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(p);}catch(Exception e){status="environment_error";log+="；输入清理失败";}
        }
        if(log==null)log="检查失败";
        return new Result(status,new CheckReport(GeneratedPackage.digest(new TreeMap<>(files)),pack.version(),stage,GeneratedPackage.RULE,image,harness,status.equals("passed"),List.copyOf(checks),log.substring(0,Math.min(log.length(),8192)),Instant.now().toString()));
    }
}

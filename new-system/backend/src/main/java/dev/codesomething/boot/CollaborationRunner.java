package dev.codesomething.boot;

import dev.codesomething.workspaces.*;
import dev.codesomething.sql.MysqlEnvironment;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Versioned Boot + JDBC strategies. Each JDBC job owns a fresh internal network and MySQL instance. */
public final class CollaborationRunner {
    private final String docker;private final Path root;private final int timeout;
    private final JsonMapper json=JsonMapper.builder().build();
    private record Command(int code,String output) {}
    private static class Stop extends Exception {final String status;Stop(String status){this.status=status;}}
    public CollaborationRunner(String docker,Path root,int timeout){this.docker=docker;this.root=root;this.timeout=timeout;}
    private Command cmd(long deadline,BooleanSupplier cancelled,String... args) throws Exception {
        dev.codesomething.workspaces.CheckProgress.command(List.of(args));
        if(cancelled.getAsBoolean())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");
        var argv=new ArrayList<String>();argv.add(docker);argv.addAll(List.of(args));
        var p=new ProcessBuilder(argv).redirectErrorStream(true).start();var bytes=new ByteArrayOutputStream();
        var reader=Thread.ofVirtual().start(()->{try(var input=p.getInputStream()){byte[] buffer=new byte[2048];int n;while((n=input.read(buffer))!=-1)synchronized(bytes){int room=32768-bytes.size();if(room>0)bytes.write(buffer,0,Math.min(n,room));}}catch(IOException ignored){}});
        try{while(!p.waitFor(75,TimeUnit.MILLISECONDS)){if(cancelled.getAsBoolean())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");}reader.join(1000);synchronized(bytes){return new Command(p.exitValue(),bytes.toString(StandardCharsets.UTF_8));}}
        finally{if(p.isAlive())p.destroyForcibly();}
    }
    private static String require(Command c) throws IOException {if(c.code()!=0)throw new IOException(c.output());return c.output();}
    public void recover(String id) throws Exception {
        if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException();
        for(String name:List.of("cs-r33-app-"+id,"cs-r33-db-"+id)) {
            var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"container","inspect",name);
            if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Config").path("Labels").path("codesomething.r33-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"rm","-f",name));
        }
        String name="cs-r33-net-"+id;var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","inspect",name);
        if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Labels").path("codesomething.r33-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","rm",name));
        Path input=root.resolve(id);
        if(Files.isDirectory(input,LinkOption.NOFOLLOW_LINKS))try(var paths=Files.walk(input)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}
    }
    private record Response(int status,String type,String body,String requestId) { private Response(int status,String type,String body){this(status,type,body,"");} }
    private Response request(String app,long deadline,BooleanSupplier cancelled,String method,String path,String body) throws Exception {
        return request(app,deadline,cancelled,method,path,body,null);
    }
    private Response request(String app,long deadline,BooleanSupplier cancelled,String method,String path,String body,String token) throws Exception {
        var args=new ArrayList<>(List.of("exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","R7Probe",method,path,body==null?"-":Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)),token==null?"-":token));
        var result=cmd(deadline,cancelled,args.toArray(String[]::new));
        if(result.code()!=0)return new Response(0,"",result.output());var lines=result.output().split("\\R",-1);
        if(lines.length<3)throw new IOException("HTTP探针输出不完整");
        return new Response(Integer.parseInt(lines[0]),new String(Base64.getDecoder().decode(lines[1]),StandardCharsets.UTF_8),new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8),lines.length>3?lines[3].strip():"");
    }
    private JsonNode body(Response r){try{return json.readTree(r.body());}catch(Exception e){return json.readTree("null");}}
    private boolean json(Response r,int status){return r.status()==status&&r.type().toLowerCase(Locale.ROOT).split(";")[0].strip().equals("application/json");}
    private void assertion(List<CheckReport.Assertion> checks,String name,boolean passed,String expected,Response actual){checks.add(new CheckReport.Assertion(name,passed,expected,"HTTP "+actual.status()+" "+actual.body()));}
    public BootCheckRunner.Outcome run(String id,BootProjectSnapshot snapshot,String version,String stage,BooleanSupplier cancelled) {
        if(!UUID.fromString(id).toString().equals(id)||!BootCourses.VERSION.equals(version))throw new IllegalArgumentException();
        String policy=BootCourses.policy(stage),app="cs-r33-app-"+id,db="cs-r33-db-"+id,net="cs-r33-net-"+id,owner=UUID.randomUUID().toString(),secret=UUID.randomUUID().toString().replace("-","");
        boolean database=BootCourses.jdbc(stage),createdInput=false,attemptApp=false,attemptDb=false,attemptNet=false;
        String image="",harness="",status="environment_error",log="";Path input=root.resolve(id);var checks=new ArrayList<CheckReport.Assertion>();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try {
            byte[] lock,probe;try(var in=getClass().getResourceAsStream(database?"/runner/boot/jdbc-image-lock.json":"/runner/boot/image-lock.json")){lock=Objects.requireNonNull(in,"镜像锁缺失").readAllBytes();}
            var config=json.readTree(lock);image=config.path("image").asText();
            if(!image.matches("sha256:[a-f0-9]{64}")||!WorkspaceController.hash(BootProjectSnapshot.trustedPom(database).getBytes(StandardCharsets.UTF_8)).equals(config.path("pomDigest").asText()))throw new IOException("固定POM与镜像不匹配");
            image=dev.codesomething.boot.MavenBuildEnvironment.prepare(docker,root,snapshot,database,image,cancelled);
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
            try(var in=getClass().getResourceAsStream("/runner/collaboration/R7Probe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            String seed;
            try(var stream=getClass().getResourceAsStream("/runner/collaboration/seed.sql")){seed="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE cs_lab CHARACTER SET utf8mb4; CREATE USER 'learner'@'%' IDENTIFIED BY '"+secret+"'; GRANT SELECT,INSERT,UPDATE,DELETE ON cs_lab.* TO 'learner'@'%'; USE cs_lab; "+new String(Objects.requireNonNull(stream).readAllBytes(),StandardCharsets.UTF_8);}
            String implementation;
            try(var in=getClass().getResourceAsStream("CollaborationRunner.class")){implementation=WorkspaceController.hash(Objects.requireNonNull(in).readAllBytes());}
            if(Set.of("b-tests","b-deploy").contains(stage))for(String name:List.of("Application","AuthService","PlanService","BusinessController","Problem","ApiErrors","RequestLog"))
                try(var stream=getClass().getResourceAsStream("/runner/collaboration/mutation/"+name+".java")){implementation+=WorkspaceController.hash(Objects.requireNonNull(stream).readAllBytes());}
            harness=WorkspaceController.hash((WorkspaceController.hash(probe)+WorkspaceController.hash(lock)+WorkspaceController.hash(dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE.getBytes(StandardCharsets.UTF_8))+policy+seed.replace(secret,"<per-job-secret>")+MysqlEnvironment.IMAGE+implementation).getBytes(StandardCharsets.UTF_8));
            Files.createDirectories(root);Files.createDirectory(input);createdInput=true;
            for(var file:snapshot.files()){Path path=input.resolve("project").resolve(file.path());Files.createDirectories(path.getParent());Files.writeString(path,file.content());}
            Files.write(input.resolve("R7Probe.java"),probe);
            Files.writeString(input.resolve("WaitForHttp.java"),dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE);
            if(database) {
                attemptNet=true;require(cmd(deadline,cancelled,"network","create","--internal","--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,net));
                attemptDb=true;require(cmd(deadline,cancelled,"run","-d","--pull=never","--name",db,"--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,"--network",net,"--network-alias=database","--user=999:999","--read-only","--memory=640m","--memory-swap=640m","--cpus=1","--pids-limit=256","--cap-drop=ALL","--security-opt=no-new-privileges","--log-driver=none","--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=256m,mode=1777","--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777","--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777","--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes","--env=MYSQL_ROOT_HOST=localhost",MysqlEnvironment.IMAGE,"--local-infile=0","--max-connections=15","--innodb-buffer-pool-size=64M","--performance-schema=OFF","--skip-log-bin"));
                boolean ready=false;
                for(int i=0;i<100;i++) {
                    var comm=cmd(deadline,cancelled,"exec",db,"cat","/proc/1/comm");
                    if(comm.code()==0&&comm.output().strip().equals("mysqld")) {
                        var ping=cmd(deadline,cancelled,"exec",db,"mysql","-uroot","--protocol=socket","-e","SELECT 1;");if(ping.code()==0){ready=true;break;}
                    }
                    Thread.sleep(300);
                }
                if(!ready)throw new IOException("隔离MySQL启动失败");
                require(cmd(deadline,cancelled,"exec",db,"mysql","-uroot","--protocol=socket","--default-character-set=utf8mb4","-e",seed));
            }
            var create=new ArrayList<>(List.of("create","--name",app,"--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,"--pull=never","--network="+(database?net:"none"),"--read-only","--cpus=1","--memory=640m","--memory-swap=640m","--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges","--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777","--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp","--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp"));
            if(database)create.addAll(List.of("--env=SPRING_DATASOURCE_URL=jdbc:mysql://database:3306/cs_lab?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8","--env=SPRING_DATASOURCE_USERNAME=learner","--env=SPRING_DATASOURCE_PASSWORD="+secret,"--env=SPRING_SQL_INIT_MODE=never"));
            create.addAll(List.of(image,"sleep","240"));attemptApp=true;require(cmd(deadline,cancelled,create.toArray(String[]::new)));require(cmd(deadline,cancelled,"start",app));
            require(cmd(deadline,cancelled,"exec",app,"cp","-R","/input/project","/tmp/project"));
            var build=maven(app,deadline,cancelled,"-DskipTests","package");
            checks.add(new CheckReport.Assertion("离线Maven构建",build.code()==0,"按工程pom.xml构建成功",build.code()==0?"工程已按原始pom.xml离线编译并打包。":build.output()));
            if(build.code()!=0){status=build.output().contains("COMPILATION ERROR")||build.output().contains("Unable to find main class")?"compile_error":"environment_error";log=build.output();}
            else {
                start(app,deadline,cancelled);
                verify(app,db,deadline,cancelled,stage,checks);
                if(Set.of("b-tests","b-deploy").contains(stage))verifyTests(app,input,snapshot,deadline,cancelled,checks);
                var logs=cmd(deadline,cancelled,"exec",app,"head","-c","8192","/tmp/server.log");log=logs.output();
                status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";
            }
        }catch(InterruptedException e){status="cancelled";log=e.getMessage();}
        catch(Stop e){status=e.status;log=e.status.equals("cancelled")?"检查已取消。":"检查超出"+timeout+"秒限制。";}
        catch(Exception e){status="environment_error";log=e.getClass().getSimpleName()+": "+e.getMessage();
            if(attemptApp)try{var startup=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"exec",app,"cat","/tmp/server.log");if(startup.code()==0&&!startup.output().isBlank()){status="business_error";log+="\n"+startup.output();checks.add(new CheckReport.Assertion("应用启动与接口可达性",false,"工程能正常启动并响应本章接口",startup.output()));}}catch(Exception ignored){}
        }
        finally {
            for(var item:List.of(new Object[]{app,false,attemptApp},new Object[]{db,false,attemptDb},new Object[]{net,true,attemptNet}))if((boolean)item[2])try{remove((String)item[0],(boolean)item[1],owner);}catch(Exception e){status="environment_error";log+="\n清理失败："+e.getMessage();}
            if(createdInput)try(var paths=Files.walk(input)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}catch(IOException e){status="environment_error";log+="\n临时输入清理失败。";}
        }
        log=log.replace(secret,"<redacted>");
        return new BootCheckRunner.Outcome(status,new CheckReport(snapshot.digest(),version,stage,policy,image,harness,"passed".equals(status),List.copyOf(checks),log.substring(0,Math.min(log.length(),8192)),Instant.now().toString()));
    }
    private void remove(String name,boolean network,String owner) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);var found=cmd(deadline,()->false,network?"network":"container","inspect",name);
        if(found.code()!=0){if(found.output().contains("No such"))return;throw new IOException(found.output());}
        var info=json.readTree(found.output()).get(0);var labels=network?info.path("Labels"):info.path("Config").path("Labels");
        if(owner.equals(labels.path("codesomething.r33-owner").asText())){if(network)require(cmd(deadline,()->false,"network","rm",name));else require(cmd(deadline,()->false,"rm","-f",name));}
    }
    private Command maven(String app,long deadline,BooleanSupplier cancel,String... goals) throws Exception {var args=new ArrayList<>(List.of("exec","--workdir=/tmp/project",app,"sh","/opt/maven/bin/mvn","-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository"));args.addAll(List.of(goals));return cmd(deadline,cancel,args.toArray(String[]::new));}
    private void start(String app,long deadline,BooleanSupplier cancel) throws Exception {require(cmd(deadline,cancel,"exec","--workdir=/tmp/project","-d",app,"sh","-c",dev.codesomething.boot.MavenBuildEnvironment.START_JAR));require(cmd(deadline,cancel,"exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","WaitForHttp"));}
    private void restartApplication(String app,long deadline,BooleanSupplier cancel) throws Exception {require(cmd(deadline,cancel,"exec",app,"sh","-c","kill $(cat /tmp/server.pid)"));Thread.sleep(600);start(app,deadline,cancel);}
    private String login(String app,long deadline,BooleanSupplier cancel,String username,List<CheckReport.Assertion> checks) throws Exception {
        var r=request(app,deadline,cancel,"POST","/api/auth/login","{\"username\":\""+username+"\",\"password\":\"Learn-2026!\"}");
        String token=body(r).path("token").asText();
        assertion(checks,"登录 "+username,json(r,200)&&token.matches("[a-f0-9]{64}")&&body(r).path("expiresAt").asLong()>System.currentTimeMillis()/1000,"200与随机有时限令牌",new Response(r.status(),r.type(),"<login credentials redacted>"));
        return token.matches("[a-f0-9]{64}")?token:null;
    }
    private void verify(String app,String db,long deadline,BooleanSupplier cancel,String stage,List<CheckReport.Assertion> checks) throws Exception {
        int level=BootCourses.COLLAB.indexOf(stage);
        var r=request(app,deadline,cancel,"POST","/api/auth/login","{\"username\":\"alice\",\"password\":\"wrong\"}");
        assertion(checks,"错误密码拒绝",json(r,401),"401 JSON",r);
        for(String token:new String[]{null,"0".repeat(64)}){r=request(app,deadline,cancel,"GET","/api/auth/me",null,token);assertion(checks,"无效身份拒绝",json(r,401),"401 JSON",r);}
        String alice=login(app,deadline,cancel,"alice",checks),bob=login(app,deadline,cancel,"bob",checks),eve=login(app,deadline,cancel,"eve",checks),admin=login(app,deadline,cancel,"admin",checks);
        if(alice==null||bob==null||eve==null||admin==null)return;
        r=request(app,deadline,cancel,"GET","/api/auth/me",null,alice);assertion(checks,"会话身份不泄露摘要",json(r,200)&&body(r).path("id").asLong()==1&&body(r).path("role").asText().equals("USER")&&!r.body().contains("password")&&!r.body().contains("salt")&&!r.body().contains("token"),"alice身份，隐藏密码/令牌摘要",r);
        r=request(app,deadline,cancel,"DELETE","/api/auth/session",null,bob);assertion(checks,"注销204",r.status()==204&&r.body().isEmpty(),"204空体",r);
        r=request(app,deadline,cancel,"GET","/api/auth/me",null,bob);assertion(checks,"重放已注销令牌",json(r,401),"401",r);
        require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-e","UPDATE cs_lab.sessions SET expires_at=0 WHERE user_id=3;"));
        r=request(app,deadline,cancel,"GET","/api/auth/me",null,eve);assertion(checks,"会话到期",json(r,401),"401",r);
        if(level==0)return;
        bob=login(app,deadline,cancel,"bob",checks);eve=login(app,deadline,cancel,"eve",checks);
        r=request(app,deadline,cancel,"GET","/api/plans/1",null,bob);assertion(checks,"成员可读",json(r,200)&&body(r).path("id").asLong()==1,"bob可以读计划1",r);
        r=request(app,deadline,cancel,"GET","/api/plans/1",null,eve);assertion(checks,"跨计划越权拒绝",json(r,403),"eve不能读计划1",r);
        r=request(app,deadline,cancel,"GET","/api/plans/1/tasks",null,eve);assertion(checks,"任务数据越权拒绝",json(r,403),"403",r);
        r=request(app,deadline,cancel,"GET","/api/plans/1",null,admin);assertion(checks,"管理员不绕过成员边界",json(r,403),"403",r);
        r=request(app,deadline,cancel,"POST","/api/plans/1/tasks/batch","[{\"title\":\"禁止\",\"assigneeId\":2}]",bob);assertion(checks,"成员无分配权限",json(r,403),"403",r);
        r=request(app,deadline,cancel,"GET","/api/admin/audit",null,bob);assertion(checks,"普通用户无审计权限",json(r,403),"403",r);
        r=request(app,deadline,cancel,"GET","/api/admin/audit",null,admin);assertion(checks,"管理员可读审计",json(r,200)&&body(r).isArray(),"200数组",r);
        if(level==1)return;
        r=request(app,deadline,cancel,"GET","/api/plans",null,bob);assertion(checks,"计划列表按成员隔离",json(r,200)&&body(r).isArray()&&body(r).size()==1&&body(r).get(0).path("id").asLong()==1,"仅计划1",r);
        r=request(app,deadline,cancel,"POST","/api/plans","{\"title\":\" O'Reilly <script> \",\"ownerId\":3}",alice);long plan=body(r).path("id").asLong(-1);
        assertion(checks,"创建计划与可信负责人",json(r,201)&&plan>2&&body(r).path("ownerId").asLong()==1&&body(r).path("title").asText().equals("O'Reilly <script>"),"201，ownerId=1且引号与HTML保留为数据",r);
        if(plan>0){r=request(app,deadline,cancel,"GET","/api/plans/"+plan,null,alice);assertion(checks,"负责人自动成为成员",json(r,200),"200",r);}
        r=request(app,deadline,cancel,"POST","/api/plans","{\"title\":\" \"}",alice);assertion(checks,"拒绝空计划标题",json(r,400),"400",r);
        if(level==2)return;
        for(int page=0;page<3;page++){
            r=request(app,deadline,cancel,"GET","/api/plans/1/tasks?status=todo&size=2&page="+page,null,alice);
            var items=body(r).path("items");boolean valid=json(r,200)&&body(r).path("total").asInt()==3&&body(r).path("page").asInt(-1)==page&&body(r).path("size").asInt()==2&&items.isArray()&&items.size()==(page==0?2:page==1?1:0);
            if(page==0)valid&=items.path(0).path("id").asInt()==1&&items.path(1).path("id").asInt()==3;
            if(page==1)valid&=items.path(0).path("id").asInt()==5;
            assertion(checks,"稳定筛选分页"+page,valid,"todo三条，按id稳定分页",r);
        }
        for(String query:List.of("page=-1","page=100001","size=0","size=51","page=bad","status=unknown")){r=request(app,deadline,cancel,"GET","/api/plans/1/tasks?"+query,null,alice);assertion(checks,"分页边界 "+query,json(r,400),"400",r);}
        if(level==3)return;
        String before=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-N","-e","SELECT (SELECT COUNT(*) FROM cs_lab.plan_tasks),(SELECT COUNT(*) FROM cs_lab.audit_events);"));
        for(String invalid:List.of("{\"title\":\" \",\"assigneeId\":2}","{\"title\":\"局外\",\"assigneeId\":3}")){
            r=request(app,deadline,cancel,"POST","/api/plans/1/tasks/batch","[{\"title\":\"必须回滚\",\"assigneeId\":2},"+invalid+"]",alice);assertion(checks,"批量后项失败返回400",json(r,400),"400",r);
            String after=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-N","-e","SELECT (SELECT COUNT(*) FROM cs_lab.plan_tasks),(SELECT COUNT(*) FROM cs_lab.audit_events);"));checks.add(new CheckReport.Assertion("任务与审计整体回滚",before.equals(after),before,after));
        }
        r=request(app,deadline,cancel,"POST","/api/plans/1/tasks/batch","[{\"title\":\"O'Reilly\",\"assigneeId\":2},{\"title\":\"第二条\",\"assigneeId\":1}]",alice);
        long task=body(r).path("ids").path(0).asLong(-1);assertion(checks,"批量成功提交",json(r,201)&&body(r).path("created").asInt()==2&&task>6&&body(r).path("ids").path(1).asLong()>task,"201及两个真实不同id",r);
        r=request(app,deadline,cancel,"PUT","/api/plans/1/tasks/1/complete",null,bob);assertion(checks,"成员不能修改他人任务",json(r,403),"403",r);
        r=request(app,deadline,cancel,"PUT","/api/plans/1/tasks/6/complete",null,alice);assertion(checks,"跨计划任务编号拒绝",json(r,404),"404",r);
        r=request(app,deadline,cancel,"PUT","/api/plans/1/tasks/"+task+"/complete",null,bob);assertion(checks,"被分配者完成任务",json(r,200)&&body(r).path("status").asText().equals("done"),"done",r);
        if(level==4)return;
        for(String[] req:List.of(new String[]{"GET","/api/plans/1",null,eve},new String[]{"GET","/api/plans/1/tasks?page=bad",null,alice},new String[]{"POST","/api/plans","{broken",alice},new String[]{"PUT","/api/plans/1/tasks/99999/complete",null,alice})){
            r=request(app,deadline,cancel,req[0],req[1],req[2],req[3]);assertion(checks,"统一错误契约",r.status()>=400&&body(r).path("requestId").asText().matches("[a-f0-9-]{36}")&&r.requestId().equals(body(r).path("requestId").asText())&&!body(r).path("message").asText().isBlank()&&!body(r).path("code").asText().isBlank()&&!r.body().contains("SQLException"),"错误code/message/requestId与响应头编号一致，无内部SQL异常",r);
        }
        var logs=cmd(deadline,cancel,"exec",app,"cat","/tmp/server.log");checks.add(new CheckReport.Assertion("请求日志与凭据保护",logs.output().contains("requestId=")&&!logs.output().contains("Learn-2026!")&&!logs.output().contains(alice)&&!logs.output().contains(bob),"日志包含请求编号、不含密码/令牌",logs.output().contains("requestId=")?"已检查请求编号和敏感字段":"未发现请求编号"));
        if(level<7)return;
        r=request(app,deadline,cancel,"GET","/",null);assertion(checks,"配套前端与同源API",r.status()==200&&r.type().startsWith("text/html")&&r.body().contains("id=\"login-form\"")&&r.body().contains("/tasks/batch")&&r.body().contains("textContent"),"登录/任务/权限演示HTML，动态文本安全输出",new Response(r.status(),r.type(),"HTML checked"));
        restartApplication(app,deadline,cancel);
        r=request(app,deadline,cancel,"GET","/api/plans/"+plan,null,alice);assertion(checks,"部署重启后计划与会话持久",json(r,200)&&body(r).path("title").asText().equals("O'Reilly <script>"),"重启后原身份和计划保留",r);
    }
    private void verifyTests(String app,Path input,BootProjectSnapshot snapshot,long deadline,BooleanSupplier cancel,List<CheckReport.Assertion> checks) throws Exception {
        Path project=input.resolve("project");boolean documented=Files.isRegularFile(project.resolve("RUN.md"))&&Files.readString(project.resolve("RUN.md")).strip().length()>=80;
        checks.add(new CheckReport.Assertion("可复现运行与表关系说明",documented,"RUN.md至少80字符，说明环境与业务边界",documented?"已提交":"缺少有效RUN.md"));
        var test=maven(app,deadline,cancel,"-DfailIfNoTests=true","test");checks.add(new CheckReport.Assertion("真实API集成测试",test.code()==0&&test.output().matches("(?s).*Tests run: [1-9][0-9]*.*"),"至少一个JUnit测试通过",test.output()));
        // A fixed faulty implementation is independent of the learner's chosen classes.
        // Submitted tests must catch cross-plan reads being incorrectly allowed.
        Path mutation=input.resolve("mutation");
        try(var paths=Files.walk(project)){for(Path path:paths.filter(Files::isRegularFile).toList())if(path.toString().contains("src\\test")||path.toString().contains("src/test")||path.getFileName().toString().equals("pom.xml")){Path out=mutation.resolve(project.relativize(path));Files.createDirectories(out.getParent());Files.copy(path,out);}}
        for(String name:List.of("Application","AuthService","PlanService","BusinessController","Problem","ApiErrors","RequestLog")){
            Path out=mutation.resolve("src/main/java/"+snapshot.startupPackage().replace('.','/')+"/"+(name.equals("Application")?snapshot.startupName():name)+".java");Files.createDirectories(out.getParent());String source;
            try(var in=getClass().getResourceAsStream("/runner/collaboration/mutation/"+name+".java")){source=new String(Objects.requireNonNull(in).readAllBytes(),StandardCharsets.UTF_8);}
            Files.writeString(out,snapshot.mutationSource(source));
        }
        require(cmd(deadline,cancel,"exec",app,"cp","-R","/input/mutation","/tmp/mutation"));
        var bad=cmd(deadline,cancel,"exec","--workdir=/tmp/mutation",app,"sh","/opt/maven/bin/mvn","-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository","-DfailIfNoTests=true","test");
        checks.add(new CheckReport.Assertion("越权变式检测",bad.code()!=0&&bad.output().contains("Failures:")&&!bad.output().contains("COMPILATION ERROR"),"移除成员检查后，提交测试出现断言失败",bad.output()));
    }

}

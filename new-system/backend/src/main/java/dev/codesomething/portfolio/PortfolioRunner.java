package dev.codesomething.portfolio;
import dev.codesomething.boot.*;

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
public final class PortfolioRunner {
    private final String docker;private final Path root;private final int timeout;
    private final JsonMapper json=JsonMapper.builder().build();
    private record Command(int code,String output) {}
    private static class Stop extends Exception {final String status;Stop(String status){this.status=status;}}
    public PortfolioRunner(String docker,Path root,int timeout){this.docker=docker;this.root=root;this.timeout=timeout;}
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
        for(String name:List.of("cs-r8-app-"+id,"cs-r8-db-"+id)) {
            var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"container","inspect",name);
            if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Config").path("Labels").path("codesomething.r8-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"rm","-f",name));
        }
        String name="cs-r8-net-"+id;var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","inspect",name);
        if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Labels").path("codesomething.r8-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","rm",name));
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
        if(!UUID.fromString(id).toString().equals(id)||!"1.0.0".equals(version)||!Set.of("core","transfer").contains(stage))throw new IllegalArgumentException();
        String policy=PortfolioController.RULE+"/"+stage,app="cs-r8-app-"+id,db="cs-r8-db-"+id,net="cs-r8-net-"+id,owner=UUID.randomUUID().toString(),secret=UUID.randomUUID().toString().replace("-","");
        boolean database=true,createdInput=false,attemptApp=false,attemptDb=false,attemptNet=false;
        String image="",harness="",status="environment_error",log="";Path input=root.resolve(id);var checks=new ArrayList<CheckReport.Assertion>();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try {
            if(cancelled.getAsBoolean())throw new Stop("cancelled");
            byte[] lock,probe;try(var in=getClass().getResourceAsStream(database?"/runner/boot/jdbc-image-lock.json":"/runner/boot/image-lock.json")){lock=Objects.requireNonNull(in,"镜像锁缺失").readAllBytes();}
            var config=json.readTree(lock);image=config.path("image").asText();
            if(!image.matches("sha256:[a-f0-9]{64}")||!WorkspaceController.hash(BootProjectSnapshot.trustedPom(database).getBytes(StandardCharsets.UTF_8)).equals(config.path("pomDigest").asText()))throw new IOException("固定POM与镜像不匹配");
            image=dev.codesomething.boot.MavenBuildEnvironment.prepare(docker,root,snapshot,database,image,cancelled);
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
            try(var in=getClass().getResourceAsStream("/runner/collaboration/R7Probe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            String seed;
            try(var stream=getClass().getResourceAsStream("/runner/portfolio/seed.sql")){seed="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE cs_lab CHARACTER SET utf8mb4; CREATE USER 'learner'@'%' IDENTIFIED BY '"+secret+"'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,REFERENCES ON cs_lab.* TO 'learner'@'%'; USE cs_lab; "+new String(Objects.requireNonNull(stream).readAllBytes(),StandardCharsets.UTF_8);}
            String implementation;
            try(var in=getClass().getResourceAsStream("PortfolioRunner.class")){implementation=WorkspaceController.hash(Objects.requireNonNull(in).readAllBytes());}

            harness=WorkspaceController.hash((WorkspaceController.hash(probe)+WorkspaceController.hash(lock)+WorkspaceController.hash(dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE.getBytes(StandardCharsets.UTF_8))+policy+seed.replace(secret,"<per-job-secret>")+MysqlEnvironment.IMAGE+implementation).getBytes(StandardCharsets.UTF_8));
            Files.createDirectories(root);Files.createDirectory(input);createdInput=true;
            for(var file:snapshot.files()){Path path=input.resolve("project").resolve(file.path());Files.createDirectories(path.getParent());Files.writeString(path,file.content());}
            Files.write(input.resolve("R7Probe.java"),probe);
            Files.writeString(input.resolve("WaitForHttp.java"),dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE);
            if(database) {
                attemptNet=true;require(cmd(deadline,cancelled,"network","create","--internal","--label=codesomething.r8-owner="+owner,"--label=codesomething.r8-job="+id,net));
                attemptDb=true;require(cmd(deadline,cancelled,"run","-d","--pull=never","--name",db,"--label=codesomething.r8-owner="+owner,"--label=codesomething.r8-job="+id,"--network",net,"--network-alias=database","--user=999:999","--read-only","--memory=640m","--memory-swap=640m","--cpus=1","--pids-limit=256","--cap-drop=ALL","--security-opt=no-new-privileges","--log-driver=none","--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=256m,mode=1777","--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777","--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777","--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes","--env=MYSQL_ROOT_HOST=localhost",MysqlEnvironment.IMAGE,"--local-infile=0","--max-connections=15","--innodb-buffer-pool-size=64M","--performance-schema=OFF","--skip-log-bin"));
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
            var create=new ArrayList<>(List.of("create","--name",app,"--label=codesomething.r8-owner="+owner,"--label=codesomething.r8-job="+id,"--pull=never","--network="+(database?net:"none"),"--read-only","--cpus=1","--memory=640m","--memory-swap=640m","--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges","--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777","--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp","--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp"));
            if(database)create.addAll(List.of("--env=SPRING_DATASOURCE_URL=jdbc:mysql://database:3306/cs_lab?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8","--env=SPRING_DATASOURCE_USERNAME=learner","--env=SPRING_DATASOURCE_PASSWORD="+secret,"--env=SPRING_SQL_INIT_MODE=never"));
            create.addAll(List.of(image,"sleep","360"));attemptApp=true;require(cmd(deadline,cancelled,create.toArray(String[]::new)));require(cmd(deadline,cancelled,"start",app));
            require(cmd(deadline,cancelled,"exec",app,"cp","-R","/input/project","/tmp/project"));
            var build=maven(app,deadline,cancelled,"-DskipTests","package");
            checks.add(new CheckReport.Assertion("离线Maven构建",build.code()==0,"按工程pom.xml构建成功",build.code()==0?"工程已按原始pom.xml离线编译并打包。":build.output()));
            if(build.code()!=0){status=build.output().contains("COMPILATION ERROR")||build.output().contains("Unable to find main class")?"compile_error":"environment_error";log=build.output();}
            else {
                start(app,deadline,cancelled);
                verify(app,db,deadline,cancelled,stage,checks);
                verifyTests(app,input,deadline,cancelled,checks);
                var logs=cmd(deadline,cancelled,"exec",app,"head","-c","8192","/tmp/server.log");log=logs.output();
                status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";
            }
        }catch(InterruptedException e){status="cancelled";log=e.getMessage();}
        catch(Stop e){status=e.status;log=e.status.equals("cancelled")?"检查已取消。":"检查超出"+timeout+"秒限制。";}
        catch(Exception e){status="environment_error";log=e.getClass().getSimpleName()+": "+e.getMessage();if(attemptApp)try{var startup=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"exec",app,"cat","/tmp/server.log");if(startup.code()==0&&!startup.output().isBlank()){status="business_error";log+="\n"+startup.output();checks.add(new CheckReport.Assertion("应用启动与接口可达性",false,"工程正常启动",startup.output()));}}catch(Exception ignored){}}
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
        if(owner.equals(labels.path("codesomething.r8-owner").asText())){if(network)require(cmd(deadline,()->false,"network","rm",name));else require(cmd(deadline,()->false,"rm","-f",name));}
    }
    private Command maven(String app,long deadline,BooleanSupplier cancel,String... goals) throws Exception {var args=new ArrayList<>(List.of("exec","--workdir=/tmp/project",app,"sh","/opt/maven/bin/mvn","-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository"));args.addAll(List.of(goals));return cmd(deadline,cancel,args.toArray(String[]::new));}
    private void start(String app,long deadline,BooleanSupplier cancel) throws Exception {require(cmd(deadline,cancel,"exec","--workdir=/tmp/project","-d",app,"sh","-c",dev.codesomething.boot.MavenBuildEnvironment.START_JAR));require(cmd(deadline,cancel,"exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","WaitForHttp"));}
    private void restartApplication(String app,long deadline,BooleanSupplier cancel) throws Exception {require(cmd(deadline,cancel,"exec",app,"sh","-c","kill $(cat /tmp/server.pid)"));Thread.sleep(600);start(app,deadline,cancel);}
    private String login(String app,long deadline,BooleanSupplier cancel,String username,List<CheckReport.Assertion> checks) throws Exception {
        var r=request(app,deadline,cancel,"POST","/api/auth/login","{\"username\":\""+username+"\",\"password\":\"Learn-2026!\"}");
        String token=body(r).path("token").asText();
        assertion(checks,"登录 "+username,json(r,200)&&!token.isBlank(),"200与非空登录令牌",new Response(r.status(),r.type(),"<login credentials redacted>"));
        return !token.isBlank()?token:null;
    }

    private int available(String app,long d,BooleanSupplier c,long id)throws Exception {
        var r=request(app,d,c,"GET","/api/resources",null,currentToken);
        for(var item:body(r))if(item.path("id").asLong()==id)return item.path("available").asInt(-999);
        return -999;
    }
    private String currentToken;
    private void verify(String app,String db,long d,BooleanSupplier c,String stage,List<CheckReport.Assertion> checks)throws Exception {
        var r=request(app,d,c,"GET","/api/health",null);assertion(checks,"应用可启动",json(r,200)&&body(r).path("status").asText().equals("ok"),"200 status=ok",r);
        r=request(app,d,c,"POST","/api/auth/login","{\"username\":\"alice\",\"password\":\"wrong\"}");assertion(checks,"密码错误拒绝",json(r,401),"401",r);
        r=request(app,d,c,"GET","/api/resources",null);assertion(checks,"资源要求身份",json(r,401),"401",r);
        final String alice=login(app,d,c,"alice",checks),bob=login(app,d,c,"bob",checks);if(alice==null||bob==null)return;currentToken=alice;
        r=request(app,d,c,"GET","/api/resources",null,alice);assertion(checks,"初始资源与容量",json(r,200)&&body(r).isArray()&&available(app,d,c,1)==3&&available(app,d,c,2)==2,"资源1容量3、资源2容量2",r);
        for(String bad:List.of("{\"resourceId\":1,\"quantity\":0}","{\"resourceId\":1,\"quantity\":-1}","{\"resourceId\":1,\"quantity\":\"1\"}","{\"resourceId\":1,\"quantity\":1.5}","{}")){
            r=request(app,d,c,"POST","/api/reservations",bad,alice);assertion(checks,"非法预约拒绝",json(r,400)&&!body(r).path("message").asText().isBlank(),"400与message",r);
        }
        r=request(app,d,c,"POST","/api/reservations","{\"resourceId\":99999,\"quantity\":1}",alice);assertion(checks,"未知资源",json(r,404),"404",r);
        r=request(app,d,c,"POST","/api/reservations","{\"resourceId\":1,\"quantity\":2,\"userId\":2}",alice);
        long booking=body(r).path("id").asLong(-1);assertion(checks,"预约原子扣减",json(r,201)&&booking>0&&body(r).path("resourceId").asLong()==1&&body(r).path("quantity").asInt()==2&&body(r).path("status").asText().equals("active")&&available(app,d,c,1)==1,"201，剩余1",r);
        r=request(app,d,c,"GET","/api/reservations",null,bob);assertion(checks,"身份隔离与伪造userId无效",json(r,200)&&body(r).isArray()&&body(r).isEmpty(),"bob无预约",r);
        r=request(app,d,c,"GET","/api/reservations?resourceId=2",null,alice);assertion(checks,"资源筛选",json(r,200)&&body(r).isArray()&&body(r).isEmpty(),"空数组",r);
        r=request(app,d,c,"POST","/api/reservations","{\"resourceId\":1,\"quantity\":2}",bob);assertion(checks,"不足库存无副作用",json(r,409)&&available(app,d,c,1)==1,"409且库存仍1",r);
        r=request(app,d,c,"DELETE","/api/reservations/"+booking,null,bob);assertion(checks,"他人不能取消",json(r,403)&&available(app,d,c,1)==1,"403且库存不变",r);
        r=request(app,d,c,"DELETE","/api/reservations/99999",null,alice);assertion(checks,"不存在预约",json(r,404),"404",r);
        for(int i=0;i<2;i++){r=request(app,d,c,"DELETE","/api/reservations/"+booking,null,alice);assertion(checks,"幂等取消"+i,r.status()==204&&r.body().isEmpty()&&available(app,d,c,1)==3,"204，库存3",r);}
        // Two external clients compete for the final single item, not a sequential imitation.
        r=request(app,d,c,"POST","/api/reservations","{\"resourceId\":1,\"quantity\":2}",alice);
        try(var pool=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){
            var one=pool.submit(()->request(app,d,c,"POST","/api/reservations","{\"resourceId\":1,\"quantity\":1}",alice));
            var two=pool.submit(()->request(app,d,c,"POST","/api/reservations","{\"resourceId\":1,\"quantity\":1}",bob));
            var a=one.get();var b=two.get();assertion(checks,"并发争抢不能超卖",((a.status()==201&&b.status()==409)||(a.status()==409&&b.status()==201))&&available(app,d,c,1)==0,"一个201一个409，库存0",new Response(200,"application/json",a.status()+" / "+b.status()));
        }
        // Reset through public cancellation; the runner never assumes learner table names.
        for(String token:List.of(alice,bob)){var list=request(app,d,c,"GET","/api/reservations",null,token);for(var item:body(list))if(item.path("status").asText().equals("active"))request(app,d,c,"DELETE","/api/reservations/"+item.path("id").asLong(),null,token);}
        if(stage.equals("transfer")){
            r=request(app,d,c,"POST","/api/reservations/batch","[{\"resourceId\":1,\"quantity\":1},{\"resourceId\":2,\"quantity\":99}]",alice);assertion(checks,"失败整批回滚",json(r,409)&&available(app,d,c,1)==3&&available(app,d,c,2)==2,"409，两资源库存不变",r);
            r=request(app,d,c,"POST","/api/reservations/batch","[{\"resourceId\":1,\"quantity\":2},{\"resourceId\":1,\"quantity\":2}]",alice);assertion(checks,"重复资源累计校验",json(r,409)&&available(app,d,c,1)==3,"409，不得部分提交",r);
            for(String bad:List.of("[]","[{\"resourceId\":1,\"quantity\":1}]","[{\"resourceId\":1,\"quantity\":1},{\"resourceId\":2,\"quantity\":0}]")){
                r=request(app,d,c,"POST","/api/reservations/batch",bad,alice);assertion(checks,"批量非法输入回滚",json(r,400)&&available(app,d,c,1)==3,"400，库存不变",r);
            }
            r=request(app,d,c,"POST","/api/reservations/batch","[{\"resourceId\":1,\"quantity\":1},{\"resourceId\":2,\"quantity\":1}]",alice);assertion(checks,"批量成功",json(r,201)&&body(r).isArray()&&body(r).size()==2&&available(app,d,c,1)==2&&available(app,d,c,2)==1,"201两项与正确库存",r);
        }
        r=request(app,d,c,"POST","/api/reservations","{\"resourceId\":2,\"quantity\":1}",alice);long persisted=body(r).path("id").asLong(-1);int before=available(app,d,c,2);
        r=request(app,d,c,"GET","/",null);assertion(checks,"部署前端入口",r.status()==200&&r.type().startsWith("text/html")&&r.body().contains("/api/")&&r.body().contains("<form"),"同源业务表单与API入口",new Response(r.status(),r.type(),"HTML checked"));
        restartApplication(app,d,c);String afterLogin=login(app,d,c,"alice",checks);currentToken=afterLogin;
        r=request(app,d,c,"GET","/api/reservations",null,afterLogin);boolean found=false;for(var item:body(r))if(item.path("id").asLong()==persisted&&item.path("status").asText().equals("active"))found=true;
        assertion(checks,"部署重启持久化",json(r,200)&&found&&available(app,d,c,2)==before,"原预约和库存保留",r);
    }
    private void verifyTests(String app,Path input,long d,BooleanSupplier c,List<CheckReport.Assertion> checks)throws Exception {
        Path run=input.resolve("project/RUN.md");boolean doc=Files.isRegularFile(run)&&Files.readString(run).strip().length()>=80;
        checks.add(new CheckReport.Assertion("运行文档",doc,"提交环境、表关系、测试、部署与取舍说明，至少80字符",doc?"已提交，内容待回访核实":"缺少有效RUN.md"));
        var result=maven(app,d,c,"-DfailIfNoTests=true","test");boolean tests=result.code()==0&&result.output().matches("(?s).*Tests run: [1-9][0-9]*.*");
        checks.add(new CheckReport.Assertion("真实JUnit执行",tests,"至少一个有效运行的JUnit测试通过，测试质量由回访复核",result.output()));
    }
}

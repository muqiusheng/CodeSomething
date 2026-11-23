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
public final class BootProjectRunner {
    private final String docker;private final Path root;private final int timeout;
    private final boolean publicSandbox;
    private final ThreadLocal<String> databasePassword=new ThreadLocal<>();
    private final JsonMapper json=JsonMapper.builder().build();
    private record Command(int code,String output) {}
    private static class Stop extends Exception {final String status;Stop(String status){this.status=status;}}
    public BootProjectRunner(String docker,Path root,int timeout){this(docker,root,timeout,false);}
    public BootProjectRunner(String docker, Path root, int timeout, boolean publicSandbox) {
        this.docker=docker;this.root=root;this.timeout=timeout;this.publicSandbox=publicSandbox;
    }
    private Command cmd(long deadline,BooleanSupplier cancelled,String... args) throws Exception {
        if(publicSandbox) deadline=PublicJdbcSandbox.activeDeadline(deadline);
        dev.codesomething.workspaces.CheckProgress.command(List.of(args));
        if(cancelled.getAsBoolean())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");
        var argv=new ArrayList<String>();argv.add(docker);argv.addAll(publicSandbox?PublicJdbcSandbox.rootCommand(List.of(args),databasePassword.get()):List.of(args));
        var p=new ProcessBuilder(argv).redirectErrorStream(true).start();var bytes=new ByteArrayOutputStream();
        var reader=Thread.ofVirtual().start(()->{try(var input=p.getInputStream()){byte[] buffer=new byte[2048];int n;while((n=input.read(buffer))!=-1)synchronized(bytes){int room=32768-bytes.size();if(room>0)bytes.write(buffer,0,Math.min(n,room));}}catch(IOException ignored){}});
        try{while(!p.waitFor(75,TimeUnit.MILLISECONDS)){if(cancelled.getAsBoolean())throw new Stop("cancelled");if(System.nanoTime()>deadline)throw new Stop("timed_out");}reader.join(1000);synchronized(bytes){return new Command(p.exitValue(),bytes.toString(StandardCharsets.UTF_8));}}
        finally{if(p.isAlive())p.destroyForcibly();}
    }
    private static String require(Command c) throws IOException {if(c.code()!=0)throw new IOException(c.output());return c.output();}
    public void recover(String id) throws Exception {
        if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException();
        for(String name:List.of("cs-r33-db-"+id,"cs-r33-app-"+id)) {
            var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"container","inspect",name);
            if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Config").path("Labels").path("codesomething.r33-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"rm","-f",name));
        }
        String name="cs-r33-net-"+id;var inspected=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","inspect",name);
        if(inspected.code()==0&&id.equals(json.readTree(inspected.output()).get(0).path("Labels").path("codesomething.r33-job").asText()))require(cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"network","rm",name));
        Path input=root.resolve(id);
        if(Files.isDirectory(input,LinkOption.NOFOLLOW_LINKS))try(var paths=Files.walk(input)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}
    }
    private record Response(int status,String type,String body) {}
    private Response request(String app,long deadline,BooleanSupplier cancelled,String method,String path,String body) throws Exception {
        String payload=body==null?"-":Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8));
        var args=new ArrayList<>(publicSandbox?PublicJdbcSandbox.probe(app,method,path,payload,"-")
            :List.of("exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","BootProbe",method,path));
        if(!publicSandbox&&body!=null)args.add(payload);
        var result=cmd(deadline,cancelled,args.toArray(String[]::new));
        if(result.code()!=0)return new Response(0,"",result.output());var lines=result.output().split("\\R",-1);
        if(lines.length<3)throw new IOException("HTTP探针输出不完整");
        return new Response(Integer.parseInt(lines[0]),new String(Base64.getDecoder().decode(lines[1]),StandardCharsets.UTF_8),new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8));
    }
    private JsonNode body(Response r){try{return json.readTree(r.body());}catch(Exception e){return json.readTree("null");}}
    private boolean json(Response r,int status){return r.status()==status&&r.type().toLowerCase(Locale.ROOT).split(";")[0].strip().equals("application/json");}
    private void assertion(List<CheckReport.Assertion> checks,String name,boolean passed,String expected,Response actual){checks.add(new CheckReport.Assertion(name,passed,expected,"HTTP "+actual.status()+" "+actual.body()));}
    public BootCheckRunner.Outcome run(String id,BootProjectSnapshot snapshot,String version,String stage,BooleanSupplier cancelled) {
        if(!publicSandbox) return runJob(id,snapshot,version,stage,cancelled);
        try(var slot=PublicJdbcSandbox.acquire(cancelled)) {
            if(slot!=null) return runJob(id,snapshot,version,stage,cancelled);
        }
        return new BootCheckRunner.Outcome("cancelled",new CheckReport(snapshot.digest(),version,stage,
            BootCourses.policy(stage),"","",false,List.of(),"检查已取消。",Instant.now().toString()));
    }

    private BootCheckRunner.Outcome runJob(String id,BootProjectSnapshot snapshot,String version,String stage,BooleanSupplier cancelled) {
        if(!UUID.fromString(id).toString().equals(id)||!BootCourses.VERSION.equals(version))throw new IllegalArgumentException();
        String policy=BootCourses.policy(stage),app="cs-r33-app-"+id,db="cs-r33-db-"+id,net="cs-r33-net-"+id,owner=UUID.randomUUID().toString(),secret=UUID.randomUUID().toString().replace("-","");
        boolean database=BootCourses.jdbc(stage),createdInput=false,attemptApp=false,attemptDb=false,attemptNet=false;
        String image="",harness="",status="environment_error",log="";Path input=root.resolve(id);var checks=new ArrayList<CheckReport.Assertion>();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
        try {
            byte[] lock,probe;try(var in=getClass().getResourceAsStream(database?"/runner/boot/jdbc-image-lock.json":"/runner/boot/image-lock.json")){lock=Objects.requireNonNull(in,"镜像锁缺失").readAllBytes();}
            var config=json.readTree(lock);image=config.path("image").asText();
            if(!image.matches("sha256:[a-f0-9]{64}")||!WorkspaceController.hash(BootProjectSnapshot.trustedPom(database).getBytes(StandardCharsets.UTF_8)).equals(config.path("pomDigest").asText()))throw new IOException("固定POM与镜像不匹配");
            image=publicSandbox?MavenBuildEnvironment.preparePublic(docker,root,snapshot,database,image,cancelled)
                :MavenBuildEnvironment.prepare(docker,root,snapshot,database,image,cancelled);
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeout);
            try(var in=getClass().getResourceAsStream("/runner/boot/BootProbe.java")){probe=Objects.requireNonNull(in).readAllBytes();}
            String seed="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE cs_lab CHARACTER SET utf8mb4; CREATE USER 'learner'@'%' IDENTIFIED BY '"+secret+"'; GRANT SELECT,INSERT,UPDATE,DELETE ON cs_lab.* TO 'learner'@'%'; USE cs_lab; CREATE TABLE tasks(id BIGINT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(100) NOT NULL,completed BOOLEAN NOT NULL DEFAULT 0); INSERT INTO tasks VALUES(1,'学习 HTTP',0),(2,'复习 SQL',1),(3,'练习 JDBC',0),(4,'阅读 Java',1),(5,'完成项目',0); CREATE TABLE bookmarks(id BIGINT PRIMARY KEY AUTO_INCREMENT,title VARCHAR(100) NOT NULL,saved BOOLEAN NOT NULL DEFAULT 0); INSERT INTO bookmarks VALUES(1,'Java文档',0),(2,'SQL手册',1),(3,'接口笔记',0),(4,'开发指南',1),(5,'数据库指南',0);";
            String implementation;
            try(var in=getClass().getResourceAsStream("BootProjectRunner.class")){implementation=WorkspaceController.hash(Objects.requireNonNull(in).readAllBytes());}
            if(stage.equals("a-transfer"))for(String file:List.of("Application.java","HealthController.java","TaskRepository.java","TaskService.java","TaskController.java","ApiErrors.java"))
                try(var in=getClass().getResourceAsStream("/runner/boot/mutation/"+file)){implementation+=WorkspaceController.hash(Objects.requireNonNull(in).readAllBytes());}
            harness=WorkspaceController.hash((WorkspaceController.hash(probe)+WorkspaceController.hash(lock)+WorkspaceController.hash(dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE.getBytes(StandardCharsets.UTF_8))+policy+seed.replace(secret,"<per-job-secret>")+MysqlEnvironment.IMAGE+implementation).getBytes(StandardCharsets.UTF_8));
            Files.createDirectories(root);Files.createDirectory(input);createdInput=true;
            if(publicSandbox)PublicJdbcSandbox.writeProbe(input);
            for(var file:snapshot.files()){Path path=input.resolve("project").resolve(file.path());Files.createDirectories(path.getParent());Files.writeString(path,file.content());}
            Files.write(input.resolve("BootProbe.java"),probe);
            Files.writeString(input.resolve("WaitForHttp.java"),dev.codesomething.boot.MavenBuildEnvironment.READINESS_SOURCE);
            var create=new ArrayList<>(List.of("create","--name",app,"--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,"--pull=never","--network="+(database&&!publicSandbox?net:"none"),"--read-only","--cpus=1","--memory=640m","--memory-swap=640m","--pids-limit=128","--cap-drop=ALL","--security-opt=no-new-privileges","--user=65534:65534","--log-driver=none","--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777","--env=MAVEN_OPTS=-Xmx192m -XX:ActiveProcessorCount=1 -Duser.home=/tmp","--mount","type=bind,source="+input+",target=/input,readonly","--workdir=/tmp"));
            if(publicSandbox) {
                PublicJdbcSandbox.configureApp(create,root,id);
                create.add("--env=JAVA_TOOL_OPTIONS=-XX:ActiveProcessorCount=1 -XX:+UseSerialGC");
            }
            if(database)create.addAll(List.of("--env=SPRING_DATASOURCE_URL=jdbc:mysql://"+(publicSandbox?"127.0.0.1":"database")+":3306/cs_lab?useSSL=false&allowPublicKeyRetrieval=true&characterEncoding=UTF-8","--env=SPRING_DATASOURCE_USERNAME=learner","--env=SPRING_DATASOURCE_PASSWORD="+secret,"--env=SPRING_SQL_INIT_MODE=never"));
            create.addAll(List.of(image,"sleep","240"));
            if(publicSandbox) { attemptApp=true;require(cmd(deadline,cancelled,create.toArray(String[]::new)));require(cmd(deadline,cancelled,"start",app)); }
            if(database) {
                if (publicSandbox) {
                    attemptDb=true;
                    String bootstrap=UUID.randomUUID().toString();
                    databasePassword.set(bootstrap);
                    require(cmd(deadline,cancelled,PublicJdbcSandbox.database(root,db,app,id,
                        "codesomething.r33-owner="+owner,"codesomething.r33-job="+id,MysqlEnvironment.IMAGE,bootstrap)));
                } else {
                    attemptNet=true;require(cmd(deadline,cancelled,"network","create","--internal","--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,net));
                    attemptDb=true;require(cmd(deadline,cancelled,"run","-d","--pull=never","--name",db,"--label=codesomething.r33-owner="+owner,"--label=codesomething.r33-job="+id,"--network",net,"--network-alias=database","--user=999:999","--read-only","--memory=640m","--memory-swap=640m","--cpus=1","--pids-limit=256","--cap-drop=ALL","--security-opt=no-new-privileges","--log-driver=none","--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=256m,mode=1777","--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777","--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777","--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes","--env=MYSQL_ROOT_HOST=localhost",MysqlEnvironment.IMAGE,"--local-infile=0","--max-connections=15","--innodb-buffer-pool-size=64M","--performance-schema=OFF","--skip-log-bin"));
                }
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
            if(!publicSandbox) { attemptApp=true;require(cmd(deadline,cancelled,create.toArray(String[]::new)));require(cmd(deadline,cancelled,"start",app)); }
            require(cmd(deadline,cancelled,"exec",app,"cp","-R","/input/project","/tmp/project"));
            var build=maven(app,deadline,cancelled,"-DskipTests","package");
            checks.add(new CheckReport.Assertion("离线Maven构建",build.code()==0,"按工程pom.xml构建成功",build.code()==0?"工程已按原始pom.xml离线编译并打包。":build.output()));
            if(build.code()!=0){status=build.output().contains("COMPILATION ERROR")||build.output().contains("Unable to find main class")?"compile_error":"environment_error";log=build.output();}
            else {
                start(app,deadline,cancelled);
                verify(app,db,deadline,cancelled,stage,checks);
                if(stage.equals("a-transfer"))verifyTests(app,input,snapshot,deadline,cancelled,checks);
                var logs=cmd(deadline,cancelled,"exec",app,"head","-c","8192","/tmp/server.log");log=logs.output();
                status=checks.stream().allMatch(CheckReport.Assertion::passed)?"passed":"business_error";
            }
        }catch(InterruptedException e){status="cancelled";log=e.getMessage();}
        catch(Stop e){status=e.status;log=e.status.equals("cancelled")?"检查已取消。":publicSandbox?"检查达到隔离运行时限。单次编译或应用运行最多30秒。":"检查超出"+timeout+"秒限制。";}
        catch(Exception e){status="environment_error";log=e.getClass().getSimpleName()+": "+e.getMessage();
            if(attemptApp)try{var startup=cmd(System.nanoTime()+TimeUnit.SECONDS.toNanos(10),()->false,"exec",app,"cat","/tmp/server.log");if(startup.code()==0&&!startup.output().isBlank()){status="business_error";log+="\n"+startup.output();checks.add(new CheckReport.Assertion("应用启动与接口可达性",false,"工程能正常启动并响应本章接口",startup.output()));}}catch(Exception ignored){}
        }
        finally {
            if(publicSandbox) PublicJdbcSandbox.endApplication();
            databasePassword.remove();
            for(var item:List.of(new Object[]{db,false,attemptDb},new Object[]{app,false,attemptApp},new Object[]{net,true,attemptNet}))if((boolean)item[2])try{remove((String)item[0],(boolean)item[1],owner);}catch(Exception e){status="environment_error";log+="\n清理失败："+e.getMessage();}
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
    private Command maven(String app,long deadline,BooleanSupplier cancel,String... goals) throws Exception {
        var args = PublicJdbcSandbox.mavenCommand(app,publicSandbox,goals);
        return cmd(publicSandbox?PublicJdbcSandbox.commandDeadline(deadline):deadline,cancel,args.toArray(String[]::new));
    }
    private void start(String app,long deadline,BooleanSupplier cancel) throws Exception {if(publicSandbox)PublicJdbcSandbox.beginApplication(deadline);require(cmd(deadline,cancel,"exec","--workdir=/tmp/project","-d",app,"sh","-c",PublicJdbcSandbox.startCommand(publicSandbox)));require(cmd(deadline,cancel,"exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","-cp","/opt/codesomething-probes","WaitForHttp"));}
    private void stopApplication(String app,long deadline,BooleanSupplier cancel) throws Exception {
        require(cmd(deadline,cancel,"exec",app,"sh","-c","kill $(cat /tmp/server.pid)"));
        if(publicSandbox) PublicJdbcSandbox.endApplication();
    }
    private void restartApplication(String app,long deadline,BooleanSupplier cancel) throws Exception {
        stopApplication(app,deadline,cancel);
        Thread.sleep(600);
        start(app,deadline,cancel);
    }
    private void verify(String app,String db,long deadline,BooleanSupplier cancel,String stage,List<CheckReport.Assertion> checks) throws Exception {
        if(!BootCourses.jdbc(stage)) {
            BootHttpChecks.verify(stage,(method,path,payload)->{
                var response=request(app,deadline,cancel,method,path,payload);
                return new LocalProjectRunner.Response(response.status(),response.type(),response.body());
            },checks);return;
        }
        String resource=stage.equals("a-transfer")?"bookmarks":"tasks",field=resource.equals("tasks")?"completed":"saved",title=resource.equals("tasks")?"学习 HTTP":"Java文档",base="/api/"+resource;
        var r=request(app,deadline,cancel,"GET",base+"/1",null);assertion(checks,"读取单条与JSON类型",json(r,200)&&body(r).path("id").isNumber()&&body(r).path("id").asLong()==1&&body(r).path("title").asText().equals(title)&&body(r).path(field).isBoolean()&&!body(r).path(field).asBoolean(),"id=1，初始标题与布尔字段",r);
        r=request(app,deadline,cancel,"GET",base+"/99999",null);assertion(checks,"未知编号404",json(r,404)&&body(r).path("message").isString()&&!body(r).path("message").asText().isBlank(),"404与非空message",r);
        boolean pages=Set.of("a-pagination","a-transfer").contains(stage);
        r=request(app,deadline,cancel,"GET",base,null);assertion(checks,"列表",json(r,200)&&(pages?body(r).path("items").isArray()&&body(r).path("total").asLong()==5:body(r).isArray()&&body(r).size()==5),pages?"分页对象与5条初始数据":"5项JSON数组",r);
        if(stage.equals("a-read")) {
            require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-e","DELETE FROM cs_lab.tasks;"));r=request(app,deadline,cancel,"GET",base,null);assertion(checks,"空集合",json(r,200)&&body(r).isArray()&&body(r).isEmpty(),"200与空数组",r);return;
        }
        if(pages) {
            for(int page=0;page<3;page++){r=request(app,deadline,cancel,"GET",base+"?page="+page+"&size=2&"+field+"=false",null);var items=body(r).path("items");boolean valid=json(r,200)&&body(r).path("page").asInt(-1)==page&&body(r).path("size").asInt()==2&&body(r).path("total").asInt()==3&&items.isArray()&&items.size()==(page==0?2:page==1?1:0);if(page==0)valid&=items.path(0).path("id").asInt()==1&&items.path(1).path("id").asInt()==3;if(page==1)valid&=items.path(0).path("id").asInt()==5;assertion(checks,"筛选稳定分页第"+page+"页",valid,"匹配id=1/3/5，total=3，页大小2",r);}
            for(String query:List.of("page=-1","size=0","size=51","page=bad")){r=request(app,deadline,cancel,"GET",base+"?"+query,null);assertion(checks,"拒绝非法分页"+query,json(r,400),"400 JSON",r);}
        }
        r=request(app,deadline,cancel,"POST",base,"{\"title\":\"O'Reilly\",\""+field+"\":false}");long created=body(r).path("id").asLong(-1);assertion(checks,"新增与生成键",json(r,201)&&body(r).path("id").isNumber()&&created>5&&body(r).path("title").asText().equals("O'Reilly")&&body(r).path(field).isBoolean(),"201，自动编号与原样引号标题",r);
        var second=request(app,deadline,cancel,"POST",base,"{\"title\":\"第二条\",\""+field+"\":true}");assertion(checks,"连续生成不同编号",json(second,201)&&body(second).path("id").asLong()>created,"第二个新编号不同",second);
        if(created>0) {
            r=request(app,deadline,cancel,"GET",base+"/"+created,null);assertion(checks,"写入后读取",json(r,200)&&body(r).path("title").asText().equals("O'Reilly"),"引号标题已持久化",r);
            String sql=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","--batch","--skip-column-names","-e","SELECT title FROM cs_lab."+resource+" WHERE id="+created+";"));checks.add(new CheckReport.Assertion("真实数据库记录",sql.strip().equals("O'Reilly"),"O'Reilly",sql));
        }
        if(stage.equals("boot-jdbc")) {
            restartApplication(app,deadline,cancel);r=request(app,deadline,cancel,"GET",base+"/"+created,null);assertion(checks,"重启后持久",json(r,200)&&body(r).path("title").asText().equals("O'Reilly"),"重启应用仍读到引号标题",r);return;
        }
        if(stage.equals("a-create"))return;
        r=request(app,deadline,cancel,"PUT",base+"/"+created,"{\"title\":\"已修改\",\""+field+"\":true}");assertion(checks,"更新目标",json(r,200)&&body(r).path("title").asText().equals("已修改")&&body(r).path(field).isBoolean()&&body(r).path(field).asBoolean(),"200与目标新值",r);
        r=request(app,deadline,cancel,"GET",base+"/1",null);assertion(checks,"其他记录不变",json(r,200)&&body(r).path("title").asText().equals(title),"编号1保持原值",r);
        r=request(app,deadline,cancel,"PUT",base+"/99999","{\"title\":\"x\",\""+field+"\":false}");assertion(checks,"更新未知编号",json(r,404),"404",r);
        r=request(app,deadline,cancel,"DELETE",base+"/"+created,null);assertion(checks,"删除204空体",r.status()==204&&r.body().isEmpty(),"204无响应体",r);
        r=request(app,deadline,cancel,"DELETE",base+"/"+created,null);assertion(checks,"重复删除404",json(r,404),"404",r);
        if(stage.equals("a-update-delete"))return;
        String count=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-N","-e","SELECT COUNT(*) FROM cs_lab."+resource+";"));
        for(String input:List.of("{\"title\":\"  \" ,\""+field+"\":false}","{\"title\":\""+"长".repeat(101)+"\",\""+field+"\":false}","{\"title\":\"x\"}","{\"title\":\"x\",\""+field+"\":\"false\"}","{broken")) {r=request(app,deadline,cancel,"POST",base,input);assertion(checks,"写入前校验",json(r,400)&&body(r).path("message").isString()&&!body(r).path("message").asText().isBlank(),"400与错误message",r);}
        String after=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-N","-e","SELECT COUNT(*) FROM cs_lab."+resource+";"));checks.add(new CheckReport.Assertion("错误输入未写库",count.equals(after),count,after));
        r=request(app,deadline,cancel,"POST",base,"{\"title\":\"  去空格  \",\""+field+"\":false}");assertion(checks,"去首尾空白",json(r,201)&&body(r).path("title").asText().equals("去空格"),"保存去空格后的标题",r);
        if(stage.equals("a-transfer")) {String tasks=require(cmd(deadline,cancel,"exec",db,"mysql","-uroot","-N","-e","SELECT COUNT(*) FROM cs_lab.tasks;"));checks.add(new CheckReport.Assertion("书签与任务隔离",tasks.strip().equals("5"),"5条任务未变",tasks));restartApplication(app,deadline,cancel);long last=body(r).path("id").asLong();r=request(app,deadline,cancel,"GET",base+"/"+last,null);assertion(checks,"迁移重启持久",json(r,200)&&body(r).path("title").asText().equals("去空格"),"重启后仍保留书签",r);}
    }
    private void verifyTests(String app,Path input,BootProjectSnapshot snapshot,long deadline,BooleanSupplier cancel,List<CheckReport.Assertion> checks) throws Exception {
        var project=input.resolve("project");boolean documentation=Files.isRegularFile(project.resolve("RUN.md"))&&Files.readString(project.resolve("RUN.md")).strip().length()>=80;
        checks.add(new CheckReport.Assertion("运行与数据流说明",documentation,"RUN.md至少80字符，说明环境、命令和数据流",documentation?"已提交说明":"请补充RUN.md"));
        if(publicSandbox) stopApplication(app,deadline,cancel);
        var test=maven(app,deadline,cancel,"-DfailIfNoTests=true","test");checks.add(new CheckReport.Assertion("学员自动化测试",test.code()==0&&test.output().matches("(?s).*Tests run: [1-9][0-9]*.*"),"JUnit测试通过且至少一个测试",test.output()));
        // Run the submitted tests against a known incorrect implementation of the documented public interface.
        Path mutationRoot=input.resolve("mutation"),sources=mutationRoot.resolve("src/main/java/"+snapshot.startupPackage().replace('.','/'));
        Files.createDirectories(sources);Files.copy(project.resolve("pom.xml"),mutationRoot.resolve("pom.xml"));
        for(String name:List.of("Application.java","HealthController.java","TaskRepository.java","TaskService.java","TaskController.java","ApiErrors.java"))
            try(var stream=getClass().getResourceAsStream("/runner/boot/mutation/"+name)){String text=new String(Objects.requireNonNull(stream).readAllBytes(),StandardCharsets.UTF_8);Files.writeString(sources.resolve(name.equals("Application.java")?snapshot.startupName()+".java":name),snapshot.mutationSource(text));}
        for(var source:snapshot.files())if(source.path().startsWith("src/test/")){Path target=mutationRoot.resolve(source.path());Files.createDirectories(target.getParent());Files.writeString(target,source.content());}
        require(cmd(deadline,cancel,"exec",app,"cp","-R","/input/mutation","/tmp/mutation"));
        var mutation=cmd(publicSandbox?PublicJdbcSandbox.commandDeadline(deadline):deadline,cancel,"exec","--workdir=/tmp/mutation",app,"sh","/opt/maven/bin/mvn","-B","-ntp","-o","-s","/opt/settings.xml","-Dmaven.repo.local=/opt/repository","-DfailIfNoTests=true","test");
        checks.add(new CheckReport.Assertion("校验变式检测",mutation.code()!=0&&mutation.output().contains("Failures:")&&!mutation.output().contains("COMPILATION ERROR"),"故意允许空白标题后，JUnit出现断言失败",mutation.output()));
    }
}

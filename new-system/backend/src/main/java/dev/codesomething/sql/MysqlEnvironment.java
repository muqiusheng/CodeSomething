package dev.codesomething.sql;

import dev.codesomething.api.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;

@Component
public class MysqlEnvironment {
    public static final String IMAGE="mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902";
    public static final String PRACTICE="cs_practice";
    private final String docker,container;
    private final SqlCourse course;
    private volatile String state="not_checked",message="请启动或连接教学环境。",version="";
    public MysqlEnvironment(SqlCourse course,@Value("${cs.runner.docker}") String docker,@Value("${cs.sql.container:cs-sql-learning}") String container){
        if(!container.matches("cs-sql-[a-z0-9-]{1,70}"))throw new IllegalArgumentException("Invalid SQL container name");
        this.course=course;this.docker=docker;this.container=container;
    }
    public record Environment(String status,String message,String version,String image,String container,String database) {}
    public Environment status(){return new Environment(state,message,version,IMAGE,container,PRACTICE);}
    public static String digest(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    public static class Failure extends RuntimeException {
        public final String status;
        public Failure(String status,String message){super(message);this.status=status;}
    }
    record ProcessResult(int code,String output) {}
    private ProcessResult command(String input,int seconds,BooleanSupplier cancelled,String... args) {
        var command=new ArrayList<String>();command.add(docker);command.addAll(List.of(args));
        Process p=null;
        try {
            p=new ProcessBuilder(command).redirectErrorStream(true).start();
            var process=p;
            var output=CompletableFuture.supplyAsync(()->{try(var in=process.getInputStream();var b=new ByteArrayOutputStream()){
                byte[] buffer=new byte[2048];int count;while((count=in.read(buffer))!=-1){if(b.size()+count>65536){process.destroyForcibly();throw new Failure("output_limit","输出超过64KB，请减少返回数据。");}b.write(buffer,0,count);}return b.toString(StandardCharsets.UTF_8);
            }catch(IOException e){throw new Failure("environment_error","容器输出读取失败。");}});
            try(var writer=p.getOutputStream()){if(input!=null)writer.write(input.getBytes(StandardCharsets.UTF_8));}
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
            while(!p.waitFor(50,TimeUnit.MILLISECONDS)) {
                if(cancelled.getAsBoolean())throw new Failure("cancelled","已停止本次SQL检查。");
                if(System.nanoTime()>deadline)throw new Failure("timeout","SQL执行超时，请缩小查询或重试。");
            }
            try{return new ProcessResult(p.exitValue(),output.get(2,TimeUnit.SECONDS));}catch(ExecutionException e){if(e.getCause() instanceof Failure f)throw f;throw e;}
        }catch(Failure e){throw e;}catch(Exception e){throw new Failure("environment_error","无法调用Docker或MySQL，请检查教学环境后重试。");}
        finally {if(p!=null&&p.isAlive())p.destroyForcibly();}
    }
    private String require(ProcessResult r){if(r.code()!=0)throw new Failure("environment_error","教学MySQL未就绪，请启动环境后重试。");return r.output();}
    private void owned() {
        var r=command(null,5,()->false,"inspect",container);
        if(r.code()==0)try {
            var info=tools.jackson.databind.json.JsonMapper.builder().build().readTree(r.output()).get(0);
            if("1".equals(info.path("Config").path("Labels").path("codesomething.sql").asText())&&IMAGE.equals(info.path("Config").path("Image").asText())&&"none".equals(info.path("HostConfig").path("NetworkMode").asText())&&info.path("HostConfig").path("PortBindings").size()==0)return;
        }catch(Exception ignored){}
        throw new Failure("environment_error","目标容器的标签、镜像或网络不匹配，已拒绝操作。");
    }
    private String root(String sql){return require(command(sql,8,()->false,"exec","-i",container,"mysql","--protocol=socket","-uroot","--batch","--default-character-set=utf8mb4","--binary-mode=1"));}
    public synchronized void start() {
        state="starting";message="正在启动MySQL并准备示例数据…";
        try {
            var found=command(null,5,()->false,"inspect","--format","{{.State.Running}}",container);
            if(found.code()!=0) {
                require(command(null,20,()->false,"run","-d","--pull=never","--name",container,"--label","codesomething.sql=1","--network","none","--memory","640m","--cpus","1","--pids-limit","256","--cap-drop","ALL","--cap-add","SETUID","--cap-add","SETGID","--cap-add","DAC_OVERRIDE","--security-opt","no-new-privileges","--mount","type=volume,source="+container+"-data,target=/var/lib/mysql","-e","MYSQL_ALLOW_EMPTY_PASSWORD=yes",IMAGE,"--skip-networking","--local-infile=0","--max-connections=20","--innodb-buffer-pool-size=64M","--performance-schema=OFF","--character-set-server=utf8mb4","--collation-server=utf8mb4_0900_ai_ci"));
            } else {owned();if(!found.output().trim().equals("true"))require(command(null,10,()->false,"start",container));}
            owned();
            boolean ready=false;
            for(int i=0;i<90;i++) {try{
                var process=command(null,5,()->false,"exec",container,"cat","/proc/1/comm");
                if(!process.output().strip().equals("mysqld"))throw new Failure("environment_error","MySQL初始化中。");
                version=root("SELECT VERSION();").strip().replace("VERSION()\n","");ready=true;break;
            }catch(Failure e){try{Thread.sleep(500);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new Failure("environment_error","环境启动被中断。");}}}
            if(!ready)throw new Failure("environment_error","MySQL启动超时，请检查Docker后重试。");
            root("CREATE DATABASE IF NOT EXISTS cs_practice CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'cs_practice'@'localhost'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE ON cs_practice.* TO 'cs_practice'@'localhost';");
            String tables=root("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='cs_practice' AND table_name='tasks';");
            if(tables.strip().endsWith("\n0"))root("USE cs_practice;"+course.seed(false));
            // Only this labelled, network-isolated instance is owned by this platform.
            for(String schema:root("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'cs_check_%';").lines().skip(1).toList())
                if(schema.matches("cs_check_[a-f0-9]{22}"))cleanup(schema);
            state="ready";message="教学MySQL已就绪；试运行使用cs_practice，正式检查使用独立临时库。";
        }catch(Failure e){state="environment_error";message=e.getMessage();}
    }
    private void ready(){if(!state.equals("ready"))throw new Failure("environment_error","教学MySQL尚未就绪，请先启动环境。");owned();}
    public synchronized void reset(String target) {
        if(!PRACTICE.equals(target))throw new ApiException(HttpStatus.BAD_REQUEST,"RESET_TARGET_REJECTED","只允许重置cs_practice教学练习库。",Map.of());
        ready();
        // Build a replacement first; a failed seed leaves the existing practice tables intact.
        root("DROP DATABASE IF EXISTS cs_reset; CREATE DATABASE cs_reset CHARACTER SET utf8mb4; USE cs_reset;"+course.seed(false));
        String count=root("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cs_practice' AND table_name='tasks';");
        if(count.strip().endsWith("\n1"))root("DROP TABLE IF EXISTS cs_practice.tasks_backup; RENAME TABLE cs_practice.tasks TO cs_practice.tasks_backup,cs_reset.tasks TO cs_practice.tasks; DROP TABLE cs_practice.tasks_backup;");
        else root("RENAME TABLE cs_reset.tasks TO cs_practice.tasks;");
        root("DROP TABLE IF EXISTS cs_practice.bookmarks; DROP DATABASE cs_reset;");
    }
    public record Table(List<String> columns,List<List<String>> rows) {}
    public Table parse(String output) {
        var lines=output.stripTrailing().split("\\R",-1);
        if(output.isBlank())return new Table(List.of(),List.of());
        var columns=List.of(lines[0].split("\t",-1));var rows=new ArrayList<List<String>>();
        for(int i=1;i<lines.length;i++)rows.add(List.of(lines[i].split("\t",-1)));
        if(rows.size()>100)throw new Failure("output_limit","最多返回100行，请使用WHERE或LIMIT缩小结果。");
        return new Table(columns,rows);
    }
    private Table execute(String schema,String sql,BooleanSupplier cancelled){
        ProcessResult r;
        try {r=command("SET SESSION max_execution_time=1500; SET SESSION sql_select_limit=101;"+sql,5,cancelled,"exec","-i",container,"mysql","--protocol=socket","-u"+schema,"--database="+schema,"--batch","--default-character-set=utf8mb4","--binary-mode=1");}
        catch(Failure failure) {
            if(Set.of("timeout","cancelled","output_limit").contains(failure.status)) {
                for(String connection:root("SELECT ID FROM information_schema.PROCESSLIST WHERE USER='"+schema+"';").lines().skip(1).toList())
                    if(connection.matches("[0-9]+"))root("KILL "+connection+";");
            }
            throw failure;
        }
        if(r.code()!=0) {
            if(r.output().contains("ERROR 3024"))throw new Failure("timeout","查询超过1.5秒限制，请缩小结果。");
            if(r.output().contains("ERROR 2002")||r.output().contains("ERROR 1045")||r.output().contains("No such container")||r.output().contains("not running"))throw new Failure("environment_error","MySQL连接失败，请重新启动环境。");
            String detail=r.output().replaceAll("cs_check_[a-f0-9]{22}","检查库");
            throw new Failure("sql_error",detail.substring(0,Math.min(detail.length(),1500)));
        }
        return parse(r.output());
    }
    private void cleanup(String schema){if(!schema.matches("cs_check_[a-f0-9]{22}"))throw new IllegalArgumentException();root("DROP DATABASE IF EXISTS "+schema+"; DROP USER IF EXISTS '"+schema+"'@'localhost';");}
    public synchronized Table practice(String sql,BooleanSupplier cancelled){ready();return execute(PRACTICE,sql,cancelled);}
    public record Assertion(String name,boolean passed,Table expected,Table actual) {}
    public record Outcome(String status,List<Assertion> assertions,Table result,String message,String seedDigest) {}
    public synchronized Outcome check(String id,String stage,String sql,BooleanSupplier cancelled) {
        ready();var assertions=new ArrayList<Assertion>();Table result=null;
        boolean multiple=Set.of("sql-read","sql-page").contains(stage);
        for(int variant=0;variant<(multiple?2:1);variant++) {
            String schema="cs_check_"+UUID.randomUUID().toString().replace("-","").substring(0,22);
            try {
                if(cancelled.getAsBoolean())throw new Failure("cancelled","检查已取消。");
                root("CREATE DATABASE "+schema+" CHARACTER SET utf8mb4; CREATE USER '"+schema+"'@'localhost'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE ON "+schema+".* TO '"+schema+"'@'localhost';");
                if(!Set.of("db-model","sql-transfer").contains(stage))root("USE "+schema+";"+course.seed(variant==1));
                result=execute(schema,sql,cancelled);
                Table actual=result,expected;
                switch(stage) {
                    case "db-connect"->expected=new Table(List.of("connected","current_database"),List.of(List.of("1",schema)));
                    case "db-model"->{
                        actual=structure(schema,"tasks","completed");expected=expectedStructure("completed");
                    }
                    case "sql-read"->expected=variant==0?table(List.of("id","title"),new String[][]{{"1","学习HTTP"},{"3","练习SQL"},{"5","编写接口"},{"6","完成分页"}}):table(List.of("id","title"),new String[][]{{"4","新任务四"},{"7","新任务七"},{"8","新任务八"},{"12","新任务十二"}});
                    case "sql-write"->{actual=execute(schema,"SELECT id,title,completed FROM tasks ORDER BY id;",cancelled);expected=table(List.of("id","title","completed"),new String[][]{{"1","学习HTTP","1"},{"3","练习SQL","0"},{"4","复习JSON","1"},{"5","编写接口","0"},{"6","完成分页","0"},{"9","整理笔记","0"}});}
                    case "sql-page"->expected=variant==0?table(List.of("id","title","completed"),new String[][]{{"5","编写接口","0"},{"6","完成分页","0"}}):table(List.of("id","title","completed"),new String[][]{{"8","新任务八","0"},{"12","新任务十二","0"}});
                    default->{
                        var schemaActual=structure(schema,"bookmarks","saved");
                        assertions.add(new Assertion("书签表约束",expectedStructure("saved").equals(schemaActual),expectedStructure("saved"),schemaActual));
                        var data=execute(schema,"SELECT id,title,saved FROM bookmarks ORDER BY id;",cancelled);
                        var expectedData=table(List.of("id","title","saved"),new String[][]{{"1","Java文档","1"},{"3","接口笔记","0"}});
                        assertions.add(new Assertion("迁移后的全部数据",expectedData.equals(data),expectedData,data));
                        expected=table(List.of("id","title"),new String[][]{{"3","接口笔记"}});
                    }
                }
                assertions.add(new Assertion(variant==0?"目标行为":"另一组数据",expected.equals(actual),expected,actual));
            } finally {cleanup(schema);}
        }
        boolean passed=assertions.stream().allMatch(Assertion::passed);
        return new Outcome(passed?"passed":"business_error",assertions,result,passed?"功能检查通过，可以完成本关编码；概念巩固可选。":"SQL可以执行，但结果未符合约定，请对照预期与实际。",digest(course.seed(false)+course.seed(true)));
    }
    private Table structure(String schema,String table,String flag){return parse(root("SELECT column_name,column_type,is_nullable,column_key,COALESCE(column_default,'NULL') AS default_value FROM information_schema.columns WHERE table_schema='"+schema+"' AND table_name='"+table+"' ORDER BY ordinal_position;"));}
    private Table expectedStructure(String flag){return table(List.of("COLUMN_NAME","COLUMN_TYPE","IS_NULLABLE","COLUMN_KEY","default_value"),new String[][]{{"id","int","NO","PRI","NULL"},{"title","varchar(100)","NO","","NULL"},{flag,"tinyint(1)","NO","","0"}});}
    private Table table(List<String> columns,String[][] rows){return new Table(columns,Arrays.stream(rows).map(r->List.of(r)).toList());}
}

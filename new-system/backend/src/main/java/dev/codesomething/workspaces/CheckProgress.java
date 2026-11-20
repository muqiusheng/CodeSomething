package dev.codesomething.workspaces;

import java.util.*;

/** Observable milestones, never a clock-based estimate of remaining work. */
public final class CheckProgress {
    public record Progress(String phase,String label,int step,int total) {}
    private static final ThreadLocal<String> CURRENT=new ThreadLocal<>();
    private static final Map<String,Progress> RECENT=new LinkedHashMap<>();
    private CheckProgress() {}
    public static void begin(String id){CURRENT.set(id);update("preparing","正在准备项目依赖与运行环境",1);}
    public static void end(){CURRENT.remove();}
    public static synchronized void fallback(){String id=CURRENT.get();if(id!=null)RECENT.put(id,new Progress("preparing","本机环境不可用，正在准备备用隔离环境",1,5));}
    public static synchronized void update(String phase,String label,int step){
        String id=CURRENT.get();if(id==null)return;
        var previous=RECENT.get(id);if(previous!=null&&previous.step()>step)return;
        RECENT.put(id,new Progress(phase,label,step,5));
        while(RECENT.size()>256)RECENT.remove(RECENT.keySet().iterator().next());
    }
    public static void command(List<String> args){
        if(CURRENT.get()==null||args.isEmpty())return;
        if(args.getFirst().equals("rm")||(args.getFirst().equals("network")&&args.contains("rm"))){update("finishing","正在整理结果与释放检查环境",5);return;}
        if(args.stream().anyMatch(s->s.endsWith("/mvn")||s.equals("mvn"))){
            if(args.contains("test")&&!args.contains("package"))update("checking","正在验证接口与自动化测试",4);
            else update("compiling","正在按项目配置编译代码",2);
        } else if(args.contains("javac")&&args.stream().anyMatch(s->s.endsWith("/TaskServer.java")))update("compiling","正在编译项目代码",2);
        else if(args.stream().anyMatch(s->s.contains("WaitForHttp.java")||s.equals("WaitForHttp")||s.contains("exec java ")))update("starting","正在启动应用并等待服务就绪",3);
        else if(!args.contains("javac")&&args.stream().anyMatch(s->s.endsWith("Probe.java")||s.equals("Probe")||s.equals("BootProbe")||s.equals("R7Probe")))update("checking","正在检查接口与功能行为",4);
    }
    public static synchronized Progress read(String id,String status){
        return switch(status){
            case "queued"->new Progress("queued","等待检查运行器",0,5);
            case "awaiting_runner"->new Progress("waiting","等待检查运行器启用",0,5);
            case "running"->RECENT.getOrDefault(id,new Progress("preparing","正在读取检查阶段",0,5));
            case "cancelling"->new Progress("cancelling","正在取消并释放检查环境",RECENT.getOrDefault(id,new Progress("", "",0,5)).step(),5);
            case "passed"->new Progress("completed","检查完成 · 功能通过",5,5);
            case "cancelled"->new Progress("cancelled","检查已取消",RECENT.getOrDefault(id,new Progress("", "",0,5)).step(),5);
            default->new Progress("failed","检查已结束 · 请查看结果",RECENT.getOrDefault(id,new Progress("", "",0,5)).step(),5);
        };
    }
}

package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/local-projects")
public class LocalProjectController {
    private final LocalProjectStore store;
    private final boolean pickerEnabled;
    private final Path compiler=Path.of(System.getenv().getOrDefault("SystemRoot","C:/Windows"),"Microsoft.NET","Framework64","v4.0.30319","csc.exe");
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Map<String,Pick> picks=new ConcurrentHashMap<>();
    private static class Pick {String token;volatile String status="pending",message="";volatile LocalProjectStore.Grant grant;volatile Process process;long created=System.currentTimeMillis();}
    public record PickWrite(String unused) {}
    public record SaveWrite(String path,String expected,String content) {}
    public LocalProjectController(LocalProjectStore store,@Value("${cs.local-project.picker-enabled:true}") boolean enabled){this.store=store;pickerEnabled=enabled&&System.getProperty("os.name").startsWith("Windows")&&Files.isRegularFile(compiler);}
    private static void local(HttpServletRequest request){if(!Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(request.getRemoteAddr()))throw new ApiException(HttpStatus.FORBIDDEN,"LOCAL_ONLY","请在运行本机服务的电脑上连接工程。",Map.of());}
    private static String token(String authorization){return authorization!=null&&authorization.startsWith("Bearer ")?authorization.substring(7):null;}
    @GetMapping("/capabilities") public Map<String,Object> capabilities(HttpServletRequest request){local(request);return Map.of("available",pickerEnabled,"message",pickerEnabled?"可通过本机服务连接工程":"本机目录选择暂不可用，可使用浏览器授权连接。");}
    @PostMapping(value="/pick",consumes="application/json") public synchronized Map<String,String> pick(HttpServletRequest request){
        local(request);if(!pickerEnabled)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PICKER_UNAVAILABLE","本机目录选择不可用，请使用浏览器授权连接。",Map.of());
        picks.entrySet().removeIf(e->!e.getValue().status.equals("pending")&&System.currentTimeMillis()-e.getValue().created>300000);
        if(picks.values().stream().anyMatch(p->p.status.equals("pending")))throw new ApiException(HttpStatus.CONFLICT,"PICKER_BUSY","系统目录窗口已经打开，请先完成选择或取消。",Map.of());
        String id=UUID.randomUUID().toString();Pick pick=new Pick();pick.token=UUID.randomUUID().toString();picks.put(id,pick);worker.submit(()->choose(pick));return Map.of("id",id,"token",pick.token);
    }
    private Pick authorizePick(String id,String authorization){Pick pick=picks.get(id);if(pick==null||!Objects.equals(pick.token,token(authorization)))throw new ApiException(HttpStatus.FORBIDDEN,"PICKER_AUTH_REQUIRED","目录选择请求已失效，请重试。",Map.of());return pick;}
    @GetMapping("/picks/{id}") public Map<String,Object> result(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization){local(request);Pick pick=authorizePick(id,authorization);var result=new HashMap<String,Object>();result.put("status",pick.status);result.put("message",pick.message);if(pick.grant!=null)result.put("connection",pick.grant);return result;}
    @PostMapping(value="/picks/{id}/cancel",consumes="application/json") public Map<String,String> cancel(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization){local(request);Pick pick=authorizePick(id,authorization);synchronized(pick){if(pick.status.equals("pending")){pick.status="cancelled";if(pick.process!=null)stopProcess(pick.process);}}return Map.of("status",pick.status);}
    private void choose(Pick pick){
        // Constant script: the browser supplies neither shell text nor an arbitrary local path.

        try{
            Path executable=pickerExecutable();
            synchronized(pick){if(!pick.status.equals("pending"))return;pick.process=new ProcessBuilder(executable.toString()).redirectError(ProcessBuilder.Redirect.DISCARD).start();pick.process.getOutputStream().close();}
            if(!pick.process.waitFor(180,TimeUnit.SECONDS)){stopProcess(pick.process);throw new IllegalStateException("选择目录超时，请重新打开系统窗口。");}
            String path=new String(pick.process.getInputStream().readAllBytes(),StandardCharsets.UTF_8).strip();
            synchronized(pick){if(!pick.status.equals("pending"))return;if(pick.process.exitValue()!=0)throw new IllegalStateException("系统目录窗口未能完成，请重试或使用浏览器授权连接。");if(path.isEmpty()){pick.status="cancelled";return;}pick.grant=store.connect(Path.of(path));pick.status="connected";}
        }catch(Exception e){synchronized(pick){if(pick.status.equals("pending")){pick.message=e instanceof ApiException?e.getMessage():"系统目录选择失败，请重试或使用浏览器授权连接。";pick.status="error";}}}
    }
    private Path pickerExecutable() throws Exception {
        byte[] source;try(var resource=LocalProjectController.class.getResourceAsStream("/local-project/DirectoryPicker.cs")){source=Objects.requireNonNull(resource).readAllBytes();}
        Path tools=store.toolsDirectory();Files.createDirectories(tools);
        String hash=WorkspaceController.hash(source).substring(0,16);Path executable=tools.resolve("CodeSomethingDirectoryPicker-"+hash+".exe");
        if(!Files.isRegularFile(executable)){
            Path code=tools.resolve("DirectoryPicker-"+hash+".cs");Files.write(code,source);
            var build=new ProcessBuilder(compiler.toString(),"/nologo","/target:winexe","/reference:System.Windows.Forms.dll","/reference:System.Drawing.dll","/out:"+executable,code.toString()).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();build.getOutputStream().close();
            if(!build.waitFor(30,TimeUnit.SECONDS)){stopProcess(build);throw new java.io.IOException("本机目录工具准备超时");}
            if(build.exitValue()!=0)throw new java.io.IOException("本机目录工具未能准备完成");
        }
        return executable;
    }
    @GetMapping("/connections/{id}/tree") public List<LocalProjectStore.Entry> tree(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,@RequestParam(defaultValue="") String path){local(request);return store.tree(id,token(authorization),path);}
    @GetMapping("/connections/{id}/file") public Map<String,String> read(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,@RequestParam String path){local(request);return Map.of("content",store.read(id,token(authorization),path));}
    @PostMapping(value="/connections/{id}/file",consumes="application/json") public Map<String,String> write(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,@RequestBody SaveWrite write){local(request);store.write(id,token(authorization),write.path(),write.expected(),write.content());return Map.of("status","saved");}
    @GetMapping("/connections/{id}/snapshot") public Map<String,Object> snapshot(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,@RequestParam String course){local(request);return Map.of("files",store.snapshot(id,token(authorization),course));}
    @GetMapping("/connections/{id}/stamp") public Map<String,String> stamp(HttpServletRequest request,@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,@RequestParam String course){local(request);return Map.of("stamp",store.stamp(id,token(authorization),course));}
    private static void stopProcess(Process process){process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();}
    @PreDestroy public void close(){for(Pick p:picks.values())if(p.process!=null&&p.process.isAlive())stopProcess(p.process);worker.shutdownNow();}
}

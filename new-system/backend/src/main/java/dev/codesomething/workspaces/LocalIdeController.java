package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.file.*;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Fixed local executable, no client-supplied command, arguments or working directory. */
@RestController
@RequestMapping("/api/v1/local-ide")
public class LocalIdeController {
    private final String executable;
    private long lastOpened;
    public LocalIdeController(@Value("${cs.ide.executable:}") String executable){this.executable=executable;}
    @PostMapping(value="/open",consumes="application/json")
    public synchronized Map<String,String> open(HttpServletRequest request) {
        if(!java.util.Set.of("127.0.0.1","0:0:0:0:0:0:0:1","::1").contains(request.getRemoteAddr()))
            throw new ApiException(HttpStatus.FORBIDDEN,"LOCAL_ONLY","请在运行本机服务的电脑上打开IDE。",Map.of());
        if(executable.isBlank()||!Files.isRegularFile(Path.of(executable)))
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"IDE_NOT_CONFIGURED","本机IDEA启动路径尚未配置，请设置CS_IDEA_EXECUTABLE后重启本机服务。",Map.of());
        if(System.currentTimeMillis()-lastOpened<3000)return Map.of("message","已发送打开请求，请查看IDEA窗口。工程仍需按指引创建。");
        try {
            new ProcessBuilder(executable).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            lastOpened=System.currentTimeMillis();
            return Map.of("message","已发送打开请求，请在IDEA选择New Project创建，或Open继续原工程。");
        } catch(java.io.IOException e){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"IDE_LAUNCH_FAILED","IDEA未能启动，请检查本机配置或手动打开IDEA。",Map.of());}
    }
}

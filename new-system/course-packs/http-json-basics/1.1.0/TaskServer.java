import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class TaskServer {
    public static void main(String[] args) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        server.createContext("/api/tasks/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            int status;
            String body;
            if (path.equals("/api/tasks/1")) {
                status = 200;
                // TODO: completed 表达完成状态，应使用哪一种 JSON 类型？
                body = """
                    {"id":1,"title":"学习 HTTP","completed":"false"}
                    """;
            } else {
                // TODO: 查询不存在的任务时，应返回什么状态码？
                status = 200;
                body = """
                    {"message":"没有找到这条任务"}
                    """;
            }
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        System.out.println("Task server: http://localhost:8080/api/tasks/1");
    }
}

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Base64;

// This trusted probe runs in a separate Docker exec process. Learner stdout is never a report.
class Probe {
    public static void main(String[] args) throws Exception {
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
        for(int attempt=0;attempt<40;attempt++) {
            try {
                var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080"+args[0])).timeout(Duration.ofSeconds(2)).GET().build();
                var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
                byte[] body;
                try(var input=response.body()){body=input.readNBytes(16385);}
                if(body.length>16384) {System.err.println("Response exceeds 16KiB");System.exit(3);}
                System.out.println(response.statusCode());
                System.out.println(Base64.getEncoder().encodeToString(response.headers().firstValue("Content-Type").orElse("").getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                System.out.println(Base64.getEncoder().encodeToString(body));
                return;
            } catch(java.io.IOException e) {if(attempt==39)throw e;Thread.sleep(100);}
        }
    }
}

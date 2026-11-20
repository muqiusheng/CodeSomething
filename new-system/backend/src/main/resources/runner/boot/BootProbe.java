import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
class BootProbe {
    public static void main(String[] args) throws Exception {
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
        for(int attempt=0;attempt<60;attempt++)try {
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080"+args[1])).timeout(Duration.ofSeconds(2)).header("Content-Type","application/json")
                .method(args[0],args.length>2?HttpRequest.BodyPublishers.ofString(new String(Base64.getDecoder().decode(args[2]),StandardCharsets.UTF_8)):HttpRequest.BodyPublishers.noBody()).build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());byte[] body;
            try(var input=response.body()){body=input.readNBytes(16385);}
            if(body.length>16384)throw new IllegalStateException("Response exceeds 16KiB");
            System.out.println(response.statusCode());
            System.out.println(Base64.getEncoder().encodeToString(response.headers().firstValue("Content-Type").orElse("").getBytes(StandardCharsets.UTF_8)));
            System.out.println(Base64.getEncoder().encodeToString(body));return;
        } catch(java.io.IOException e){if(attempt==59)throw e;Thread.sleep(100);}
    }
}

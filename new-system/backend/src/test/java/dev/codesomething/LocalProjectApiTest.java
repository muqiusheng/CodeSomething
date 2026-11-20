package dev.codesomething;
import dev.codesomething.workspaces.LocalProjectStore;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import static org.junit.jupiter.api.Assertions.*;

class LocalProjectApiTest {
 @TempDir Path temp;
 @Test void onlyTheSelectedRootIsAccessibleAndExternalOriginsCannotReadIt()throws Exception {
  Path root=Files.createDirectory(temp.resolve("learning"));Files.writeString(root.resolve("TaskServer.java"),"source");
  try(var app=new SpringApplicationBuilder(CodeSomethingApplication.class).run("--server.port=0","--cs.runner.enabled=false","--cs.local-project.picker-enabled=false","--cs.data-directory="+temp.resolve("data"))){
   var grant=app.getBean(LocalProjectStore.class).connect(root);String base="http://127.0.0.1:"+app.getEnvironment().getProperty("local.server.port")+"/api/v1/local-projects";
   var client=HttpClient.newHttpClient();
   java.util.function.BiFunction<String,String,HttpResponse<String>> get=(route,token)->{try{return client.send(HttpRequest.newBuilder(URI.create(base+route)).header("Authorization","Bearer "+token).GET().build(),HttpResponse.BodyHandlers.ofString());}catch(Exception e){throw new RuntimeException(e);}};
   String file="/connections/"+grant.id()+"/file?path=TaskServer.java";
   assertEquals(403,get.apply(file,"wrong").statusCode());assertTrue(get.apply(file,grant.token()).body().contains("source"));
   assertEquals(400,get.apply("/connections/"+grant.id()+"/file?path=../outside.txt",grant.token()).statusCode());
   var external=HttpRequest.newBuilder(URI.create(base+file)).header("Origin","https://untrusted.example").header("Authorization","Bearer "+grant.token()).GET().build();assertEquals(403,client.send(external,HttpResponse.BodyHandlers.ofString()).statusCode());
   assertTrue(get.apply("/connections/"+grant.id()+"/snapshot?course=http-json-basics",grant.token()).body().contains("TaskServer.java"));
   var response=client.send(HttpRequest.newBuilder(URI.create(base+"/pick")).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString());assertEquals(503,response.statusCode());assertTrue(response.body().contains("PICKER_UNAVAILABLE"));
  }
 }
}

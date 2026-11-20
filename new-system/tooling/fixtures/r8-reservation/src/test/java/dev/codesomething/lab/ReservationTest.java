package dev.codesomething.lab;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import java.net.*;
import java.net.http.*;
import static org.junit.jupiter.api.Assertions.*;
class ReservationTest {
 @Test void invalidQuantityHasNoSuccessfulReservation()throws Exception {
  try(var app=SpringApplication.run(Application.class,"--server.port=18080","--server.address=127.0.0.1")){
   var client=HttpClient.newHttpClient();
   var login=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:18080/api/auth/login")).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"alice\",\"password\":\"Learn-2026!\"}")).build(),HttpResponse.BodyHandlers.ofString());
   assertEquals(200,login.statusCode());String token=login.body().split("\"token\":\"")[1].split("\"")[0];
   var result=client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:18080/api/reservations")).header("Content-Type","application/json").header("Authorization","Bearer "+token).POST(HttpRequest.BodyPublishers.ofString("{\"resourceId\":1,\"quantity\":0}")).build(),HttpResponse.BodyHandlers.ofString());
   assertEquals(400,result.statusCode());assertTrue(result.body().contains("message"));
  }
 }
}

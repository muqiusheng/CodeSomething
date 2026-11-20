package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
@RestController
public class EchoController {
    public record Input(String title,Object completed) {}
    public record Echo(String title,boolean completed) {}
    @GetMapping("/api/echo/{id}") public Object get(@PathVariable int id,@RequestParam String name) {return java.util.Map.of("id",id,"name",name);}
    @PostMapping("/api/echo") public ResponseEntity<?> post(@RequestBody Input input) {
        if(input.title()==null||!(input.completed() instanceof Boolean))return ResponseEntity.badRequest().body(java.util.Map.of("message","title与布尔completed必填"));
        return ResponseEntity.status(201).body(new Echo(input.title(),(Boolean)input.completed()));
    }
}

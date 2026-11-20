package dev.codesomething.lab;

import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class BusinessController {
    private final AuthService auth;private final PlanService plans;
    public BusinessController(AuthService auth,PlanService plans){this.auth=auth;this.plans=plans;}
    @GetMapping("/api/health") public Object health(){return Map.of("status","ok");}
    @PostMapping("/api/auth/login") public Object login(@RequestBody Map<String,Object> input){
        if(!(input.get("username") instanceof String u)||!(input.get("password") instanceof String p))throw new Problem(400,"INVALID_INPUT","请填写账号和密码");
        return auth.login(u,p);
    }
    @GetMapping("/api/auth/me") public Object me(@RequestHeader(value="Authorization",required=false) String token){return auth.user(token);}
    @DeleteMapping("/api/auth/session") public ResponseEntity<?> logout(@RequestHeader(value="Authorization",required=false) String token){auth.logout(token);return ResponseEntity.noContent().build();}
    @GetMapping("/api/plans") public Object list(@RequestHeader(value="Authorization",required=false) String token){return plans.list(auth.user(token));}
    @GetMapping("/api/plans/{id}") public Object read(@RequestHeader(value="Authorization",required=false) String token,@PathVariable long id){return plans.read(auth.user(token),id);}
    @PostMapping("/api/plans") public ResponseEntity<?> create(@RequestHeader(value="Authorization",required=false) String token,@RequestBody Map<String,Object> input){return ResponseEntity.status(201).body(plans.create(auth.user(token),input.get("title")));}
    @GetMapping("/api/plans/{plan}/tasks") public Object tasks(@RequestHeader(value="Authorization",required=false) String token,@PathVariable long plan,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size,@RequestParam(defaultValue="all") String status){return plans.tasks(auth.user(token),plan,page,size,status);}
    @PostMapping("/api/plans/{plan}/tasks/batch") public ResponseEntity<?> batch(@RequestHeader(value="Authorization",required=false) String token,@PathVariable long plan,@RequestBody List<Map<String,Object>> input){return ResponseEntity.status(201).body(plans.batch(auth.user(token),plan,input));}
    @PutMapping("/api/plans/{plan}/tasks/{task}/complete") public Object complete(@RequestHeader(value="Authorization",required=false) String token,@PathVariable long plan,@PathVariable long task){return plans.complete(auth.user(token),plan,task);}
    @GetMapping("/api/admin/audit") public Object audit(@RequestHeader(value="Authorization",required=false) String token){return plans.audit(auth.user(token));}
}

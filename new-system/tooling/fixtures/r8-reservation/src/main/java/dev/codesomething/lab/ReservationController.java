package dev.codesomething.lab;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
@RestController
public class ReservationController {
 final AuthService auth;final ReservationService service;final JdbcTemplate db;
 public ReservationController(AuthService a,ReservationService s,JdbcTemplate db){auth=a;service=s;this.db=db;}
 @GetMapping("/api/health") public Map<String,String> health(){return Map.of("status","ok");}
 @PostMapping("/api/auth/login") public Object login(@RequestBody Map<String,String> w){return auth.login(w.getOrDefault("username",""),w.getOrDefault("password",""));}
 @GetMapping("/api/resources") public Object resources(@RequestHeader(value="Authorization",required=false) String a){auth.user(a);return db.queryForList("SELECT id,title,available FROM resources ORDER BY id");}
 @PostMapping("/api/reservations") public ResponseEntity<?> reserve(@RequestHeader(value="Authorization",required=false) String a,@RequestBody Map<String,Object> w){return ResponseEntity.status(201).body(service.reserve(auth.user(a).id(),w));}
 @PostMapping("/api/reservations/batch") public ResponseEntity<?> batch(@RequestHeader(value="Authorization",required=false) String a,@RequestBody List<Map<String,Object>> w){return ResponseEntity.status(201).body(service.batch(auth.user(a).id(),w));}
 @GetMapping("/api/reservations") public Object list(@RequestHeader(value="Authorization",required=false) String a,@RequestParam(required=false) Long resourceId){return service.list(auth.user(a).id(),resourceId);}
 @DeleteMapping("/api/reservations/{id}") public ResponseEntity<?> cancel(@RequestHeader(value="Authorization",required=false) String a,@PathVariable long id){service.cancel(auth.user(a).id(),id);return ResponseEntity.noContent().build();}
}

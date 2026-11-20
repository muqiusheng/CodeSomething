package dev.codesomething.lab;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController
@RequestMapping("/api/{resource:tasks|bookmarks}")
public class TaskController {
    private final TaskService service;
    public TaskController(TaskService service) {this.service=service;}
    @GetMapping public Object list(@PathVariable String resource,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size,@RequestParam(required=false) Boolean completed) {return service.all(resource);}
    @GetMapping("/{id}") public TaskRepository.Task get(@PathVariable String resource,@PathVariable long id) {return service.get(resource,id);}
    @PostMapping public ResponseEntity<TaskRepository.Task> create(@PathVariable String resource,@RequestBody TaskService.Input input) {return ResponseEntity.status(200).body(service.create(resource,input));}
    @PutMapping("/{id}") public TaskRepository.Task update(@PathVariable String resource,@PathVariable long id,@RequestBody TaskService.Input input) {return service.update(resource,id,input);}
    @DeleteMapping("/{id}") public ResponseEntity<Void> delete(@PathVariable String resource,@PathVariable long id) {service.delete(resource,id);return ResponseEntity.noContent().build();}
}

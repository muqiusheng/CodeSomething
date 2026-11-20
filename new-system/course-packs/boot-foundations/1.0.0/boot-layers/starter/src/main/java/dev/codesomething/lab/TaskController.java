package dev.codesomething.lab;
@org.springframework.web.bind.annotation.RestController
public class TaskController {private final TaskService service;public TaskController(TaskService service){this.service=service;}@org.springframework.web.bind.annotation.GetMapping("/api/layers") public Object get(){return java.util.Map.of("title",service.title());}}

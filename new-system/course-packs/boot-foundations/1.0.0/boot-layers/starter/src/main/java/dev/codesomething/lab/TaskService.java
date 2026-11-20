package dev.codesomething.lab;
@org.springframework.stereotype.Service
public class TaskService {private final TaskRepository repository;public TaskService(TaskRepository repository){this.repository=repository;}public String title(){return "待连接Repository";}}

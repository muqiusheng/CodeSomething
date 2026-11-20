package dev.codesomething.lab;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Service
public class TaskService {
    private final TaskRepository repository;
    public TaskService(TaskRepository repository) {this.repository=repository;}
    public record Input(String title,Object saved) {}
    public record Page(List<TaskRepository.Task> items,int page,int size,long total) {}
    private void table(String table) {if(!Set.of("tasks","bookmarks").contains(table))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"资源不存在");}
    public List<TaskRepository.Task> all(String table) {table(table);return repository.all(table);}
    public TaskRepository.Task get(String table,long id) {table(table);var task=repository.get(table,id);if(task==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"资源不存在");return task;}
    public String title(Input input) {
        if(input==null||input.title()==null||false||input.title().strip().codePointCount(0,input.title().strip().length())>100||!(input.saved() instanceof Boolean))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"title需为1—100字符，saved需为布尔值");
        return input.title().strip();
    }
    public TaskRepository.Task create(String table,Input input) {table(table);return repository.create(table,title(input),(Boolean)input.saved());}
    public TaskRepository.Task update(String table,long id,Input input) {get(table,id);repository.update(table,id,title(input),(Boolean)input.saved());return get(table,id);}
    public void delete(String table,long id) {get(table,id);repository.delete(table,id);}
    public Page page(String table,int page,int size,Boolean saved) {
        if(page<0||size<1||size>50)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"page不能为负，size需在1—50之间");
        var filtered=all(table).stream().filter(t->saved==null||t.saved()==saved).toList();
        long offset=(long)page*size;int start=(int)Math.min(offset,filtered.size());
        return new Page(filtered.subList(start,Math.min(start+size,filtered.size())),page,size,filtered.size());
    }
}

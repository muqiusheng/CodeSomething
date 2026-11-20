package dev.codesomething.lab;
import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import java.sql.Statement;
import java.util.*;
@Repository
public class TaskRepository {
    private final JdbcTemplate jdbc;
    public TaskRepository(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public record Task(long id,String title,boolean saved) {}
    public List<Task> all(String table) {return jdbc.query("SELECT id,title,saved FROM "+table+" ORDER BY id",(r,n)->new Task(r.getLong(1),r.getString(2),r.getBoolean(3)));}
    public Task get(String table,long id) {var rows=jdbc.query("SELECT id,title,saved FROM "+table+" WHERE id=?",(r,n)->new Task(r.getLong(1),r.getString(2),r.getBoolean(3)),id);return rows.isEmpty()?null:rows.getFirst();}
    public Task create(String table,String title,boolean saved) {
        var key=new GeneratedKeyHolder();
        jdbc.update(c->{var s=c.prepareStatement("INSERT INTO "+table+"(title,saved) VALUES(?,?)",Statement.RETURN_GENERATED_KEYS);s.setString(1,title);s.setBoolean(2,saved);return s;},key);
        return get(table,Objects.requireNonNull(key.getKey()).longValue());
    }
    public int update(String table,long id,String title,boolean saved) {return jdbc.update("UPDATE "+table+" SET title=?,saved=? WHERE id=?",title,saved,id);}
    public int delete(String table,long id) {return jdbc.update("DELETE FROM "+table+" WHERE id=?",id);}
}

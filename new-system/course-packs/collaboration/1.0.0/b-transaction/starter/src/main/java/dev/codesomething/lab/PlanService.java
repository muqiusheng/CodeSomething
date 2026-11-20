package dev.codesomething.lab;

import java.sql.Statement;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlanService {
    private final JdbcTemplate db;private final AuthService auth;
    public PlanService(JdbcTemplate db,AuthService auth){this.db=db;this.auth=auth;}
    public static String title(Object value) {
        if(!(value instanceof String text)||text.strip().isEmpty()||text.strip().length()>100)throw new Problem(400,"INVALID_TITLE","标题须为1至100个字符");
        return ((String)value).strip();
    }
    private long insert(String sql,Object... values){var key=new GeneratedKeyHolder();db.update(c->{var s=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<values.length;i++)s.setObject(i+1,values[i]);return s;},key);return Objects.requireNonNull(key.getKey()).longValue();}
    public Map<String,Object> read(AuthService.User user,long plan){auth.requireMember(user,plan);return db.queryForMap("SELECT id,title,owner_id AS ownerId FROM plans WHERE id=?",plan);}
    public List<Map<String,Object>> list(AuthService.User user){return db.queryForList("SELECT p.id,p.title,p.owner_id AS ownerId FROM plans p JOIN memberships m ON m.plan_id=p.id WHERE m.user_id=? ORDER BY p.id",user.id());}
    @Transactional
    public Map<String,Object> create(AuthService.User user,Object input){
        long id=insert("INSERT INTO plans(title,owner_id) VALUES(?,?)",title(input),user.id());
        db.update("INSERT INTO memberships(plan_id,user_id) VALUES(?,?)",id,user.id());
        db.update("INSERT INTO audit_events(actor_id,action,plan_id) VALUES(?,'CREATE_PLAN',?)",user.id(),id);
        return read(user,id);
    }
    public Map<String,Object> tasks(AuthService.User user,long plan,int page,int size,String status) {
        auth.requireMember(user,plan);
        if(page<0||page>100000||size<1||size>50||!Set.of("all","todo","done").contains(status))throw new Problem(400,"INVALID_PAGE","page须为0至100000，size须为1至50，status为all/todo/done");
        String where=" WHERE plan_id=?"+(status.equals("all")?"":" AND status=?");
        var args=new ArrayList<Object>(List.of(plan));if(!status.equals("all"))args.add(status);
        long total=db.queryForObject("SELECT COUNT(*) FROM plan_tasks"+where,Long.class,args.toArray());
        args.add(size);args.add((long)page*size);
        var items=db.queryForList("SELECT id,title,status,assignee_id AS assigneeId FROM plan_tasks"+where+" ORDER BY id LIMIT ? OFFSET ?",args.toArray());
        return Map.of("items",items,"total",total,"page",page,"size",size);
    }
    @Transactional
    public Map<String,Object> batch(AuthService.User user,long plan,List<Map<String,Object>> inputs){
        // TODO: implement this stage from the API contract
        throw new Problem(501,"NOT_IMPLEMENTED","请完成本关");
    }
    @Transactional
    public Map<String,Object> complete(AuthService.User user,long plan,long task){
        auth.requireMember(user,plan);
        var items=db.queryForList("SELECT assignee_id FROM plan_tasks WHERE id=? AND plan_id=?",task,plan);
        if(items.isEmpty())throw new Problem(404,"TASK_NOT_FOUND","任务不存在");
        long assignee=((Number)items.getFirst().get("assignee_id")).longValue();
        if(assignee!=user.id())auth.owner(user,plan);
        db.update("UPDATE plan_tasks SET status='done' WHERE id=? AND plan_id=?",task,plan);
        db.update("INSERT INTO audit_events(actor_id,action,plan_id) VALUES(?,'COMPLETE_TASK',?)",user.id(),plan);
        return Map.of("id",task,"status","done");
    }
    public List<Map<String,Object>> audit(AuthService.User user){auth.admin(user);return db.queryForList("SELECT id,actor_id AS actorId,action,plan_id AS planId FROM audit_events ORDER BY id DESC LIMIT 100");}
}

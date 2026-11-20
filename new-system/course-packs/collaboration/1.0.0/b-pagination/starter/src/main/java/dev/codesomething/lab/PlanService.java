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
        // TODO: implement this stage from the API contract
        throw new Problem(501,"NOT_IMPLEMENTED","请完成本关");
    }
    @Transactional
    public Map<String,Object> batch(AuthService.User user,long plan,List<Map<String,Object>> inputs){
        auth.owner(user,plan);
        if(inputs==null||inputs.isEmpty()||inputs.size()>20)throw new Problem(400,"INVALID_BATCH","每批须为1至20条任务");
        var ids=new ArrayList<Long>();
        // Validate each item in the transaction: later failures must roll back earlier inserts and audit.
        for(var item:inputs){
            String text=title(item.get("title"));Object raw=item.get("assigneeId");
            if(!(raw instanceof Number number)||number.doubleValue()!=number.longValue())throw new Problem(400,"INVALID_ASSIGNEE","请选择有效成员编号");
            long assignee=((Number)raw).longValue();
            if(db.queryForObject("SELECT COUNT(*) FROM memberships WHERE plan_id=? AND user_id=?",Integer.class,plan,assignee)==0)throw new Problem(400,"INVALID_ASSIGNEE","被分配者不是计划成员");
            ids.add(insert("INSERT INTO plan_tasks(plan_id,title,status,assignee_id) VALUES(?,?,'todo',?)",plan,text,assignee));
            db.update("INSERT INTO audit_events(actor_id,action,plan_id) VALUES(?,'CREATE_TASK',?)",user.id(),plan);
        }
        return Map.of("ids",ids,"created",ids.size());
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

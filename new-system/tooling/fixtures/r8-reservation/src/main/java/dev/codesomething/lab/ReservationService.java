package dev.codesomething.lab;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
@Service
public class ReservationService {
 final JdbcTemplate db;
 public ReservationService(JdbcTemplate db){this.db=db;}
 static long number(Object value){if(!(value instanceof Integer||value instanceof Long)||((Number)value).longValue()<1)throw new Problem(400,"INVALID","必须为正整数");return ((Number)value).longValue();}
 @Transactional public Map<String,Object> reserve(long user,Map<String,Object> input){
  long resource=number(input.get("resourceId")),quantity=number(input.get("quantity"));
  if(quantity>Integer.MAX_VALUE)throw new Problem(400,"INVALID","数量过大");
  if(db.queryForObject("SELECT count(*) FROM resources WHERE id=?",Integer.class,resource)==0)throw new Problem(404,"NOT_FOUND","资源不存在");
  if(db.update("UPDATE resources SET available=available-? WHERE id=? AND available>=?",quantity,resource,quantity)!=1)throw new Problem(409,"CAPACITY","库存不足");
  db.update("INSERT INTO reservations(user_id,resource_id,quantity,status) VALUES(?,?,?,'active')",user,resource,quantity);
  long id=db.queryForObject("SELECT LAST_INSERT_ID()",Long.class);
  return Map.of("id",id,"resourceId",resource,"quantity",quantity,"status","active");
 }
 @Transactional public List<Map<String,Object>> batch(long user,List<Map<String,Object>> inputs){
  if(inputs.size()<2||inputs.size()>5)throw new Problem(400,"INVALID","批量须2—5项");
  var result=new ArrayList<Map<String,Object>>();for(var input:inputs)result.add(reserve(user,input));return result;
 }
 @Transactional public void cancel(long user,long id){
  var rows=db.queryForList("SELECT * FROM reservations WHERE id=? FOR UPDATE",id);if(rows.isEmpty())throw new Problem(404,"NOT_FOUND","预约不存在");var r=rows.getFirst();
  if(((Number)r.get("user_id")).longValue()!=user)throw new Problem(403,"FORBIDDEN","无权取消");
  if(r.get("status").equals("active")){db.update("UPDATE reservations SET status='cancelled' WHERE id=?",id);db.update("UPDATE resources SET available=available+? WHERE id=?",r.get("quantity"),r.get("resource_id"));}
 }
 public List<Map<String,Object>> list(long user,Long resource){String sql="SELECT id,resource_id AS resourceId,quantity,status FROM reservations WHERE user_id=?";return resource==null?db.queryForList(sql+" ORDER BY id",user):db.queryForList(sql+" AND resource_id=? ORDER BY id",user,resource);}
}

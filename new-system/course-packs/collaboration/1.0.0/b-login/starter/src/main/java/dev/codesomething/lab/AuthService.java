package dev.codesomething.lab;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final JdbcTemplate db;
    public AuthService(JdbcTemplate db){this.db=db;}
    public record User(long id,String username,String role) {}
    public static String hash(String value) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    public static String password(String value,String salt) {
        var key=new PBEKeySpec(value.toCharArray(),HexFormat.of().parseHex(salt),600000,256);
        try{return HexFormat.of().formatHex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(key).getEncoded());}
        catch(Exception e){throw new IllegalStateException(e);}finally{key.clearPassword();}
    }
    public Map<String,Object> login(String username,String password) {
        // TODO: implement this stage from the API contract
        throw new Problem(501,"NOT_IMPLEMENTED","请完成本关");
    }
    public User user(String authorization) {
        if(authorization==null||!authorization.matches("Bearer [a-f0-9]{64}"))throw new Problem(401,"LOGIN_REQUIRED","请先登录");
        var rows=db.query("SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",(r,n)->new User(r.getLong(1),r.getString(2),r.getString(3)),hash(authorization.substring(7)),Instant.now().getEpochSecond());
        if(rows.isEmpty())throw new Problem(401,"SESSION_EXPIRED","登录已失效，请重新登录");
        return rows.getFirst();
    }
    public void logout(String authorization){user(authorization);db.update("DELETE FROM sessions WHERE token_hash=?",hash(authorization.substring(7)));}
    public boolean member(User u,long plan) {return db.queryForObject("SELECT COUNT(*) FROM memberships WHERE plan_id=? AND user_id=?",Integer.class,plan,u.id())>0;}
    public void requireMember(User u,long plan) {
        if (!member(u,plan)) throw new Problem(403,"PLAN_FORBIDDEN","你不是这个计划的成员");
    }
    public void owner(User u,long plan) {
        requireMember(u,plan);
        if(db.queryForObject("SELECT COUNT(*) FROM plans WHERE id=? AND owner_id=?",Integer.class,plan,u.id())==0)throw new Problem(403,"OWNER_REQUIRED","只有计划负责人可执行此操作");
    }
    public void admin(User u){if(!u.role().equals("ADMIN"))throw new Problem(403,"ADMIN_REQUIRED","仅管理员可查看审计记录");}
}

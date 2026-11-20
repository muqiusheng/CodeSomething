package dev.codesomething.lab;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.jdbc.core.JdbcTemplate;
@Component
public class Schema implements InitializingBean {
 private final JdbcTemplate db;
 public Schema(JdbcTemplate db){this.db=db;}
 public void afterPropertiesSet(){
  db.execute("CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY,username VARCHAR(80) UNIQUE NOT NULL,role VARCHAR(10) NOT NULL,salt VARCHAR(32) NOT NULL,password_hash VARCHAR(64) NOT NULL)");
  db.execute("CREATE TABLE IF NOT EXISTS sessions(token_hash VARCHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL,expires_at BIGINT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id))");
  if(db.queryForObject("SELECT count(*) FROM users",Integer.class)==0)for(int i=1;i<=2;i++){String salt="00112233445566778899aabbccddeeff";db.update("INSERT IGNORE INTO users VALUES(?,?,?,?,?)",i,i==1?"alice":"bob","USER",salt,AuthService.password("Learn-2026!",salt));}
  db.execute("CREATE TABLE IF NOT EXISTS resources(id BIGINT PRIMARY KEY,title VARCHAR(100) NOT NULL,available INT NOT NULL)");
  db.update("INSERT IGNORE INTO resources VALUES(1,'相机',3),(2,'镜头',2)");
  db.execute("CREATE TABLE IF NOT EXISTS reservations(id BIGINT PRIMARY KEY AUTO_INCREMENT,user_id BIGINT NOT NULL,resource_id BIGINT NOT NULL,quantity INT NOT NULL,status VARCHAR(10) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(resource_id) REFERENCES resources(id))");
 }
}

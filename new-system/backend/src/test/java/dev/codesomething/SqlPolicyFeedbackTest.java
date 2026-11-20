package dev.codesomething;
import dev.codesomething.sql.SqlPolicy;
import dev.codesomething.api.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SqlPolicyFeedbackTest {
 @Test void keywordTypoReportsOriginalLineAndColumnWithoutChangingSql(){
  var error=assertThrows(ApiException.class,()->SqlPolicy.validate("sql-read","SELECT 'a long title';\nSELEC id FROM tasks;"));
  assertTrue(error.getMessage().contains("SELECT"),error.getMessage());
  assertTrue(error.getMessage().contains("第2行第1列"),error.getMessage());
  assertDoesNotThrow(()->SqlPolicy.validate("sql-read","SELECT id,title FROM tasks;"));
  assertThrows(ApiException.class,()->SqlPolicy.validate("sql-read","SELECT * FROM mysql.user;"));
 }
}

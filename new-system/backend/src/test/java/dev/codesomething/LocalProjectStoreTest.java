package dev.codesomething;
import dev.codesomething.workspaces.LocalProjectStore;
import dev.codesomething.api.ApiException;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class LocalProjectStoreTest {
 @TempDir Path temp;
 @Test void externalIdeChangeIsNeverOverwrittenByAnOldWebBuffer() throws Exception {
  Path root=Files.createDirectory(temp.resolve("project"));Files.writeString(root.resolve("TaskServer.java"),"original");
  var store=new LocalProjectStore(temp.resolve("data").toString());var grant=store.connect(root);
  assertEquals("original",store.read(grant.id(),grant.token(),"TaskServer.java"));
  Files.writeString(root.resolve("TaskServer.java"),"IDE update");
  assertThrows(ApiException.class,()->store.write(grant.id(),grant.token(),"TaskServer.java","original","web update"));
  assertEquals("IDE update",Files.readString(root.resolve("TaskServer.java")));
 }

 @Test void connectionSurvivesRestartAndRejectsWrongCredentialsAndEscapingPaths() throws Exception {
  Path root=Files.createDirectory(temp.resolve("project"));Files.writeString(root.resolve("TaskServer.java"),"source");
  var first=new LocalProjectStore(temp.resolve("data").toString());var grant=first.connect(root);
  var restored=new LocalProjectStore(temp.resolve("data").toString());
  assertEquals(java.util.Map.of("TaskServer.java","source"),restored.snapshot(grant.id(),grant.token(),"http-json-basics"));
  assertThrows(ApiException.class,()->restored.read(grant.id(),"wrong","TaskServer.java"));
  assertThrows(ApiException.class,()->restored.read(grant.id(),grant.token(),"../outside.txt"));
  restored.write(grant.id(),grant.token(),"TaskServer.java","source","new content");
  assertEquals("new content",Files.readString(root.resolve("TaskServer.java")));
  Files.move(root,temp.resolve("moved"));
  var error=assertThrows(ApiException.class,()->restored.tree(grant.id(),grant.token(),""));assertEquals("PROJECT_ROOT_MISSING",error.code);
 }
 @Test void sameLengthExternalChangesInvalidateTheLightweightStamp() throws Exception {
  Path root=Files.createDirectory(temp.resolve("project"));Path source=root.resolve("TaskServer.java");Files.writeString(source,"one");
  var store=new LocalProjectStore(temp.resolve("data").toString());var grant=store.connect(root);String before=store.stamp(grant.id(),grant.token(),"http-json-basics");
  Files.writeString(source,"two");Files.setLastModifiedTime(source,java.nio.file.attribute.FileTime.fromMillis(System.currentTimeMillis()+2000));
  assertNotEquals(before,store.stamp(grant.id(),grant.token(),"http-json-basics"));
  assertEquals("two",store.snapshot(grant.id(),grant.token(),"http-json-basics").get("TaskServer.java"));
 }

 @Test void corruptConnectionMemoryDoesNotPreventTheLearningServiceFromStarting()throws Exception {
  Path data=Files.createDirectories(temp.resolve("data"));Files.writeString(data.resolve("local-projects.json"),"incomplete json");
  assertDoesNotThrow(()->new LocalProjectStore(data.toString()));
  assertEquals("incomplete json",Files.readString(data.resolve("local-projects.json")));
 }
}

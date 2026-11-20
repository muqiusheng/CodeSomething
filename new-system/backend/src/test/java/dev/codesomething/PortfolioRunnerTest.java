package dev.codesomething;
import dev.codesomething.boot.*;
import dev.codesomething.portfolio.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="CS_RUN_DOCKER_TESTS",matches="true")
class PortfolioRunnerTest {
 @TempDir Path data;
 final String docker="C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe";
 static void evidence(String name,Object value)throws Exception{String dir=System.getenv("CS_R8_EVIDENCE_DIRECTORY");if(dir!=null){Files.createDirectories(Path.of(dir));Files.writeString(Path.of(dir).resolve(name+".json"),tools.jackson.databind.json.JsonMapper.builder().build().writerWithDefaultPrettyPrinter().writeValueAsString(value));}}
 @Test void newDomainChecksAcceptWorkingProjectAndRejectOverbooking()throws Exception{
  Path fixture=Path.of("../tooling/fixtures/r8-reservation").toAbsolutePath().normalize();
  var runner=new PortfolioRunner(docker,data.resolve("jobs"),240);
  for(String phase:"true".equals(System.getenv("CS_R8_MUTATION_ONLY"))?List.<String>of():List.of("core","transfer")){
   var good=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(fixture,true),"1.0.0",phase,()->false);evidence(phase+"-reference",good);assertEquals("passed",good.status(),good.toString());
  }
  Path mutant=data.resolve("mutant");try(var paths=Files.walk(fixture)){for(var path:paths.filter(Files::isRegularFile).toList()){Path target=mutant.resolve(fixture.relativize(path));Files.createDirectories(target.getParent());Files.copy(path,target);}}
  Path file=mutant.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/ReservationService.java");String source=Files.readString(file);assertTrue(source.contains("available>=?"));Files.writeString(file,source.replace("available>=?","available>=0 AND ? > 0"));
  var bad=runner.run(UUID.randomUUID().toString(),BootProjectSnapshot.capture(mutant,true),"1.0.0","core",()->false);evidence("overbook-mutant",bad);assertEquals("business_error",bad.status(),bad.toString());
 }
}

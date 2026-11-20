package dev.codesomething;
import dev.codesomething.boot.BootProjectSnapshot;
import dev.codesomething.portfolio.PortfolioRunner;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
class PortfolioIsolationTest {
 @TempDir Path data;
 @Test void cancellationAndUnavailableRuntimeNeverProduceBusinessFailureOrLeaveInput()throws Exception{
  var snapshot=BootProjectSnapshot.capture(Path.of("../tooling/fixtures/r8-reservation").toAbsolutePath().normalize(),true);
  var runner=new PortfolioRunner(data.resolve("missing-docker.exe").toString(),data.resolve("jobs"),10);
  var cancelled=runner.run(UUID.randomUUID().toString(),snapshot,"1.0.0","core",()->true);assertEquals("cancelled",cancelled.status());assertFalse(cancelled.report().functionalPassed());
  var failed=runner.run(UUID.randomUUID().toString(),snapshot,"1.0.0","core",()->false);assertEquals("environment_error",failed.status());assertFalse(failed.report().functionalPassed());
  try(var paths=Files.list(data.resolve("jobs"))){assertEquals(0,paths.count());}
  assertThrows(IllegalArgumentException.class,()->runner.run("../escape",snapshot,"1.0.0","core",()->false));
 }
}

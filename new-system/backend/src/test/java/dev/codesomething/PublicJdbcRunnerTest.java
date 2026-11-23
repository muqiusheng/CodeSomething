package dev.codesomething;

import dev.codesomething.boot.*;
import dev.codesomething.portfolio.PortfolioRunner;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.assertEquals;

@EnabledIfEnvironmentVariable(named="CS_RUN_PUBLIC_DOCKER_TESTS",matches="true")
class PublicJdbcRunnerTest {
    @TempDir Path data;
    private final String docker = System.getenv().getOrDefault("CS_DOCKER_BIN", "docker");

    @Test void jdbcCourseRunsInPublicMode() throws Exception {
        var snapshot = reference("boot-foundations","boot-jdbc");
        var result = new BootProjectRunner(docker,data.resolve("jobs"),180,true)
            .run(UUID.randomUUID().toString(),snapshot,"1.0.0","boot-jdbc",()->false);
        assertEquals("passed",result.status(),result.toString());
    }

    static BootProjectSnapshot reference(String course,String stage) throws Exception {
        return BootProjectSnapshot.capture(Path.of("../course-packs",course,"1.0.0",stage,"reference").toAbsolutePath().normalize(),true);
    }

    @Test void taskManagerAndCollaborationUseTheirExistingAssertions() throws Exception {
        var task=new BootProjectRunner(docker,data.resolve("jobs"),180,true)
            .run(UUID.randomUUID().toString(),reference("task-manager","a-read"),"1.0.0","a-read",()->false);
        assertEquals("passed",task.status(),task.toString());
        var collaboration=new CollaborationRunner(docker,data.resolve("jobs"),180,true)
            .run(UUID.randomUUID().toString(),reference("collaboration","b-login"),"1.0.0","b-login",()->false);
        assertEquals("passed",collaboration.status(),collaboration.toString());
    }

    @Test void portfolioCoreAndTransferRunInPublicMode() throws Exception {
        var snapshot=BootProjectSnapshot.capture(Path.of("../tooling/fixtures/r8-reservation").toAbsolutePath().normalize(),true);
        var runner=new PortfolioRunner(docker,data.resolve("jobs"),240,true);
        for(String phase:java.util.List.of("core","transfer")) {
            var result=runner.run(UUID.randomUUID().toString(),snapshot,"1.0.0",phase,()->false);
            assertEquals("passed",result.status(),result.toString());
        }
    }
}

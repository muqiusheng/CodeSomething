package dev.codesomething;

import dev.codesomething.workspaces.CheckProgress;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CheckProgressTest {
    @Test void compiledProbesStillReportStartupAndFunctionalChecking() {
        CheckProgress.begin("compiled-probes");
        try {
            CheckProgress.command(List.of("exec","app","java","-cp","/opt/codesomething-probes","WaitForHttp"));
            assertEquals("starting",CheckProgress.read("compiled-probes","running").phase());
            CheckProgress.command(List.of("exec","app","java","-cp","/opt/codesomething-probes","BootProbe","GET","/api/health"));
            assertEquals("checking",CheckProgress.read("compiled-probes","running").phase());
        } finally {CheckProgress.end();}
    }
    @Test void progressFollowsRealCommandsWithoutGoingBackwardsOrLeakingBetweenJobs() {
        String first="progress-first",second="progress-second";
        CheckProgress.begin(first);
        try {
            assertEquals(1,CheckProgress.read(first,"running").step());
            CheckProgress.command(List.of("exec","app","sh","/opt/maven/bin/mvn","package"));
            assertEquals("compiling",CheckProgress.read(first,"running").phase());
            CheckProgress.command(List.of("exec","app","java","/input/WaitForHttp.java"));
            assertEquals(3,CheckProgress.read(first,"running").step());
            CheckProgress.command(List.of("exec","app","java","/input/BootProbe.java","GET","/api/health"));
            assertEquals(4,CheckProgress.read(first,"running").step());
            CheckProgress.command(List.of("exec","app","sh","/opt/maven/bin/mvn","test"));
            assertEquals(4,CheckProgress.read(first,"running").step());
            CheckProgress.command(List.of("exec","app","java","/input/WaitForHttp.java"));
            assertEquals(4,CheckProgress.read(first,"running").step());
        } finally {CheckProgress.end();}
        CheckProgress.command(List.of("rm","-f","app"));
        assertEquals(4,CheckProgress.read(first,"running").step());
        CheckProgress.begin(second);
        try {assertEquals(1,CheckProgress.read(second,"running").step());}
        finally {CheckProgress.end();}
        assertEquals(5,CheckProgress.read(first,"passed").step());
        assertEquals("cancelled",CheckProgress.read(second,"cancelled").phase());
        assertEquals(0,CheckProgress.read("not-started","queued").step());
    }
}

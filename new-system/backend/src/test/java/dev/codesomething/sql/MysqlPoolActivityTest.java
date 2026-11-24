package dev.codesomething.sql;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MysqlPoolActivityTest {
    @Test void editingAndAnInFlightOperationProtectTheirSandboxesFromAnIdleSweep() {
        var clock = new AtomicLong();
        var pool = new MysqlPoolActivity(clock::get, Duration.ofMinutes(30));
        pool.touch("idle");
        pool.touch("editing");
        try (var operation = pool.hold("running")) {
            clock.addAndGet(Duration.ofMinutes(29).toMillis());
            pool.touch("editing");
            clock.addAndGet(Duration.ofMinutes(2).toMillis());
            var stopped = new ArrayList<String>();
            for (String name : List.of("running", "editing", "idle"))
                pool.reclaim(name, () -> stopped.add(name));
            assertEquals(List.of("idle"), stopped);
        }
        assertFalse(pool.reclaim("running", () -> fail("Just completed")));
    }
}

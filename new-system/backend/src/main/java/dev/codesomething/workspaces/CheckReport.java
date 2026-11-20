package dev.codesomething.workspaces;

import java.util.List;

public record CheckReport(String snapshotDigest, String courseVersion, String stageId,
    String policy, String image, String harnessDigest, boolean functionalPassed,
    List<Assertion> assertions, String log, String finishedAt) {
    public record Assertion(String name, boolean passed, String expected, String actual) {}
}

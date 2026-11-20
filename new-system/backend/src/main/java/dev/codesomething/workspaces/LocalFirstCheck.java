package dev.codesomething.workspaces;

import java.util.*;
import java.util.function.Supplier;

/** Local infrastructure failure is the only automatic fallback trigger. */
public final class LocalFirstCheck {
    private LocalFirstCheck() {}
    public static LocalProjectRunner.Outcome run(Supplier<LocalProjectRunner.Outcome> local,Supplier<LocalProjectRunner.Outcome> isolated) {
        var result=local.get();
        if(!result.status().equals("local_unavailable"))return result;
        CheckProgress.fallback();
        var backup=isolated.get();var report=backup.report();
        var assertions=new ArrayList<CheckReport.Assertion>();
        boolean backupUnavailable="environment_error".equals(backup.status());
        if(!backupUnavailable)assertions.add(new CheckReport.Assertion("检查运行方式",true,"本机运行优先；环境不可用时使用备用隔离环境",result.report().log()));
        assertions.addAll(report.assertions());
        String reason=backupUnavailable?"本机和备用隔离环境均未能运行检查。\n本机原因：":"本机环境不可用，已切换到备用隔离检查。\n本机原因：";
        return new LocalProjectRunner.Outcome(backup.status(),new CheckReport(report.snapshotDigest(),report.courseVersion(),report.stageId(),report.policy(),report.image(),report.harnessDigest(),report.functionalPassed(),List.copyOf(assertions),reason+result.report().log()+"\n"+report.log(),report.finishedAt()));
    }
}

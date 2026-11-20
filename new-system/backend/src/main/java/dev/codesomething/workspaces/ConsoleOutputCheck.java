package dev.codesomething.workspaces;

import java.util.List;

public final class ConsoleOutputCheck {
    public static final String POLICY="console-output-v1";
    private ConsoleOutputCheck() {}

    public static boolean applies(String course,String version,String stage) {
        return "http-json-basics".equals(course)&&"1.1.0".equals(version)&&"workspace".equals(stage);
    }

    static String verify(int exit,String stdout,List<CheckReport.Assertion> checks) {
        checks.add(new CheckReport.Assertion("程序退出",exit==0,"退出码 0", "退出码 "+exit));
        checks.add(new CheckReport.Assertion("控制台输出",!stdout.isBlank(),"使用标准输出打印至少一行非空文字",stdout.isBlank()?"没有收到文字。请在 main 中用 System.out.println 打印一句话。":stdout.stripTrailing()));
        return exit==0&&!stdout.isBlank()?"passed":"business_error";
    }
}

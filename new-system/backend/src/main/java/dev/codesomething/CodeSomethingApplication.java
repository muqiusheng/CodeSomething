package dev.codesomething;

import dev.codesomething.workspaces.RemoteJavaWorker;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CodeSomethingApplication {
    public static void main(String[] args) throws Exception {
        if (args.length == 1 && "--remote-java-one-job".equals(args[0])) {
            RemoteJavaWorker.run(System.getenv());
            return;
        }
        if (args.length == 1 && "--remote-java-worker".equals(args[0])) {
            RemoteJavaWorker.serve(System.getenv());
            return;
        }
        SpringApplication.run(CodeSomethingApplication.class, args);
    }
}

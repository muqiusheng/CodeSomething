package dev.codesomething.boot;

import dev.codesomething.admin.RunnerInventory;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** The application owns a fresh loopback-only network namespace. Only its job's database joins it. */
public final class PublicJdbcSandbox {
    private static final java.util.concurrent.Semaphore SLOT=new java.util.concurrent.Semaphore(1,true);
    private static final ThreadLocal<Long> APPLICATION_DEADLINE = new ThreadLocal<>();
    private PublicJdbcSandbox() {}

    @FunctionalInterface
    public interface Slot extends AutoCloseable { @Override void close(); }

    public static Slot acquire(java.util.function.BooleanSupplier cancelled) {
        try {
            while(!cancelled.getAsBoolean()) if(SLOT.tryAcquire(200,TimeUnit.MILLISECONDS)) return SLOT::release;
        } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
        return null;
    }

    public static String[] database(Path root,String db,String app,String job,String ownerLabel,String jobLabel,
                                    String image,String bootstrapPassword) {
        return new String[]{"run","-d","--pull=never","--name",db,"--label="+ownerLabel,"--label="+jobLabel,
            "--label="+RunnerInventory.scopeLabel(root.getParent()),"--label=codesomething.check-job="+job,
            "--network=container:"+app,"--read-only","--user=999:999","--memory=512m","--memory-swap=512m",
            "--cpus=1","--pids-limit=64","--cap-drop=ALL","--security-opt=no-new-privileges","--log-driver=none",
            "--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=256m,mode=1777",
            "--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777","--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777",
            "--env=MYSQL_ROOT_PASSWORD="+bootstrapPassword,"--env=MYSQL_ROOT_HOST=localhost",image,
            "--bind-address=127.0.0.1","--mysqlx=OFF","--local-infile=0","--secure-file-priv=NULL",
            "--max-connections=12","--innodb-buffer-pool-size=48M","--performance-schema=OFF","--skip-log-bin"};
    }

    public static void configureApp(List<String> args,Path root,String job) {
        args.replaceAll(arg -> switch(arg) {
            case "--memory=640m" -> "--memory=512m";
            case "--memory-swap=640m" -> "--memory-swap=512m";
            case "--pids-limit=128" -> "--pids-limit=64";
            default -> arg;
        });
        if (!args.contains("--network=none")) throw new IllegalStateException("Expected isolated app network");
        args.add("--label=codesomething.check-job="+job);
        args.add("--label="+RunnerInventory.scopeLabel(root.getParent()));
    }

    public static long commandDeadline(long deadline) {
        return Math.min(deadline,System.nanoTime()+TimeUnit.SECONDS.toNanos(30));
    }

    public static void beginApplication(long jobDeadline) {
        APPLICATION_DEADLINE.set(commandDeadline(jobDeadline));
    }

    public static long activeDeadline(long deadline) {
        Long applicationDeadline = APPLICATION_DEADLINE.get();
        return applicationDeadline == null ? deadline : Math.min(deadline, applicationDeadline);
    }

    public static void endApplication() {
        APPLICATION_DEADLINE.remove();
    }

    public static String startCommand(boolean hardened) {
        return hardened ? MavenBuildEnvironment.START_JAR.replace("exec java ", "exec timeout -s KILL 30s java -XX:+UseSerialGC ")
            : MavenBuildEnvironment.START_JAR;
    }

    public static List<String> mavenCommand(String app, boolean hardened, String... goals) {
        var args = new ArrayList<>(List.of("exec", "--workdir=/tmp/project", app));
        if (hardened) args.addAll(List.of("timeout", "-s", "KILL", "30s"));
        args.addAll(List.of("sh", "/opt/maven/bin/mvn", "-B", "-ntp", "-o", "-s", "/opt/settings.xml",
            "-Dmaven.repo.local=/opt/repository"));
        args.addAll(List.of(goals));
        return args;
    }

    public static List<String> probe(String app,String method,String path,String payload,String bearer) {
        return List.of("exec",app,"sh","/input/public-probe.sh",method,path,
            payload.equals("-")?"none":payload,bearer.equals("-")?"none":bearer);
    }

    public static void writeProbe(Path input) throws java.io.IOException {
        java.nio.file.Files.writeString(input.resolve("public-probe.sh"),"""
            set -eu
            work=$(mktemp -d)
            trap 'rm -f "$work/body" "$work/headers" "$work/input"; rmdir "$work"' EXIT
            method=$1 path=$2 payload=$3 bearer=$4
            set -- --silent --show-error --connect-timeout 1 --max-time 3 --max-filesize 16384 -X "$method" -H 'Content-Type: application/json' -D "$work/headers" -o "$work/body" -w '%{http_code}\n'
            if [ "$payload" != none ]; then
                printf '%s' "$payload" | base64 -d > "$work/input"
                set -- "$@" --data-binary "@$work/input"
            fi
            if [ "$bearer" != none ]; then
                set -- "$@" -H "Authorization: Bearer $bearer"
            fi
            curl "$@" -- "http://127.0.0.1:8080$path"
            awk 'tolower($1)=="content-type:" {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); printf "%s",$0; exit}' "$work/headers" | base64 -w0
            printf '\n'
            base64 -w0 "$work/body"
            printf '\n'
            awk 'tolower($1)=="x-request-id:" {sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' "$work/headers"
            """);
    }

    public static List<String> rootCommand(List<String> args,String password) {
        if (password==null || args.size()<4 || !args.getFirst().equals("exec")
            || !args.get(2).equals("mysql") || !args.get(3).equals("-uroot")) return args;
        var command = new ArrayList<>(args);
        command.addAll(1,List.of("-e","MYSQL_PWD="+password));
        return command;
    }
}

package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.nio.file.Path;
import dev.codesomething.workspaces.WorkspaceController;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class RunnerInventory {
    public record Container(String id,String name,String state,String status,String jobId,String kind,String runningFor,String ownerId) {}
    private final String docker;
    private final String mysqlDocker;
    private final String scope;
    private final JsonMapper json=JsonMapper.builder().build();

    public RunnerInventory(@Value("${cs.runner.docker}") String docker,
                           @Value("${CS_MYSQL_EXECUTOR:${cs.runner.docker}}") String mysqlDocker,
                           @Value("${cs.data-directory}") String data) {
        this.docker=docker;this.mysqlDocker=mysqlDocker;this.scope=scopeLabel(Path.of(data));
    }

    public static String scopeLabel(Path data) {
        return "codesomething.scope="+WorkspaceController.hash(data.toAbsolutePath().normalize().toString().getBytes(StandardCharsets.UTF_8));
    }

    public Map<String,Object> health() {
        long start = System.nanoTime();
        try {
            String version = command("version","--format","{{.Server.Version}}");
            return Map.of("status","ready","version",version.strip(),"latencyMs",(System.nanoTime()-start)/1_000_000);
        } catch (ApiException e) { return Map.of("status","unavailable"); }
    }

    public List<Container> containers() {
        var result = new ArrayList<Container>();
        result.addAll(list("codesomething.check-job", "check"));
        result.addAll(list("codesomething.r6-scope", "generated"));
        result.addAll(list("codesomething.public-mysql=1", "mysql"));
        return result;
    }

    long activeMysql() {
        return list("codesomething.public-mysql=1","mysql").stream().filter(c->"running".equals(c.state())).count();
    }

    private List<Container> list(String filter, String kind) {
        String result = commandOn(kind.equals("mysql") ? mysqlDocker : docker,
            "ps", "-a", "--no-trunc", "--filter", "label="+filter, "--filter", "label="+scope, "--format", "{{json .}}");
        var containers = new ArrayList<Container>();
        for (String line:result.lines().filter(value->!value.isBlank()).toList()) {
            var row=json.readTree(line);
            String id=row.path("ID").asText(),name=row.path("Names").asText();
            if (!id.matches("[0-9a-f]{12,64}") || !name.matches("cs-(r23|r331|r33-(?:app|db)|r8-(?:app|db)|r6|sql-(?:learner|school))-[a-f0-9-]+")) continue;
            var labels=Arrays.asList(row.path("Labels").asText().split(","));
            if (!labels.contains(scope) || (kind.equals("mysql") && !labels.contains("codesomething.public-mysql=1"))) continue;
            String job=labels.stream()
                .filter(label->label.startsWith("codesomething.check-job=")).map(label->label.substring(label.indexOf('=')+1))
                .findFirst().orElse("");
            if (kind.equals("check") && job.isBlank()) continue;
            if (kind.equals("generated")) job = name.substring("cs-r6-".length());
            String owner = labels.stream().filter(label->label.startsWith("codesomething.learner="))
                .map(label->label.substring(label.indexOf('=')+1)).findFirst().orElse("");
            containers.add(new Container(id,name,row.path("State").asText(),row.path("Status").asText(),job,kind,row.path("RunningFor").asText(),owner));
        }
        return containers;
    }

    public void remove(Container container) { command("rm", "-f", container.id()); }
    void releaseCheck(Container container) {
        try { remove(container); }
        catch (ApiException error) {
            if (containers().stream().anyMatch(current -> current.id().equals(container.id()))) throw error;
        }
    }

    public static String ownerLabel() {
        return "codesomething.learner=" + dev.codesomething.storage.LearningDataSource.owner();
    }

    private String command(String... arguments) {
        return commandOn(docker, arguments);
    }

    private String commandOn(String executable, String... arguments) {
        Process process = null;
        try {
            var argv = new ArrayList<String>();
            argv.add(executable);
            argv.addAll(List.of(arguments));
            process = new ProcessBuilder(argv).redirectErrorStream(true).start();
            var input = process.getInputStream();
            byte[][] output = new byte[1][];
            Thread reader = Thread.ofVirtual().start(() -> {
                try (input) { output[0] = input.readNBytes(128 * 1024 + 1); }
                catch (java.io.IOException ignored) { }
            });
            if (process.waitFor(6, TimeUnit.SECONDS)) {
                reader.join(500);
                if (process.exitValue()==0 && output[0]!=null && output[0].length<=128*1024)
                    return new String(output[0], StandardCharsets.UTF_8).stripTrailing();
            }
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        catch (java.io.IOException ignored) { }
        finally { if (process!=null && process.isAlive()) process.destroyForcibly(); }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"DOCKER_UNAVAILABLE","Docker 无法完成当前操作。",Map.of());
    }
}

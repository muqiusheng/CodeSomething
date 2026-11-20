package dev.codesomething;

import dev.codesomething.boot.BootProjectSnapshot;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class BootProjectSnapshotTest {
    @TempDir Path directory;

    @Test void learnerProjectKeepsItsOwnPackageStartupNamePomAndResources() throws Exception {
        String pom=BootProjectSnapshot.trustedPom().replace("dev.codesomething","com.example").replace("boot-lab","learn-springboot");
        var files=new java.util.LinkedHashMap<String,String>();
        files.put("pom.xml",pom);
        files.put("src/main/java/com/example/demo/LearnApplication.java","package com.example.demo; @org.springframework.boot.autoconfigure.SpringBootApplication public class LearnApplication { public static void main(String[] args) { org.springframework.boot.SpringApplication.run(LearnApplication.class,args); } }");
        files.put("src/main/java/com/example/demo/controller/HealthController.java","package com.example.demo.controller; class HealthController {}");
        files.put("src/main/resources/application.properties","spring.application.name=learn-springboot");
        var snapshot=BootProjectSnapshot.fromFiles(files,false);
        assertEquals(pom,snapshot.files().stream().filter(f->f.path().equals("pom.xml")).findFirst().orElseThrow().content());
        assertEquals(files.size(),snapshot.files().size());
        for(var f:snapshot.files()){var path=directory.resolve(f.path());Files.createDirectories(path.getParent());Files.writeString(path,f.content());}
        assertEquals(snapshot.digest(),BootProjectSnapshot.capture(directory).digest());
        assertEquals(snapshot.digest(),BootProjectSnapshot.restore(tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(snapshot.files())).digest());
    }

    Path project() throws Exception {
        Files.writeString(directory.resolve("pom.xml"), BootProjectSnapshot.trustedPom());
        var source=directory.resolve("src/main/java/dev/codesomething/lab");
        Files.createDirectories(source);
        Files.writeString(source.resolve("Application.java"), "package dev.codesomething.lab; class Application {}");
        Files.writeString(source.resolve("HealthController.java"), "package dev.codesomething.lab; class HealthController {}");
        return directory;
    }

    @Test void captureContainsOnlyDeclaredSourcesAndBindsEveryFileToTheDigest() throws Exception {
        var root=project();
        Files.writeString(root.resolve(".env"), "DO_NOT_CAPTURE=secret");
        Files.createDirectories(root.resolve(".mvn"));
        Files.writeString(root.resolve(".mvn/extensions.xml"), "do not run");
        var first=BootProjectSnapshot.capture(root);
        assertEquals(java.util.List.of("pom.xml", "src/main/java/dev/codesomething/lab/Application.java",
            "src/main/java/dev/codesomething/lab/HealthController.java"), first.files().stream().map(BootProjectSnapshot.Source::path).toList());
        assertEquals(first.digest(), BootProjectSnapshot.capture(root).digest());
        Files.writeString(root.resolve("src/main/java/dev/codesomething/lab/HealthController.java"), "package dev.codesomething.lab; class HealthController { int changed; }");
        assertNotEquals(first.digest(), BootProjectSnapshot.capture(root).digest());
        assertFalse(first.files().stream().anyMatch(f -> f.content().contains("changed")));
    }

    @Test void snapshotRejectsMalformedPomAndOversizedSourcesButAllowsNestedPackages() throws Exception {
        var root=project();
        Files.writeString(root.resolve("pom.xml"),"<!DOCTYPE project [<!ENTITY xxe SYSTEM \"file:///secret\">]><project>&xxe;</project>");
        assertThrows(java.io.IOException.class,()->BootProjectSnapshot.capture(root));
        Files.writeString(root.resolve("pom.xml"),BootProjectSnapshot.trustedPom());
        var large=root.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/Large.java");
        Files.writeString(large,"x".repeat(65537));
        assertThrows(java.io.IOException.class,()->BootProjectSnapshot.capture(root));
        Files.delete(large);
        Files.createDirectory(root.resolve(BootProjectSnapshot.SOURCE_DIRECTORY+"/nested"));
        assertDoesNotThrow(()->BootProjectSnapshot.capture(root));
    }

    @Test void sourceDirectoryJunctionIsRejectedWithoutReadingItsTarget() throws Exception {
        var root=project();
        Path source=root.resolve(BootProjectSnapshot.SOURCE_DIRECTORY),external=root.resolve("outside-declared-sources");
        Files.move(source,external);
        if(System.getProperty("os.name").startsWith("Windows")) {
            var process=new ProcessBuilder("cmd.exe","/c","mklink","/J",source.toString(),external.toString()).redirectErrorStream(true).start();
            String output=new String(process.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            assertEquals(0,process.waitFor(),output);
        } else Files.createSymbolicLink(source,external);
        try {assertThrows(java.io.IOException.class,()->BootProjectSnapshot.capture(root));}
        finally {Files.delete(source);}
        assertTrue(Files.exists(external.resolve("Application.java")),"拒绝链接后保留目标文件");
    }
}

package dev.codesomething.school;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
class SchoolStudent {
    record Identity(String number, String name) {}
    private final Path profile;
    @Value("${cs.public:false}") private boolean publicMode;

    SchoolStudent(@Value("${cs.data-directory}") String dataDirectory) {
        profile = Path.of(dataDirectory).resolve("school-student.properties");
    }

    Identity identity() {
        if (publicMode) return new Identity("", "");
        var values = new Properties();
        if (Files.isRegularFile(profile)) {
            try (var reader = Files.newBufferedReader(profile)) { values.load(reader); }
            catch (IOException e) { throw new IllegalStateException("Cannot load school student profile", e); }
        }
        return new Identity(values.getProperty("number", "").strip(), values.getProperty("name", "").strip());
    }
}

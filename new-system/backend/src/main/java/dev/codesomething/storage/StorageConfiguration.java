package dev.codesomething.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StorageConfiguration {
    @Bean(initMethod = "migrate")
    Flyway flyway(DataSource dataSource, @Value("${cs.data-directory}") String directory) throws IOException {
        Files.createDirectories(Path.of(directory));
        return Flyway.configure().dataSource(dataSource)
            .locations("classpath:db/migration").validateMigrationNaming(true).load();
    }
}

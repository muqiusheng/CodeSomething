package dev.codesomething.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StorageConfiguration {
    @Bean
    LearningDataSource dataSource(@Value("${cs.data-directory}") String directory,
                                  @Value("${spring.datasource.url}") String url,
                                  @Value("${cs.public}") boolean publicMode) throws IOException {
        Path path = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(path);
        return new LearningDataSource(url, path, publicMode);
    }

    @Bean(initMethod = "migrate")
    Flyway flyway(LearningDataSource dataSource) {
        return LearningDataSource.migrations(dataSource.primary());
    }
}

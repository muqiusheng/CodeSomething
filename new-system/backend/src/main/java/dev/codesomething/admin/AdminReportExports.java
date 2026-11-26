package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.school.AdminSchoolService;
import dev.codesomething.storage.LearningDataSource;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name="cs.public", havingValue="true")
final class AdminReportExports {
    private static final Duration RETENTION = Duration.ofMinutes(30);
    private static final Set<String> IN_PROGRESS = Set.of("queued","generating");
    private final Map<String, Task> tasks = new HashMap<>();
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(3));
    private final ScheduledThreadPoolExecutor cleanup = new ScheduledThreadPoolExecutor(1);
    private final LearningDataSource storage;
    private final AdminSchoolService school;
    private final Path directory;

    public record Status(String id,String status,String message,String courseId,String labId,String userId,String format,Instant createdAt) {}
    record Archive(Path file, String courseId, String format) {}

    private static final class Task {
        final String id = UUID.randomUUID().toString();
        final String owner;
        final String course;
        final String format;
        final String labId;
        final String userId;
        final Instant createdAt=Instant.now();
        volatile Status state;
        volatile Instant expires = Instant.MAX;
        Path file;

        Task(String owner,String course,String format,String labId,String userId) {
            this.owner=owner;
            this.course=course;
            this.format=format;
            this.labId=labId;
            this.userId=userId;
            this.state=state("queued","");
        }

        Status state(String status,String message) { return new Status(id,status,message,course,labId,userId,format,createdAt); }
    }

    AdminReportExports(LearningDataSource storage,AdminSchoolService school,
                       @Value("${cs.data-directory}") String dataDirectory) throws IOException {
        this.storage=storage;
        this.school=school;
        directory=Files.createDirectories(Path.of(dataDirectory).resolve("admin-report-exports"));
        // Export handles are process-local. Remove archives from an earlier interrupted process.
        try (var old=Files.newDirectoryStream(directory,"report-*.zip")) {
            for (Path file : old) delete(file);
        }
        cleanup.scheduleWithFixedDelay(this::expire,1,1,TimeUnit.MINUTES);
    }

    synchronized Status start(String owner,String course,String format,String labId,String userId) {
        school.validateExport(course,format,labId);
        expire();
        for (var task : tasks.values()) {
            if (owner.equals(task.owner) && course.equals(task.course) && format.equals(task.format)
                && task.labId.equals(labId) && task.userId.equals(userId)
                && IN_PROGRESS.contains(task.state.status())) return task.state;
        }
        if (tasks.size()>=8 || worker.getQueue().remainingCapacity()==0)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"EXPORT_BUSY","报告归档队列已满，请稍后重试。",Map.of());
        var task=new Task(owner,course,format,labId,userId);
        tasks.put(task.id,task);
        worker.execute(() -> generate(task));
        return task.state;
    }

    synchronized Status status(String owner,String id) { return require(owner,id).state; }

    synchronized java.util.List<Status> recent(String owner) {
        expire();
        return tasks.values().stream().filter(task->task.owner.equals(owner)).map(task->task.state)
            .sorted(java.util.Comparator.comparing(Status::createdAt).reversed()).toList();
    }

    synchronized Archive download(String owner,String id) {
        var task=require(owner,id);
        if (!"ready".equals(task.state.status()))
            throw new ApiException(HttpStatus.CONFLICT,"EXPORT_NOT_READY","报告归档尚未就绪。",Map.of());
        task.expires=Instant.now().plus(RETENTION);
        return new Archive(task.file,task.course,task.format);
    }

    private Task require(String owner,String id) {
        var task=tasks.get(id);
        if (task==null || !owner.equals(task.owner) || task.expires.isBefore(Instant.now()))
            throw new ApiException(HttpStatus.NOT_FOUND,"EXPORT_EXPIRED","找不到归档任务，请重新生成。",Map.of());
        return task;
    }

    private void generate(Task task) {
        task.state=task.state("generating","");
        try {
            task.file=Files.createTempFile(directory,"report-", ".zip");
            try (var output=Files.newOutputStream(task.file)) {
                var owners=task.userId.isBlank()?storage.owners(false):
                    storage.exists(task.userId)?java.util.List.of(task.userId):java.util.List.<String>of();
                school.export(task.course,task.format,task.labId,owners,output);
            }
            task.state=task.state("ready","");
        } catch (Exception error) {
            delete(task.file);
            task.state=task.state("failed",error instanceof ApiException ? error.getMessage() : "生成归档失败，请重试。");
            if (!(error instanceof ApiException)) LoggerFactory.getLogger(AdminReportExports.class).warn("Report archive failed",error);
        } finally {
            task.expires=Instant.now().plus(RETENTION);
        }
    }

    private synchronized void expire() {
        tasks.values().removeIf(task -> {
            if (task.expires.isAfter(Instant.now())) return false;
            delete(task.file);
            return true;
        });
    }

    private static void delete(Path file) {
        if (file==null) return;
        try { Files.deleteIfExists(file); }
        catch (IOException error) { LoggerFactory.getLogger(AdminReportExports.class).warn("Could not remove expired report archive",error); }
    }

    @PreDestroy void close() throws InterruptedException {
        cleanup.shutdownNow();
        worker.shutdownNow();
        worker.awaitTermination(5,TimeUnit.SECONDS);
        tasks.values().forEach(task -> delete(task.file));
    }
}

package dev.codesomething.sql;

import dev.codesomething.api.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;

@Component
public class MysqlEnvironment {
    public static final String IMAGE="mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902";
    public static final String PRACTICE="cs_practice";
    private final String docker,container;
    private final boolean school;
    private final boolean publicMode;
    private final String scope;
    private final PoolSettings pool;
    private final Path snapshots;
    private final MysqlPoolActivity poolActivity;
    private final Map<String, MysqlEnvironment> sandboxes;
    private static final long MAX_SNAPSHOT_BYTES = 32L * 1024 * 1024;
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(MysqlEnvironment.class);
    private static final Set<String> SYSTEM_DATABASES = Set.of("mysql", "sys", "information_schema", "performance_schema");
    private static final Object PUBLIC_START_LOCK = new Object();
    private static final Semaphore PUBLIC_DISK_STARTS = new Semaphore(3, true);
    // A Docker output reader can block until its input writer finishes.
    private static final Executor DOCKER_PIPE_IO = task -> Thread.ofPlatform().daemon().name("mysql-docker-pipe").start(task);
    private final SqlCourse course;
    @Value("${cs.sql.public-identity-root:}") private String configuredIdentityRoot = "";
    @Value("${cs.sql.public-disk-volume-prefix:}") private String diskVolumePrefix = "";
    private String ownedContainerId;
    private boolean ownedDisk;
    private volatile String state="not_checked",message="请启动或连接教学环境。",version="";
    @Autowired
    public MysqlEnvironment(SqlCourse course,@Value("${CS_MYSQL_EXECUTOR:${cs.runner.docker}}") String docker,@Value("${cs.sql.container:cs-sql-learning}") String container,
                            @Value("${cs.public:false}") boolean publicMode,@Value("${cs.data-directory}") String data,
                            @Value("${cs.sql.public-pool-limit:8}") int poolLimit,
                            @Value("${cs.sql.public-pool-peak:0}") int poolPeak,
                            @Value("${cs.sql.public-disk:false}") boolean disk){
        this(course,docker,container,publicMode,data,new PoolSettings(poolLimit,poolPeak,disk),
            new MysqlPoolActivity(() -> TimeUnit.NANOSECONDS.toMillis(System.nanoTime()), MysqlPoolActivity.DEFAULT_IDLE));
    }

    public MysqlEnvironment(SqlCourse course,String docker,String container,boolean publicMode,String data,int poolLimit) {
        this(course,docker,container,publicMode,data,poolLimit,0,false);
    }

    public record PoolSettings(int normal, int peak, boolean disk) {
        public PoolSettings {
            int maximum = disk ? 15 : 8;
            normal = Math.clamp(normal, 0, maximum);
            peak = normal == 0 ? 0 : Math.clamp(peak, normal, maximum);
        }
    }

    MysqlEnvironment(SqlCourse course,String docker,String container,boolean publicMode,String data,int poolLimit,
                     MysqlPoolActivity poolActivity) {
        this(course,docker,container,publicMode,data,new PoolSettings(poolLimit,0,false),poolActivity);
    }

    MysqlEnvironment(SqlCourse course,String docker,String container,boolean publicMode,String data,PoolSettings pool,
                     MysqlPoolActivity poolActivity) {
        this(course,docker,container,false,publicMode,dev.codesomething.admin.RunnerInventory.scopeLabel(Path.of(data)),pool,
            Path.of(data).resolve("mysql-idle"), poolActivity, new ConcurrentHashMap<>());
    }
    private MysqlEnvironment(SqlCourse course,String docker,String container,boolean school,boolean publicMode,String scope,PoolSettings pool,
                             Path snapshots,MysqlPoolActivity poolActivity,Map<String,MysqlEnvironment> sandboxes){
        if(!container.matches("cs-sql-[a-z0-9-]{1,70}"))throw new IllegalArgumentException("Invalid SQL container name");
        this.course=course;this.docker=docker;this.container=container;this.school=school;this.publicMode=publicMode;this.scope=scope;
        this.pool=pool;
        this.snapshots=snapshots;this.poolActivity=poolActivity;this.sandboxes=sandboxes;
    }
    public MysqlEnvironment schoolInstance(String key) {
        if(!key.matches("[a-f0-9]{24}"))throw new IllegalArgumentException("Invalid school instance");
        return sandbox("cs-sql-school-"+key, true, publicMode);
    }
    public MysqlEnvironment learnerInstance(String key) {
        if(!key.matches("[a-f0-9]{24}"))throw new IllegalArgumentException("Invalid learner instance");
        return sandbox("cs-sql-learner-"+key, false, true);
    }
    private MysqlEnvironment sandbox(String name, boolean school, boolean publicSandbox) {
        return sandboxes.computeIfAbsent(name, value -> {
            var environment = new MysqlEnvironment(course,docker,value,school,publicSandbox,
                scope,pool,snapshots,poolActivity,sandboxes);
            environment.diskVolumePrefix = diskVolumePrefix;
            return environment;
        });
    }

    @jakarta.annotation.PostConstruct
    void validatePublicDiskConfiguration() {
        if (publicMode && pool.disk() && !validDiskVolumePrefix()) {
            throw new IllegalStateException("Public MySQL disk mode requires a managed quota volume prefix.");
        }
    }

    private boolean validDiskVolumePrefix() {
        return diskVolumePrefix.matches("cs-mysql-slot-[a-z0-9][a-z0-9-]{2,35}");
    }

    // Called under the admission lock. Even stopped containers retain their assigned slot.
    private String allocateDiskMount() {
        if (diskVolumePrefix.isEmpty()) return "--mount=type=volume,target=/var/lib/mysql";
        if (!validDiskVolumePrefix()) throw new Failure("environment_error","定额磁盘卷配置无效。");
        var volumes = require(command(null,5,()->false,"volume","ls",
            "--filter","label=codesomething.mysql-slot="+diskVolumePrefix,"--format","{{.Name}}"));
        var attached = require(command(null,5,()->false,"ps","-a","--no-trunc","--format","{{.Mounts}}"));
        var used = new HashSet<>(Arrays.asList(attached.split("[,\\s]+")));
        for (var name : volumes.lines().sorted().toList()) {
            if (!name.matches(Pattern.quote(diskVolumePrefix)+"-(0[1-9]|1[0-5])") || used.contains(name)) continue;
            String wipe = "set -eu; [ \"$(stat -f -c %T /slot)\" = ext2/ext3 ]; " +
                "df -Pk /slot | awk 'NR==2 && $2>=300000 && $2<=393216 {ok=1} END {exit !ok}'; " +
                "find /slot -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system -- {} +; " +
                "test -z \"$(ls -A /slot)\"";
            var cleaned = command(null,15,()->false,"run","--rm","--pull=never","--network=none","--read-only",
                "--memory=64m","--cpus=0.5","--pids-limit=32","--cap-drop=ALL","--security-opt=no-new-privileges",
                "--user=999:999","--log-driver=none","--mount=type=volume,source="+name+",target=/slot,volume-nocopy",
                "--entrypoint=/bin/sh",IMAGE,"-c",wipe);
            if (cleaned.code()==0) return "--mount=type=volume,source="+name+",target=/var/lib/mysql,volume-nocopy";
        }
        throw new Failure("environment_error","没有可用的定额磁盘卷，请稍后重试。");
    }

    public interface Activity extends AutoCloseable {
        @Override void close();
    }

    public Activity activity() {
        if (!publicMode) return () -> {};
        return poolActivity.hold(container)::close;
    }

    public void touch() {
        if (publicMode) poolActivity.touch(container);
    }

    private List<String> publicRunning() {
        var result = require(command(null, 5, () -> false, "ps", "--filter", "label=codesomething.public-mysql=1",
            "--filter", "label="+scope, "--format", "{{.Names}}"));
        return result.lines().filter(name -> !name.isBlank()).toList();
    }

    @org.springframework.context.annotation.Bean(defaultCandidate=false)
    public org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler mysqlIdleScheduler() {
        var scheduler = new org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler();
        scheduler.setThreadNamePrefix("mysql-idle-");
        return scheduler;
    }

    @org.springframework.scheduling.annotation.Scheduled(scheduler="mysqlIdleScheduler", fixedDelay=60_000, initialDelay=30_000)
    void recycleIdle() {
        if (!publicMode || pool.normal() == 0) return;
        try { reclaimOldest(publicRunning()); }
        catch (Failure failure) { LOG.warn("Could not inspect the public MySQL pool: {}", failure.getMessage()); }
    }

    private boolean reclaimOldest(List<String> running) {
        for (var name : running.stream().filter(v -> v.matches("cs-sql-(school|learner)-[a-f0-9]{24}"))
                .sorted(Comparator.comparingLong(poolActivity::lastActivity)).toList()) {
            try {
                if (poolActivity.reclaim(name, () -> sandbox(name, name.startsWith("cs-sql-school-"), true).hibernate(false)))
                    return true;
            } catch (Failure failure) {
                LOG.warn("Idle MySQL sandbox retained after snapshot error: {}", failure.getMessage());
            }
        }
        return false;
    }

    private Path snapshotPath() { return snapshots.resolve(container + ".sql"); }

    private Path restoreMarker() { return snapshots.resolve(container + ".restoring"); }

    private void markRestore() {
        try { Files.writeString(restoreMarker(), ""); }
        catch (IOException failure) { throw new Failure("environment_error", "无法记录快照恢复状态。"); }
    }

    private void clearRestoreMarker() {
        try { Files.deleteIfExists(restoreMarker()); }
        catch (IOException failure) { throw new Failure("environment_error", "无法完成快照恢复。"); }
    }

    private List<String> snapshotSchemas() {
        return root("SHOW DATABASES;").lines().skip(1)
            .filter(db -> !SYSTEM_DATABASES.contains(db) && !db.startsWith("cs_exam_") && !db.startsWith("cs_check_"))
            .map(db -> {
                if (!schoolDatabaseName(db)) throw new Failure("environment_error", "练习库中有无法安全备份的数据库名。");
                return db;
            }).toList();
    }

    public record PublicActivity(boolean busy, long idleSeconds, Instant lastActiveAt) {}

    public PublicActivity publicActivity(String name) {
        long idle = poolActivity.idleMillis(name);
        return new PublicActivity(poolActivity.busy(name), idle / 1000, Instant.now().minusMillis(idle));
    }

    public boolean releasePublic(String name, String id, boolean wait) {
        if (!publicMode || !name.matches("cs-sql-(school|learner)-[a-f0-9]{24}") || !id.matches("[a-f0-9]{12,64}"))
            throw new Failure("environment_error", "目标练习容器不可用。");
        var environment = sandbox(name, name.startsWith("cs-sql-school-"), true);
        return poolActivity.release(name, wait, () -> environment.releaseOwned(id));
    }

    private synchronized void releaseOwned(String id) {
        owned();
        if (!ownedContainerId.startsWith(id))
            throw new Failure("environment_error", "目标容器已更换，请刷新后重试。");
        String running = require(command(null, 5, () -> false, "inspect", "--format={{.State.Running}}", ownedContainerId)).strip();
        if ("true".equals(running)) {
            hibernate(true);
        } else if ("false".equals(running)) {
            if (ownedDisk && !Files.exists(restoreMarker())) {
                start();
                if (!"ready".equals(state)) throw new Failure("environment_error", message);
                owned();
                if (!ownedContainerId.startsWith(id))
                    throw new Failure("environment_error", "目标容器已更换，请刷新后重试。");
                hibernate(true);
                return;
            }
            require(command(null, 10, () -> false, "rm", "-v", ownedContainerId));
            state = "hibernated";
            message = "练习环境已释放。";
        } else {
            throw new Failure("environment_error", "无法确认练习容器状态。");
        }
    }

    private void hibernate(boolean remove) {
        owned();
        if (Files.exists(restoreMarker()))
            throw new Failure("environment_error", "练习快照尚待恢复，请启动环境后再释放。");
        var databases = snapshotSchemas();
        try {
            Files.createDirectories(snapshots);
            var temp = Files.createTempFile(snapshots, "dump-", ".partial");
            try {
                if (!databases.isEmpty()) {
                    var args = new ArrayList<>(List.of("exec", ownedContainerId, "mysqldump", "--protocol=socket",
                        "-uroot", "--default-character-set=utf8mb4", "--set-gtid-purged=OFF", "--no-tablespaces",
                        "--routines", "--events", "--triggers", "--hex-blob", "--single-transaction", "--databases"));
                    args.addAll(databases);
                    snapshotProcess(args, temp, false);
                }
                Files.move(temp, snapshotPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                try { Files.deleteIfExists(temp); }
                catch (IOException failure) { LOG.warn("Could not remove partial MySQL snapshot", failure); }
            }
            require(command(null, 20, () -> false, "stop", "-t", "10", ownedContainerId));
            if (remove || ownedDisk || !diskVolumePrefix.isEmpty()) {
                markRestore();
                require(command(null, 10, () -> false, "rm", "-v", ownedContainerId));
            }
            state = "hibernated";
            message = "练习库已保存。下次使用时会自动恢复。";
        } catch (IOException failure) {
            LOG.warn("Could not write MySQL snapshot", failure);
            throw new Failure("environment_error", "无法保存练习库快照，已保留运行环境。");
        }
    }

    private void restoreSnapshot() {
        if (!Files.isRegularFile(snapshotPath())) return;
        try {
            if (Files.size(snapshotPath()) == 0) return;
        } catch (IOException failure) {
            throw new Failure("environment_error", "无法读取练习库快照。");
        }
        if (school) root("CREATE USER IF NOT EXISTS 'school_student'@'localhost';");
        snapshotProcess(List.of("exec", "-i", ownedContainerId, "mysql", "--protocol=socket", "-uroot",
            "--default-character-set=utf8mb4", "--binary-mode=1"), snapshotPath(), true);
        if (school) for (var schema : snapshotSchemas()) grantSchoolSchema(schema);
    }

    private void snapshotProcess(List<String> args, Path path, boolean restore) {
        var command = new ArrayList<String>();
        command.add(docker);
        command.addAll(args);
        Process process = null;
        try {
            var builder = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.DISCARD);
            if (restore) builder.redirectInput(path.toFile()).redirectOutput(ProcessBuilder.Redirect.DISCARD);
            process = builder.start();
            var running = process;
            FutureTask<Long> dump = null;
            if (!restore) {
                process.getOutputStream().close();
                dump = new FutureTask<>(() -> {
                    try (var input = running.getInputStream(); var output = Files.newOutputStream(path)) {
                        var buffer = new byte[8192];
                        long total = 0;
                        for (int size; (size = input.read(buffer)) != -1; ) {
                            total += size;
                            if (total > MAX_SNAPSHOT_BYTES) throw new IOException("Snapshot exceeds 32 MiB");
                            output.write(buffer, 0, size);
                        }
                        return total;
                    }
                });
                Thread.ofVirtual().start(dump);
            }
            if (!process.waitFor(40, TimeUnit.SECONDS))
                throw new Failure("environment_error", "练习库快照处理超时。");
            if (process.exitValue() != 0 || dump != null && dump.get(5, TimeUnit.SECONDS) == 0)
                throw new Failure("environment_error", restore ? "练习库快照恢复失败。" : "练习库快照保存失败。");
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new Failure("environment_error", "练习库快照操作已中断。");
        } catch (IOException | ExecutionException | TimeoutException failure) {
            throw new Failure("environment_error", "无法处理练习库快照文件。");
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
        }
    }

    public int publicPoolLimit() { return pool.peak(); }
    public PoolSettings publicPoolSettings() { return pool; }
    public long publicPoolIdleMinutes() { return MysqlPoolActivity.DEFAULT_IDLE.toMinutes(); }
    public String publicIdentityRoot(String actualDataDirectory) {
        return configuredIdentityRoot.isBlank() ? actualDataDirectory : configuredIdentityRoot;
    }
    public record Environment(String status,String message,String version,String image,String container,String database) {}
    public Environment status(){return new Environment(state,message,version,IMAGE,container,PRACTICE);}
    public static String digest(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    public static class Failure extends RuntimeException {
        public final String status;
        public Failure(String status,String message){super(message);this.status=status;}
    }
    record ProcessResult(int code,String output,String error) {}
    private ProcessResult command(String input,int seconds,BooleanSupplier cancelled,String... args) {
        return command(input, seconds, cancelled, false, args);
    }

    private ProcessResult command(String input,int seconds,BooleanSupplier cancelled,boolean separateError,String... args) {
        var command=new ArrayList<String>();command.add(docker);command.addAll(List.of(args));
        Process p=null;
        try {
            p=new ProcessBuilder(command).redirectErrorStream(!separateError).start();
            var process=p;
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);
            var bytes = new java.util.concurrent.atomic.AtomicInteger();
            var output = readOutput(process.getInputStream(), process, bytes);
            var error = separateError ? readOutput(process.getErrorStream(), process, bytes) : CompletableFuture.completedFuture("");
            var written = CompletableFuture.runAsync(() -> {
                try (var writer = process.getOutputStream()) {
                    if (input != null) writer.write(input.getBytes(StandardCharsets.UTF_8));
                } catch (IOException e) { throw new UncheckedIOException(e); }
            }, DOCKER_PIPE_IO);
            while(!p.waitFor(50,TimeUnit.MILLISECONDS)) {
                if(cancelled.getAsBoolean())throw new Failure("cancelled","已停止本次SQL检查。");
                if(System.nanoTime()>deadline)throw new Failure("timeout","SQL执行超时，请缩小查询或重试。");
            }
            try {
                String response = output.get(2, TimeUnit.SECONDS);
                if (p.exitValue() == 0) written.get(2, TimeUnit.SECONDS);
                return new ProcessResult(p.exitValue(), response, error.get(2, TimeUnit.SECONDS));
            } catch (ExecutionException e){if(e.getCause() instanceof Failure f)throw f;throw e;}
        }catch(Failure e){throw e;}catch(Exception e){throw new Failure("environment_error","无法调用Docker或MySQL，请检查教学环境后重试。");}
        finally {if(p!=null&&p.isAlive())p.destroyForcibly();}
    }
    private static CompletableFuture<String> readOutput(InputStream stream, Process process, java.util.concurrent.atomic.AtomicInteger bytes) {
        return CompletableFuture.supplyAsync(() -> {
            try (var input = stream; var output = new ByteArrayOutputStream()) {
                var buffer = new byte[2048];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.addAndGet(count) > 65536) {
                        process.destroyForcibly();
                        throw new Failure("output_limit", "输出超过64KB，请减少返回数据。");
                    }
                    output.write(buffer, 0, count);
                }
                return output.toString(StandardCharsets.UTF_8);
            } catch (IOException e) {
                if (bytes.get() > 65536) throw new Failure("output_limit", "输出超过64KB，请减少返回数据。");
                throw new Failure("environment_error", "容器输出读取失败。");
            }
        }, DOCKER_PIPE_IO);
    }

    private String require(ProcessResult r){if(r.code()!=0)throw new Failure("environment_error","教学MySQL未就绪，请启动环境后重试。");return r.output();}
    private void owned() {
        var r=command(null,5,()->false,"inspect",container);
        if(r.code()==0)try {
            var info=tools.jackson.databind.json.JsonMapper.builder().build().readTree(r.output()).get(0);
            var labels = info.path("Config").path("Labels");
            boolean publicSandbox = "1".equals(labels.path("codesomething.public-mysql").asText()) &&
                scope.equals("codesomething.scope="+labels.path("codesomething.scope").asText()) &&
                info.path("HostConfig").path("ReadonlyRootfs").asBoolean() &&
                info.path("HostConfig").path("Memory").asLong() == 512L * 1024 * 1024 &&
                info.path("HostConfig").path("PidsLimit").asInt() == 64;
            if((!publicMode || publicSandbox)&&"1".equals(labels.path("codesomething.sql").asText())&&IMAGE.equals(info.path("Config").path("Image").asText())&&"none".equals(info.path("HostConfig").path("NetworkMode").asText())&&info.path("HostConfig").path("PortBindings").size()==0) {
                String id = info.path("Id").asText();
                if (id.matches("[a-f0-9]{64}")) {
                    ownedDisk = "1".equals(labels.path("codesomething.mysql-disk").asText())
                        && info.path("Mounts").valueStream().anyMatch(mount ->
                            "volume".equals(mount.path("Type").asText()) &&
                            "/var/lib/mysql".equals(mount.path("Destination").asText()));
                    ownedContainerId = id;
                    return;
                }
            }
        }catch(Exception ignored){}
        throw new Failure("environment_error","目标容器的标签、镜像或网络不匹配，已拒绝操作。");
    }
    private String root(String sql){return require(command(sql,8,()->false,"exec","-i",container,"mysql","--protocol=socket","-uroot","--batch","--default-character-set=utf8mb4","--binary-mode=1"));}
    public synchronized void start() {
        if (!publicMode) {
            startInternal();
        } else if (!pool.disk()) {
            synchronized (PUBLIC_START_LOCK) { startInternal(); }
        } else {
            try {
                PUBLIC_DISK_STARTS.acquire();
                try { startInternal(); }
                finally { PUBLIC_DISK_STARTS.release(); }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                state = "environment_error";
                message = "等待MySQL启动名额时被中断，请重试。";
            }
        }
    }

    // Keep the pool count and Docker launch atomic; MySQL initialization can overlap.
    private boolean launchContainer() {
        var found=command(null,5,()->false,"inspect","--format","{{.State.Running}}",container);
        boolean running = "true".equals(found.output().strip());
        boolean exists = found.code() == 0;
        if (publicMode && exists && (!running || Files.exists(restoreMarker()))) {
            owned();
            if (Files.exists(restoreMarker())) {
                if (running) require(command(null, 20, () -> false, "stop", "-t", "10", ownedContainerId));
                running = false;
                if (ownedDisk || !diskVolumePrefix.isEmpty()) {
                    require(command(null, 10, () -> false, "rm", "-v", ownedContainerId));
                    exists = false;
                }
            }
        }
        if (publicMode && !running) {
            if (pool.normal() == 0) throw new Failure("environment_error", "当前部署未启用常驻 MySQL 练习池。");
            for (var active = publicRunning(); active.size() >= pool.normal(); active = publicRunning()) {
                if (!reclaimOldest(active)) {
                    if (active.size() < pool.peak()) break;
                    throw new Failure("environment_error", "公网 MySQL 练习池已满，暂时没有可回收的闲置实例。");
                }
            }
            if ((!exists || !ownedDisk) && Files.exists(snapshotPath())) markRestore();
        }
        if(!exists) {
            var arguments=new ArrayList<>(List.of("run","-d","--pull=never","--name",container,"--label","codesomething.sql=1","--network","none","--memory","640m","--cpus","1","--pids-limit","256","--cap-drop","ALL","--cap-add","SETUID","--cap-add","SETGID","--cap-add","DAC_OVERRIDE","--security-opt","no-new-privileges","--mount","type=volume,source="+container+"-data,target=/var/lib/mysql","-e","MYSQL_ALLOW_EMPTY_PASSWORD=yes",IMAGE,"--skip-networking","--local-infile=0","--max-connections=20","--innodb-buffer-pool-size=64M","--performance-schema=OFF","--character-set-server=utf8mb4","--collation-server=utf8mb4_0900_ai_ci"));
            if (publicMode) {
                arguments = new ArrayList<>(List.of("run","-d","--pull=never","--name",container,
                    "--label=codesomething.sql=1","--label=codesomething.public-mysql=1","--label="+scope,"--network=none","--read-only",
                    "--memory=512m","--memory-swap=512m","--cpus=1","--pids-limit=64","--cap-drop=ALL",
                    "--security-opt=no-new-privileges","--user=999:999","--log-driver=none",
                    pool.disk() ? allocateDiskMount() :
                        "--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=256m,mode=1777",
                    "--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777",
                    "--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777",
                    "--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes","--env=MYSQL_ROOT_HOST=localhost",IMAGE,
                    "--skip-networking","--local-infile=0","--secure-file-priv=NULL","--max-connections=5",
                    "--innodb-buffer-pool-size=48M","--performance-schema=OFF","--character-set-server=utf8mb4"));
                if (pool.disk()) {
                    arguments.add(2, "--label=codesomething.mysql-disk=1");
                    arguments.add("--innodb-use-native-aio=OFF");
                }
            }
            if(school || publicMode)arguments.add("--skip-log-bin");
            require(command(null,20,()->false,arguments.toArray(String[]::new)));
        } else {owned();if(!running)require(command(null,10,()->false,"start",container));}
        return running;
    }

    private void startInternal() {
        state="starting";message="正在启动MySQL并准备示例数据…";
        try {
            boolean running;
            if (publicMode && pool.disk()) {
                synchronized (PUBLIC_START_LOCK) { running = launchContainer(); }
            } else {
                running = launchContainer();
            }
            owned();
            boolean ready=false;
            for(int i=0;i<90;i++) {try{
                var process=command(null,5,()->false,"exec",container,"cat","/proc/1/comm");
                if(!process.output().strip().equals("mysqld"))throw new Failure("environment_error","MySQL初始化中。");
                version=root("SELECT VERSION();").strip().replace("VERSION()\n","");ready=true;break;
            }catch(Failure e){try{Thread.sleep(500);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new Failure("environment_error","环境启动被中断。");}}}
            if(!ready)throw new Failure("environment_error","MySQL启动超时，请检查Docker后重试。");
            if (publicMode && !running && Files.exists(restoreMarker())) {
                try {
                    restoreSnapshot();
                    clearRestoreMarker();
                }
                catch (Failure failure) {
                    command(null, 20, () -> false, "stop", "-t", "10", ownedContainerId);
                    throw failure;
                }
            }
            if(school) {
                clearAbandonedExams();
                state="ready";message="课内练习库已就绪。";return;
            }
            root("CREATE DATABASE IF NOT EXISTS cs_practice CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'cs_practice'@'localhost'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE ON cs_practice.* TO 'cs_practice'@'localhost';");
            String tables=root("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='cs_practice' AND table_name='tasks';");
            if(tables.strip().endsWith("\n0"))root("USE cs_practice;"+course.seed(false));
            // Only this labelled, network-isolated instance is owned by this platform.
            for(String schema:root("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'cs_check_%';").lines().skip(1).toList())
                if(schema.matches("cs_check_[a-f0-9]{22}"))cleanup(schema);
            state="ready";message="教学MySQL已就绪；试运行使用cs_practice，正式检查使用独立临时库。";
        }catch(Failure e){state="environment_error";message=e.getMessage();}
    }
    private void ready(){if(!state.equals("ready"))throw new Failure("environment_error",message);owned();}

    public synchronized void prepareSchool(List<String> schemas,String seed,boolean reset) {
        if(!school||schemas.isEmpty()||schemas.stream().anyMatch(s->!s.matches("[a-z][a-z0-9_]{0,47}")||s.equals("mysql")||s.equals("sys")||s.endsWith("_schema")))
            throw new IllegalArgumentException("Invalid school schemas");
        if(!state.equals("ready") || !command(null,5,()->false,"inspect","--format","{{.State.Running}}",container).output().strip().equals("true"))start();
        ready();
        String primary=schemas.getFirst();
        if(!reset&&root("SELECT COUNT(*) FROM mysql.user WHERE user='school_student' AND host='localhost';").strip().endsWith("\n1"))return;
        for(String schema:schemas)root("DROP DATABASE IF EXISTS `"+schema+"`; CREATE DATABASE `"+schema+"` CHARACTER SET utf8mb4;");
        if(!seed.isBlank())root("USE `"+primary+"`;\n"+seed);
        root("CREATE USER IF NOT EXISTS 'school_student'@'localhost';");
        for(String schema:schemas)grantSchoolDatabase(schema);
    }

    public synchronized void grantSchoolDatabase(String schema) {
        if(!school || !schoolDatabaseName(schema) || Set.of("mysql","sys","information_schema","performance_schema")
                .contains(schema.toLowerCase(Locale.ROOT)) || schema.toLowerCase(Locale.ROOT).startsWith("cs_exam_"))
            throw new ApiException(HttpStatus.BAD_REQUEST,"SCHOOL_DATABASE_NAME","请输入以英文字母开头的库名，可包含数字和下划线，最多 64 个字符。MySQL 系统库保留。",Map.of());
        ready();
        grantSchoolSchema(schema);
    }

    private void grantSchoolSchema(String schema) {
        // Escape underscores because MySQL interprets them as wildcards in database grants.
        root("GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES,CREATE VIEW,SHOW VIEW,CREATE ROUTINE,ALTER ROUTINE,EXECUTE,TRIGGER,CREATE TEMPORARY TABLES ON `"
            +schema.replace("_","\\_")+"`.* TO 'school_student'@'localhost';");
    }

    public static boolean schoolDatabaseName(String name) {
        return name != null && name.matches("[A-Za-z][A-Za-z0-9_]{0,63}");
    }

    private void clearAbandonedExams() {
        var names = root("""
            SELECT LEFT(schema_name,31) FROM information_schema.schemata WHERE schema_name REGEXP '^cs_exam_[a-f0-9]{23}(_practice)?$'
            UNION SELECT user FROM mysql.user WHERE host='localhost' AND user REGEXP '^cs_exam_[a-f0-9]{23}$';
            """);
        for (String name : names.lines().skip(1).toList())
            if (name.matches("cs_exam_[a-f0-9]{23}")) {
                killExamConnections(name);
                dropExam(name);
            }
    }

    private String examRoot(String sql) {
        var result = command(sql, 8, () -> false, "exec", "-i", ownedContainerId, "mysql",
            "--protocol=socket", "-uroot", "--batch", "--default-character-set=utf8mb4", "--binary-mode=1");
        if (result.code() == 0) return result.output();
        var error = EXAM_ERROR.matcher(result.output());
        if (error.find() && !error.group().matches("ERROR (1045|2002|2003|2006|2013).*"))
            throw new Failure("result_error", "隔离 MySQL 无法准备或清理考题数据。");
        return require(result);
    }

    private void killExamConnections(String name) {
        var connections = examRoot("SELECT ID FROM information_schema.PROCESSLIST WHERE USER='" + name + "';");
        for (String id : connections.lines().skip(1).toList()) {
            if (!id.matches("[0-9]+")) continue;
            try { examRoot("KILL " + id + ";"); }
            catch (Failure ignored) { /* The client may have already disconnected. */ }
        }
    }

    private void dropExam(String name) { examRoot(examDrop(name)); }

    private static String examDrop(String name) {
        return "DROP DATABASE IF EXISTS " + name + "_practice; DROP DATABASE IF EXISTS " + name + "; DROP USER IF EXISTS '" + name + "'@'localhost';";
    }

    public record ExamOutput(String transcript, List<String> errors) {}
    private static final java.util.regex.Pattern EXAM_ERROR = java.util.regex.Pattern.compile("(?m)^ERROR [0-9]+[^\r\n]*");

    // Aliases are opt-in for the lab fixtures that exercise schema creation and cross-schema SQL.
    private static final Pattern LAB_SCHEMA_TOKEN = Pattern.compile(
        "(?is)'(?:[^'\\\\]|\\\\.|'')*'|\"(?:[^\"\\\\]|\\\\.|\"\")*\"|/\\*.*?\\*/|--[ \\t][^\\r\\n]*|#[^\\r\\n]*"
        + "|`(?:student_info_other|student_inf_xxxxxxxx|student_info)`|\\b(?:student_info_other|student_inf_xxxxxxxx|student_info)\\b");

    public final class ExamSession {
        private final String name;
        private final boolean labSchemas;
        private boolean interrupted;

        private ExamSession(String name, boolean labSchemas) {
            this.name = name;
            this.labSchemas = labSchemas;
        }

        private String resolveLabSchemas(String sql) {
            if (!labSchemas) return sql;
            return LAB_SCHEMA_TOKEN.matcher(sql).replaceAll(match -> switch (match.group().replace("`", "").toLowerCase(Locale.ROOT)) {
                case "student_info" -> name;
                case "student_info_other", "student_inf_xxxxxxxx" -> name + "_practice";
                default -> java.util.regex.Matcher.quoteReplacement(match.group());
            });
        }

        private String normalizeSandboxNames(String text) {
            return text.replace(name + "_practice", "lab_secondary").replace(name, "lab_sandbox");
        }

        public ExamOutput query(String sql, boolean force, boolean columnMetadata, boolean verbose) {
            var arguments = new ArrayList<>(List.of("exec", "-i", "--user=mysql", ownedContainerId, "mysql",
                "--no-defaults", "--protocol=socket", "-u" + name, "--database=" + name,
                "--default-character-set=utf8mb4", "--binary-mode=1", "--local-infile=0", "--skip-reconnect"));
            if (verbose) arguments.addAll(List.of("--comments", "-vvv"));
            // The XML client otherwise emits BIT values as raw control bytes.
            arguments.add("--binary-as-hex");
            arguments.add(columnMetadata ? "--column-type-info" : "--xml");
            if (force) arguments.add("--force");
            ProcessResult result;
            try {
                result = command(resolveLabSchemas(sql), 6, () -> false, true, arguments.toArray(String[]::new));
            } catch (Failure e) {
                interrupted = Set.of("timeout", "output_limit", "cancelled").contains(e.status);
                throw e;
            }
            var errors = EXAM_ERROR.matcher(result.error()).results().map(java.util.regex.MatchResult::group).toList();
            if (errors.stream().anyMatch(error -> error.matches("ERROR (1045|2002|2003|2006|2013).*"))
                    || result.code() != 0 && errors.isEmpty())
                throw new Failure("environment_error", "隔离 MySQL 不可用。");
            return new ExamOutput(normalizeSandboxNames(result.output()), errors.stream().map(this::normalizeSandboxNames).toList());
        }
    }

    public <T> T withSchoolExam(String seed, java.util.function.Function<ExamSession, T> operation) {
        return withSchoolExams(List.of(seed), sessions -> operation.apply(sessions.getFirst()));
    }

    public synchronized <T> T withSchoolExams(List<String> seeds, java.util.function.Function<List<ExamSession>, T> operation) {
        if (!school || seeds.isEmpty() || seeds.size() > 8) throw new IllegalArgumentException("Invalid school exam request");
        if (!state.equals("ready")) start();
        for (int attempt = 0; ; attempt++) {
            if (!state.equals("ready")) throw new Failure("environment_error", message);
            try {
                return runSchoolExams(seeds, operation);
            } catch (Failure e) {
                if (attempt != 0 || !e.status.equals("environment_error")) throw e;
                start();
            }
        }
    }

    private <T> T runSchoolExams(List<String> seeds, java.util.function.Function<List<ExamSession>, T> operation) {
        var sessions = new ArrayList<ExamSession>();
        var setup = new StringBuilder();
        for (String seed : seeds) {
            String name = "cs_exam_" + UUID.randomUUID().toString().replace("-", "").substring(0, 23);
            boolean labSchemas = seed.contains("-- lab-schema-aliases");
            var session = new ExamSession(name, labSchemas);
            sessions.add(session);
            setup.append("CREATE DATABASE ").append(name).append(" CHARACTER SET utf8mb4; CREATE USER '")
                .append(name).append("'@'localhost';")
                .append(" GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER,INDEX,REFERENCES,CREATE VIEW,SHOW VIEW,")
                .append("CREATE ROUTINE,ALTER ROUTINE,EXECUTE,TRIGGER,CREATE TEMPORARY TABLES ON `")
                .append(name.replace("_", "\\_")).append("`.* TO '").append(name).append("'@'localhost';")
                .append(labSchemas ? " GRANT SELECT,INSERT,CREATE ON `" : " GRANT CREATE ON `").append((name + "_practice").replace("_", "\\_"))
                .append("`.* TO '").append(name).append("'@'localhost'; USE ")
                .append(name).append(";\n")
                // Trusted fixtures can give the temporary learner ownership of a precreated routine or view.
                .append(session.resolveLabSchemas(seed).replace("{{sandboxUser}}", "'" + name + "'@'localhost'"))
                .append("\nDELIMITER ;\n;\n");
        }
        Throwable failure = null;
        try {
            examRoot(setup.toString());
            return operation.apply(List.copyOf(sessions));
        } catch (RuntimeException | Error e) {
            failure = e;
            throw e;
        } finally {
            try {
                try {
                    for (var session : sessions) if (session.interrupted) killExamConnections(session.name);
                } finally {
                    var cleanup = new StringBuilder();
                    for (var session : sessions) cleanup.append(examDrop(session.name));
                    examRoot(cleanup.toString());
                }
            } catch (Failure e) {
                if (failure == null) throw e;
                failure.addSuppressed(e);
            }
        }
    }

    public synchronized String schoolQuery(String schema,String sql) {
        if(!school||schema!=null&&!schoolDatabaseName(schema))throw new IllegalArgumentException("Invalid school query");
        ready();
        var args=new ArrayList<>(List.of("exec","-i","--user=mysql",container,"mysql","--no-defaults","--protocol=socket",
            "-uschool_student","--xml","--binary-as-hex","--default-character-set=utf8mb4","--binary-mode=1","--local-infile=0","--skip-reconnect"));
        if(schema!=null)args.add("--database="+schema);
        ProcessResult result;
        try {
            result=command(sql,6,()->false,args.toArray(String[]::new));
        } catch(Failure failure) {
            if(Set.of("timeout","output_limit").contains(failure.status)) {
                for(String id:root("SELECT ID FROM information_schema.PROCESSLIST WHERE USER='school_student';").lines().skip(1).toList())
                    if(id.matches("[0-9]+"))root("KILL "+id+";");
            }
            throw failure;
        }
        if(result.code()!=0) {
            String error=result.output().lines().filter(line->line.startsWith("ERROR ")).findFirst().orElse("课内 MySQL 连接失败。");
            String status=error.startsWith("ERROR 3024")?"timeout":error.startsWith("ERROR 2002")||error.startsWith("ERROR 1045")||!error.startsWith("ERROR ")?"environment_error":"sql_error";
            throw new Failure(status,error.substring(0,Math.min(error.length(),1500)));
        }
        return result.output();
    }
    public synchronized void reset(String target) {
        if(!PRACTICE.equals(target))throw new ApiException(HttpStatus.BAD_REQUEST,"RESET_TARGET_REJECTED","只允许重置cs_practice教学练习库。",Map.of());
        ready();
        // Build a replacement first; a failed seed leaves the existing practice tables intact.
        root("DROP DATABASE IF EXISTS cs_reset; CREATE DATABASE cs_reset CHARACTER SET utf8mb4; USE cs_reset;"+course.seed(false));
        String count=root("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cs_practice' AND table_name='tasks';");
        if(count.strip().endsWith("\n1"))root("DROP TABLE IF EXISTS cs_practice.tasks_backup; RENAME TABLE cs_practice.tasks TO cs_practice.tasks_backup,cs_reset.tasks TO cs_practice.tasks; DROP TABLE cs_practice.tasks_backup;");
        else root("RENAME TABLE cs_reset.tasks TO cs_practice.tasks;");
        root("DROP TABLE IF EXISTS cs_practice.bookmarks; DROP DATABASE cs_reset;");
    }
    public record Table(List<String> columns,List<List<String>> rows) {}
    public Table parse(String output) {
        var lines=output.stripTrailing().split("\\R",-1);
        if(output.isBlank())return new Table(List.of(),List.of());
        var columns=List.of(lines[0].split("\t",-1));var rows=new ArrayList<List<String>>();
        for(int i=1;i<lines.length;i++)rows.add(List.of(lines[i].split("\t",-1)));
        if(rows.size()>100)throw new Failure("output_limit","最多返回100行，请使用WHERE或LIMIT缩小结果。");
        return new Table(columns,rows);
    }
    private Table execute(String schema,String sql,BooleanSupplier cancelled){
        ProcessResult r;
        try {r=command("SET SESSION max_execution_time=1500; SET SESSION sql_select_limit=101;"+sql,5,cancelled,"exec","-i",container,"mysql","--protocol=socket","-u"+schema,"--database="+schema,"--batch","--default-character-set=utf8mb4","--binary-mode=1");}
        catch(Failure failure) {
            if(Set.of("timeout","cancelled","output_limit").contains(failure.status)) {
                for(String connection:root("SELECT ID FROM information_schema.PROCESSLIST WHERE USER='"+schema+"';").lines().skip(1).toList())
                    if(connection.matches("[0-9]+"))root("KILL "+connection+";");
            }
            throw failure;
        }
        if(r.code()!=0) {
            if(r.output().contains("ERROR 3024"))throw new Failure("timeout","查询超过1.5秒限制，请缩小结果。");
            if(r.output().contains("ERROR 2002")||r.output().contains("ERROR 1045")||r.output().contains("No such container")||r.output().contains("not running"))throw new Failure("environment_error","MySQL连接失败，请重新启动环境。");
            String detail=r.output().replaceAll("cs_check_[a-f0-9]{22}","检查库");
            throw new Failure("sql_error",detail.substring(0,Math.min(detail.length(),1500)));
        }
        return parse(r.output());
    }
    private void cleanup(String schema){if(!schema.matches("cs_check_[a-f0-9]{22}"))throw new IllegalArgumentException();root("DROP DATABASE IF EXISTS "+schema+"; DROP USER IF EXISTS '"+schema+"'@'localhost';");}
    public synchronized Table practice(String sql,BooleanSupplier cancelled){ready();return execute(PRACTICE,sql,cancelled);}
    public record Assertion(String name,boolean passed,Table expected,Table actual) {}
    public record Outcome(String status,List<Assertion> assertions,Table result,String message,String seedDigest) {}
    public synchronized Outcome check(String id,String stage,String sql,BooleanSupplier cancelled) {
        ready();var assertions=new ArrayList<Assertion>();Table result=null;
        boolean multiple=Set.of("sql-read","sql-page").contains(stage);
        for(int variant=0;variant<(multiple?2:1);variant++) {
            String schema="cs_check_"+UUID.randomUUID().toString().replace("-","").substring(0,22);
            try {
                if(cancelled.getAsBoolean())throw new Failure("cancelled","检查已取消。");
                root("CREATE DATABASE "+schema+" CHARACTER SET utf8mb4; CREATE USER '"+schema+"'@'localhost'; GRANT SELECT,INSERT,UPDATE,DELETE,CREATE ON "+schema+".* TO '"+schema+"'@'localhost';");
                if(!Set.of("db-model","sql-transfer").contains(stage))root("USE "+schema+";"+course.seed(variant==1));
                result=execute(schema,sql,cancelled);
                Table actual=result,expected;
                switch(stage) {
                    case "db-connect"->expected=new Table(List.of("connected","current_database"),List.of(List.of("1",schema)));
                    case "db-model"->{
                        actual=structure(schema,"tasks","completed");expected=expectedStructure("completed");
                    }
                    case "sql-read"->expected=variant==0?table(List.of("id","title"),new String[][]{{"1","学习HTTP"},{"3","练习SQL"},{"5","编写接口"},{"6","完成分页"}}):table(List.of("id","title"),new String[][]{{"4","新任务四"},{"7","新任务七"},{"8","新任务八"},{"12","新任务十二"}});
                    case "sql-write"->{actual=execute(schema,"SELECT id,title,completed FROM tasks ORDER BY id;",cancelled);expected=table(List.of("id","title","completed"),new String[][]{{"1","学习HTTP","1"},{"3","练习SQL","0"},{"4","复习JSON","1"},{"5","编写接口","0"},{"6","完成分页","0"},{"9","整理笔记","0"}});}
                    case "sql-page"->expected=variant==0?table(List.of("id","title","completed"),new String[][]{{"5","编写接口","0"},{"6","完成分页","0"}}):table(List.of("id","title","completed"),new String[][]{{"8","新任务八","0"},{"12","新任务十二","0"}});
                    default->{
                        var schemaActual=structure(schema,"bookmarks","saved");
                        assertions.add(new Assertion("书签表约束",expectedStructure("saved").equals(schemaActual),expectedStructure("saved"),schemaActual));
                        var data=execute(schema,"SELECT id,title,saved FROM bookmarks ORDER BY id;",cancelled);
                        var expectedData=table(List.of("id","title","saved"),new String[][]{{"1","Java文档","1"},{"3","接口笔记","0"}});
                        assertions.add(new Assertion("迁移后的全部数据",expectedData.equals(data),expectedData,data));
                        expected=table(List.of("id","title"),new String[][]{{"3","接口笔记"}});
                    }
                }
                assertions.add(new Assertion(variant==0?"目标行为":"另一组数据",expected.equals(actual),expected,actual));
            } finally {cleanup(schema);}
        }
        boolean passed=assertions.stream().allMatch(Assertion::passed);
        return new Outcome(passed?"passed":"business_error",assertions,result,passed?"功能检查通过，可以完成本关编码；概念巩固可选。":"SQL可以执行，但结果未符合约定，请对照预期与实际。",digest(course.seed(false)+course.seed(true)));
    }
    private Table structure(String schema,String table,String flag){return parse(root("SELECT column_name,column_type,is_nullable,column_key,COALESCE(column_default,'NULL') AS default_value FROM information_schema.columns WHERE table_schema='"+schema+"' AND table_name='"+table+"' ORDER BY ordinal_position;"));}
    private Table expectedStructure(String flag){return table(List.of("COLUMN_NAME","COLUMN_TYPE","IS_NULLABLE","COLUMN_KEY","default_value"),new String[][]{{"id","int","NO","PRI","NULL"},{"title","varchar(100)","NO","","NULL"},{flag,"tinyint(1)","NO","","0"}});}
    private Table table(List<String> columns,String[][] rows){return new Table(columns,Arrays.stream(rows).map(r->List.of(r)).toList());}
}

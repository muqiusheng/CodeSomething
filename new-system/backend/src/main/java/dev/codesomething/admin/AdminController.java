package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.auth.*;
import dev.codesomething.storage.LearningDataSource;
import dev.codesomething.profile.LearnerController;
import dev.codesomething.school.AdminSchoolService;
import dev.codesomething.tutor.TutorController;
import dev.codesomething.sql.SqlLearningController;
import dev.codesomething.sql.MysqlEnvironment;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="cs.public",havingValue="true")
@RequestMapping("/api/v1/admin")
public class AdminController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> PENDING = Set.of("queued", "running", "cancelling", "awaiting_runner");
    private static final Set<String> GRADED = Set.of("passed", "compile_error", "business_error", "sql_error");
    private static final Set<String> ERRORS = Set.of(
        "compile_error", "business_error", "timed_out", "timeout", "environment_error", "sql_error", "output_limit", "cleanup_failed");
    private static final String USER_COLUMNS = "id,username,email,role,status,created_at,last_seen_at,password_change_required,completed_count AS completed";
    private final LearningDataSource storage;
    private final JdbcTemplate accounts;
    private final AuthService auth;
    private final RunnerInventory runners;
    private final AdminSchoolService school;
    private final LearnerController learner;
    private final TutorController tutor;
    private final SqlLearningController sql;
    private final JsonMapper json;
    private final AdminIndex index;
    private final AdminJobRetry retries;
    private final AdminReportExports exports;
    private final AdminLearningAnalytics analytics;
    private final AdminSnapshotPruner snapshots;
    private final MysqlEnvironment mysqlEnvironment;

    AdminController(LearningDataSource storage, AuthService auth, RunnerInventory runners, AdminSchoolService school,
                    LearnerController learner, TutorController tutor, SqlLearningController sql, JsonMapper json, AdminIndex index, AdminJobRetry retries, AdminReportExports exports,
                    AdminLearningAnalytics analytics, AdminSnapshotPruner snapshots, MysqlEnvironment mysqlEnvironment) {
        this.storage=storage;this.accounts=new JdbcTemplate(storage.primary());this.auth=auth;this.runners=runners;
        this.school=school;this.learner=learner;this.tutor=tutor;this.sql=sql;this.json=json;this.index=index;this.retries=retries;this.exports=exports;
        this.analytics=analytics;
        this.snapshots=snapshots;
        this.mysqlEnvironment=mysqlEnvironment;
    }

    record Page(List<Map<String,Object>> items,int page,int size,int total) {}
    record AccountStatus(String status) {}
    record Role(String role) {}
    record Password(String newPassword) {}
    record Invite(int maxUses,int hours,String note) {}

    @GetMapping("/users")
    Page users(@RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int size,
               @RequestParam(defaultValue="") String keyword, @RequestParam(defaultValue="") String role,
               @RequestParam(defaultValue="") String status,@RequestParam(defaultValue="registered") String sort,
               @RequestParam(defaultValue="") String window) {
        page(page,size);
        if (keyword.length()>254) throw ApiException.invalid("keyword", "检索词过长。");
        String where = """
            FROM users WHERE deleted_at IS NULL
                AND (?='' OR instr(lower(username),lower(?))>0 OR instr(lower(coalesce(email,'')),lower(?))>0)
                AND (?='' OR role=?) AND (?='' OR status=?)
                AND (?='' OR (?='new-today' AND created_at>=?) OR (?<>'new-today' AND
                    EXISTS(SELECT 1 FROM user_activity_hourly a WHERE a.user_id=users.id AND a.hour>=?)))
            """;
        int days=switch(window) {
            case "", "new-today", "active-today" -> 0;
            case "active-7" -> 6;
            case "active-30" -> 29;
            default -> throw ApiException.invalid("window","请选择有效时段。");
        };
        String since=LocalDate.now(ZONE).minusDays(days).atStartOfDay(ZONE).toInstant().toString();
        var args=List.of(keyword,keyword,keyword,role,role,status,status,window,window,since.substring(0,19),window,since);
        int total=accounts.queryForObject("SELECT count(*) "+where,Integer.class,args.toArray());
        String order=switch(sort) {
            case "registered" -> "created_at DESC";
            case "active" -> "last_seen_at DESC";
            case "school" -> "schoolCompleted DESC";
            case "outside" -> "completed DESC";
            default -> throw ApiException.invalid("sort","请选择有效排序方式。");
        };
        var rowArgs=new ArrayList<Object>();
        rowArgs.add(analytics.required());
        rowArgs.addAll(args);
        rowArgs.add(size);
        rowArgs.add((page-1L)*size);
        var rows=accounts.queryForList("SELECT "+USER_COLUMNS+", "+"""
            coalesce((SELECT sum(required_completed) FROM admin_school_lab_index WHERE user_id=users.id),0) AS schoolCompleted,
            CASE WHEN role='ROLE_STUDENT' THEN ? ELSE 0 END AS schoolRequired,
            (SELECT count(*) FROM admin_school_exam_index WHERE user_id=users.id AND mode='exam') AS examCount,
            (SELECT max(score) FROM admin_school_exam_index WHERE user_id=users.id AND mode='exam' AND complete_grading=1) AS examBestScore,
            (SELECT score FROM admin_school_exam_index WHERE user_id=users.id AND mode='exam' ORDER BY submitted_at DESC,id DESC LIMIT 1) AS examRecentScore,
            (SELECT count(*) FROM admin_bookmark_index WHERE user_id=users.id) AS bookmarkCount
            """+where+" ORDER BY "+order+", id LIMIT ? OFFSET ?",
            rowArgs.toArray());
        return new Page(rows,page,size,total);
    }

    @GetMapping("/users/{id}")
    Map<String,Object> profile(@PathVariable String id,HttpServletRequest request) {
        var actor=actor(request);
        var user=auth.requireAccount(id);
        audit(actor,"profile_viewed","user",id,"",request);
        var result=new LinkedHashMap<String,Object>();
        result.put("user",user);
        result.put("account",accounts.queryForMap("SELECT "+USER_COLUMNS+" FROM users WHERE id=?",id));
        result.put("school","ROLE_STUDENT".equals(user.role())?analytics.userLabs(id):List.of());
        result.put("exams",examAttempts(id,"","",1,20).items());
        result.put("mistakes",analytics.mistakes(id));
        result.put("bookmarks",accounts.queryForList("""
            SELECT category,count(*) AS count FROM admin_bookmark_index WHERE user_id=? GROUP BY category
            """,id));
        result.put("profile",Map.of());
        if (!storage.exists(id)) return result;
        try (var scope=LearningDataSource.asOwner(id)) {
            result.put("profile",learner.profile());
            return result;
        }
    }

    @GetMapping("/users/{id}/summary")
    Map<String,String> userSummary(@PathVariable String id) {
        return Map.of("username",auth.requireAccount(id).username());
    }

    @PatchMapping("/users/{id}/status")
    Map<String,Boolean> status(@PathVariable String id,@RequestBody AccountStatus input,HttpServletRequest request) {
        auth.updateAccount(actor(request),id,"status",input.status(),request.getRemoteAddr());
        if ("disabled".equals(input.status())) stopLearningJobs(id);
        return Map.of("success",true);
    }

    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteUser(@PathVariable String id, HttpServletRequest request) {
        auth.deleteAccount(actor(request), id, request.getRemoteAddr(), () -> stopLearningJobs(id));
    }

    private void stopLearningJobs(String id) {
        if (!storage.exists(id)) return;
        storage.inLearningTransaction(id, learning -> {
            for (String statement:List.of(
                "UPDATE check_jobs SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END WHERE status IN ('queued','running','awaiting_runner')",
                "UPDATE sql_attempts SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END WHERE status IN ('queued','running')",
                "UPDATE tutor_requests SET status='cancelling',revision=revision+1 WHERE status IN ('queued','running')",
                "UPDATE project_drafts SET status='failed' WHERE status IN ('generating','validating')",
                "UPDATE portfolio_checks SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END WHERE status IN ('queued','running')",
                "UPDATE generated_attempts SET status='cancelled' WHERE status IN ('queued','running')")) learning.update(statement);
            return null;
        });
    }

    @PatchMapping("/users/{id}/role")
    Map<String,Boolean> role(@PathVariable String id,@RequestBody Role input,HttpServletRequest request) {
        auth.updateAccount(actor(request),id,"role",input.role(),request.getRemoteAddr());
        if ("ROLE_ADMIN".equals(input.role())) stopLearningJobs(id);
        return Map.of("success",true);
    }

    @PostMapping("/users/{id}/reset-password")
    Map<String,String> reset(@PathVariable String id,@RequestBody(required=false) Password input,HttpServletRequest request) {
        return Map.of("temporaryPassword",auth.resetPassword(actor(request),id,input==null?null:input.newPassword(),request.getRemoteAddr()));
    }

    @GetMapping("/invitations")
    List<Map<String,Object>> invites(@RequestParam(defaultValue="") String status) {
        var rows=accounts.queryForList("""
            WITH invitations AS (
                SELECT substr(code,1,12) AS id,code,note,max_uses,used_count,expires_at,
                    CASE WHEN status<>'active' THEN 'revoked' WHEN used_count>=max_uses THEN 'used'
                         WHEN expires_at<=? THEN 'expired' ELSE 'active' END AS status
                FROM invitation_codes
            )
            SELECT id,note,max_uses,used_count,expires_at,status,
                (SELECT json_group_array(u.username) FROM invitation_registrations r JOIN users u ON u.id=r.user_id
                 WHERE r.code=invitations.code AND u.deleted_at IS NULL) AS registered
            FROM invitations WHERE (?='' OR status=?) ORDER BY expires_at DESC,id LIMIT 100
            """,Instant.now().getEpochSecond(),status,status);
        rows.forEach(row->row.put("registered",json.readValue((String)row.get("registered"),String[].class)));
        return rows;
    }

    @PostMapping("/invitations")
    Map<String,String> invite(@RequestBody Invite input,HttpServletRequest request) {
        return Map.of("code",auth.invite(actor(request),input.maxUses(),input.hours(),input.note(),request.getRemoteAddr()));
    }

    @DeleteMapping("/invitations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeInvite(@PathVariable String id,HttpServletRequest request) {
        auth.revokeInvitation(actor(request),id,request.getRemoteAddr());
    }

    @GetMapping("/analytics/overview")
    Map<String,Object> overview() {
        return accounts.execute((ConnectionCallback<Map<String,Object>>) connection ->
            overview(new JdbcTemplate(new SingleConnectionDataSource(connection,true))));
    }

    private Map<String,Object> overview(JdbcTemplate db) {
        int administrators=count(db,"SELECT count(*) FROM users WHERE role='ROLE_ADMIN' AND deleted_at IS NULL");
        long submissions=db.queryForObject("SELECT count(*) FROM admin_submission_index", Long.class);
        long passed=0,pending=0,graded=0;
        var errors=new TreeMap<String,Long>();
        for (var row:db.queryForList("SELECT status,count(*) AS n FROM admin_job_index GROUP BY status")) {
            String status=(String)row.get("status");long n=((Number)row.get("n")).longValue();
            if ("passed".equals(status)) passed+=n;
            if (GRADED.contains(status)) graded+=n;
            if (PENDING.contains(status)) pending+=n;
            if (ERRORS.contains(status)) errors.put(status,n);
        }
        var result=new LinkedHashMap<String,Object>();
        result.putAll(analytics.overview(db));
        result.put("administrators",administrators);result.put("submissions",submissions);
        result.put("passed",passed);result.put("graded",graded);result.put("pending",pending);
        result.put("passRate",graded==0?null:(double)passed/graded);result.put("errors",errors);
        return result;
    }

    @GetMapping("/analytics/activity-timeline")
    List<Map<String,Object>> activity(@RequestParam(defaultValue="24") int hours) {
        return analytics.timeline(hours);
    }

    @GetMapping("/jobs")
    Page jobs(@RequestParam(defaultValue="") String status,@RequestParam(defaultValue="") String userId,
              @RequestParam(defaultValue="") String courseId,@RequestParam(defaultValue="") String keyword,
              @RequestParam(defaultValue="") String from,@RequestParam(defaultValue="") String to,
              @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        page(page,size);
        if (keyword.length()>254) throw ApiException.invalid("keyword","检索词过长。");
        var args = new ArrayList<Object>();
        var where = new StringBuilder(" FROM admin_job_index j JOIN users u ON u.id=j.user_id WHERE 1=1");
        if ("pending".equals(status)) where.append(" AND j.status IN ('queued','running','cancelling','awaiting_runner')");
        else jobFilter(where,args," AND j.status=?",status);
        jobFilter(where,args," AND j.user_id=?",userId);
        jobFilter(where,args," AND j.course_id=?",courseId);
        jobFilter(where,args," AND j.created_at>=?",dateBoundary(from,false));
        jobFilter(where,args," AND j.created_at<?",dateBoundary(to,true));
        if (!from.isBlank() && !to.isBlank() && from.compareTo(to)>0)
            throw ApiException.invalid("to","结束日期不能早于开始日期。");
        if (!keyword.isEmpty()) {
            where.append(" AND (instr(lower(j.id),lower(?))=1 OR instr(lower(j.submission_id),lower(?))=1"
                +" OR (u.deleted_at IS NULL AND instr(lower(u.username),lower(?))>0))");
            args.addAll(List.of(keyword,keyword,keyword));
        }
        int total=accounts.queryForObject("SELECT count(*)"+where,Integer.class,args.toArray());
        args.add(size);
        args.add((page-1L)*size);
        var rows=accounts.queryForList("SELECT j.*,CASE WHEN u.deleted_at IS NULL THEN u.username ELSE '已删除账号' END AS username,u.status AS user_status"+where
            +" ORDER BY j.created_at DESC,j.id,j.user_id,j.kind LIMIT ? OFFSET ?",args.toArray());
        rows.forEach(row -> row.put("pruned", row.get("snapshot_pruned_at") != null));
        return new Page(rows,page,size,total);
    }

    private static void jobFilter(StringBuilder where,List<Object> args,String condition,String value) {
        if (value.isBlank()) return;
        where.append(condition);
        args.add(value);
    }

    private static String dateBoundary(String value,boolean inclusiveEnd) {
        if (value.isBlank()) return "";
        try {
            var instant = LocalDate.parse(value).plusDays(inclusiveEnd?1:0).atStartOfDay(ZONE).toInstant().toString();
            return instant.substring(0,instant.length()-1);
        } catch (java.time.DateTimeException error) {
            throw ApiException.invalid("date","请选择有效日期。");
        }
    }

    private record JobLocation(String owner,String kind) {}

    private JobLocation locateJob(String id,String userId) {
        var locations=accounts.query("""
            SELECT user_id,kind FROM admin_job_index WHERE id=? AND (?='' OR user_id=?) ORDER BY user_id,kind LIMIT 1
            """,(row,n)->new JobLocation(row.getString(1),row.getString(2)),id,userId,userId);
        if (locations.isEmpty()) throw missingJob();
        return locations.getFirst();
    }

    private JdbcTemplate indexedLearning(JobLocation job) {
        if (!storage.exists(job.owner()))
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"JOB_DATABASE_UNAVAILABLE","作业所属学习库暂时不可用。",Map.of());
        return storage.learning(job.owner());
    }

    @GetMapping("/jobs/{id}")
    Map<String,Object> job(@PathVariable String id,@RequestParam(defaultValue="") String userId,HttpServletRequest request) {
        var job=locateJob(id,userId);
        var learning=indexedLearning(job);
        var rows=learning.queryForList(switch(job.kind()) {
            case "portfolio" -> """
                SELECT id,status,created_at,id AS submission_id,'portfolio' AS course_id,phase AS stage_id,digest,files AS source,report,snapshot_pruned_at
                FROM portfolio_checks WHERE id=?
                """;
            case "sql" -> """
                SELECT id,status,created_at,finished_at,id AS submission_id,'sql-foundations' AS course_id,stage_id,digest,source,report,snapshot_pruned_at
                FROM sql_attempts WHERE id=?
                """;
            default -> """
                SELECT j.id,j.status,j.created_at,j.finished_at,j.report,s.id AS submission_id,s.course_id,s.stage_id,s.digest,
                    CASE WHEN j.snapshot_pruned_at IS NULL THEN s.source END AS source,j.snapshot_pruned_at
                FROM check_jobs j JOIN submissions s ON j.submission_id=s.id WHERE j.id=?
                """;
        },id);
        if (rows.isEmpty()) throw missingJob();
        var row=rows.getFirst();
        row.put("pruned", row.get("snapshot_pruned_at") != null);
        row.put("user_id",job.owner());
        accounts.queryForList("""
            SELECT CASE WHEN deleted_at IS NULL THEN username ELSE '已删除账号' END AS username,status AS user_status
            FROM users WHERE id=?
            """,job.owner()).stream().findFirst().ifPresent(row::putAll);
        if (row.get("source") instanceof byte[] source) row.put("source",new String(source,StandardCharsets.UTF_8));
        if (row.get("report") instanceof String report) row.put("report",json.readTree(report));
        audit(actor(request),"snapshot_viewed","job",id,job.owner(),request);
        return row;
    }

    record SnapshotPruneInput(String scope) {}

    @GetMapping("/jobs/snapshot-retention")
    Map<String, Integer> snapshotRetention() {
        return Map.of("retentionHours", snapshots.retentionHours());
    }

    @PostMapping("/jobs/prune-snapshots")
    AdminSnapshotPruner.Result pruneSnapshots(@RequestBody(required=false) SnapshotPruneInput input,
            @RequestParam(defaultValue="expired") String scope, HttpServletRequest request) {
        String selected = input != null && input.scope() != null ? input.scope() : scope;
        if (!Set.of("expired", "all").contains(selected)) throw ApiException.invalid("scope", "请选择有效的快照清理范围。");
        var result = snapshots.prune("all".equals(selected));
        audit(actor(request), "snapshots_pruned", "job", null,
              selected + " · " + result.prunedJobs() + " · " + result.freedBytes(), request);
        return result;
    }

    @PostMapping("/jobs/{id}/kill")
    Map<String,Boolean> kill(@PathVariable String id,@RequestParam(defaultValue="") String userId,HttpServletRequest request) {
        var job=locateJob(id,userId);
        int updated=cancelContainerJob(job,id);
        if (updated==0) throw new ApiException(HttpStatus.CONFLICT,"JOB_NOT_RUNNING","该作业已结束或正在停止。",Map.of());
        audit(actor(request),"job_cancelled","job",id,job.owner(),request);
        return Map.of("success",true);
    }

    private int cancelContainerJob(JobLocation job,String id) {
        var learning=indexedLearning(job);
        return switch(job.kind()) {
            case "portfolio" -> learning.update("""
                UPDATE portfolio_checks SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END
                WHERE id=? AND status IN ('queued','running')
                """,id);
            case "sql" -> learning.update("""
                UPDATE sql_attempts SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END,
                    finished_at=CASE WHEN status='running' THEN finished_at ELSE ? END
                WHERE id=? AND status IN ('queued','running')
                """,Instant.now().toString(),id);
            case "generated" -> learning.update("""
                UPDATE generated_attempts SET status='cancelled' WHERE id=? AND status IN ('queued','running')
                """,id);
            default -> learning.update("""
                UPDATE check_jobs SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END,
                    finished_at=CASE WHEN status='running' THEN finished_at ELSE ? END
                WHERE id=? AND status IN ('queued','running','awaiting_runner')
                """,Instant.now().toString(),id);
        };
    }

    @PostMapping("/jobs/{id}/retry")
    ResponseEntity<AdminJobRetry.Result> retry(@PathVariable String id,@RequestParam(defaultValue="") String userId,HttpServletRequest request) {
        var job=locateJob(id,userId);
        var result=retries.retry(job.owner(),job.kind(),id);
        if (result.created()) audit(actor(request),"job_retried","job",id,result.id(),request);
        return ResponseEntity.accepted().body(result);
    }

    @GetMapping("/system/health")
    Map<String,Object> health() {
        var disk=index.disk();
        int tutorErrors=accounts.queryForObject("SELECT count(*) FROM admin_tutor_error_index WHERE created_at>=?",
            Integer.class,Instant.now().minus(24,ChronoUnit.HOURS).toString());
        var tutorHealth=new LinkedHashMap<String,Object>(tutor.connection());
        tutorHealth.put("recentErrors",tutorErrors);
        var pool=sql.publicPoolSettings();
        return Map.of("docker",index.docker(),"database",Map.of("bytes",disk.bytes(),"walBytes",disk.walBytes(),
            "journalMode",accounts.queryForObject("PRAGMA journal_mode",String.class)),
            "diskFreeBytes",freeSpace(storage.database("admin")),"tutor",tutorHealth,"mysqlPoolLimit",pool.peak(),
            "mysqlPool",Map.of("active",index.mysqlActive(),"normal",pool.normal(),"peak",pool.peak(),"idleMinutes",sql.publicPoolIdleMinutes()));
    }

    @PostMapping("/system/tutor-probe")
    Map<String,String> tutorProbe(HttpServletRequest request) {
        var status=tutor.connect();
        audit(actor(request),"tutor_probed","tutor",null,status.get("status"),request);
        return status;
    }

    @GetMapping("/system/containers")
    List<Map<String,Object>> containers() {
        var users = containerUsers();
        var mysql = mysqlOwners(List.copyOf(users.keySet()));
        return runners.containers().stream().map(container -> {
            var row = new LinkedHashMap<String,Object>();
            boolean practice = "mysql".equals(container.kind());
            boolean running = "running".equals(container.state());
            var job = practice ? null : containerJob(container);
            String owner = practice ? mysql.get(container.name()) : users.containsKey(container.ownerId())
                ? container.ownerId() : job == null ? null : job.owner();
            var activity = practice && running ? mysqlEnvironment.publicActivity(container.name()) : null;
            boolean busy = activity != null && activity.busy();
            boolean releasable = practice ? !busy && (running || stopped(container)) : job != null || stopped(container);
            row.put("id",container.id());row.put("name",container.name());row.put("state",container.state());
            row.put("status",container.status());row.put("kind",practice ? "mysql" : "check");
            row.put("jobId",job != null ? container.jobId() : "");
            row.put("jobIndexed",job != null && !"generated".equals(job.kind()));
            row.put("userId",owner);row.put("username",users.get(owner));
            row.put("purpose",containerPurpose(container, job));
            row.put("idleSeconds",activity == null ? null : activity.idleSeconds());
            row.put("lastActiveAt",activity == null ? null : activity.lastActiveAt().toString());
            row.put("busy",busy);row.put("releasable",releasable);row.put("reclaimable",releasable);
            return (Map<String,Object>)row;
        }).toList();
    }

    private Map<String,String> containerUsers() {
        var users = new HashMap<String,String>();
        accounts.queryForList("SELECT id,CASE WHEN deleted_at IS NULL THEN username ELSE '已删除账号' END AS username FROM users")
            .forEach(row -> users.put((String)row.get("id"), (String)row.get("username")));
        return users;
    }

    private Map<String,String> mysqlOwners(List<String> ids) {
        var names=school.schoolContainerOwners(ids);
        ids.forEach(id->names.put(sql.publicContainer(id),id));
        return names;
    }

    private JobLocation containerJob(RunnerInventory.Container container) {
        boolean generated = "generated".equals(container.kind());
        String kind = generated ? "generated" : container.name().startsWith("cs-r8-") ? "portfolio" : "check";
        String table = generated ? "generated_attempts" : "portfolio".equals(kind) ? "portfolio_checks" : "check_jobs";
        if (!container.ownerId().isBlank() && containerUsersContains(container.ownerId())
            && ownsContainerJob(container.ownerId(), table, container.jobId()))
            return new JobLocation(container.ownerId(), kind);
        if (!generated) {
            var owners = accounts.queryForList("SELECT user_id FROM admin_job_index WHERE kind=? AND id=?",
                String.class, kind, container.jobId());
            if (owners.size() == 1) return new JobLocation(owners.getFirst(), kind);
            if (owners.size() > 1) return null;
        }
        // Older containers lack an owner label, and a new job can start before its index entry is projected.
        var matched = storage.owners(false).stream().filter(owner -> ownsContainerJob(owner, table, container.jobId())).limit(2).toList();
        return matched.size() == 1 ? new JobLocation(matched.getFirst(), kind) : null;
    }

    private boolean containerUsersContains(String owner) {
        return Boolean.TRUE.equals(accounts.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE id=?)", Boolean.class, owner));
    }

    private boolean ownsContainerJob(String owner, String table, String id) {
        return storage.exists(owner) && Boolean.TRUE.equals(storage.learning(owner).queryForObject(
            "SELECT EXISTS(SELECT 1 FROM " + table + " WHERE id=?)", Boolean.class, id));
    }

    private String containerPurpose(RunnerInventory.Container container, JobLocation job) {
        String name = container.name();
        if ("mysql".equals(container.kind())) return name.startsWith("cs-sql-school-") ? "课内实验 MySQL" : "SQL 练习 MySQL";
        if (name.startsWith("cs-r8-")) return "作品评测";
        if (name.startsWith("cs-r6-")) return "兴趣项目评测";
        if (name.startsWith("cs-r23-")) return "Java 评测";
        if (job == null) return "Spring Boot 评测";
        var courses = indexedLearning(job).queryForList("""
            SELECT s.course_id FROM check_jobs j JOIN submissions s ON s.id=j.submission_id WHERE j.id=?
            """, String.class, container.jobId());
        return switch (courses.isEmpty() ? "" : courses.getFirst()) {
            case "task-manager" -> "项目 A 评测";
            case "collaboration" -> "项目 B 评测";
            default -> "Spring Boot 评测";
        };
    }

    @PostMapping("/system/containers/{id}/reclaim")
    Map<String,Boolean> reclaim(@PathVariable String id, @RequestParam(defaultValue="false") boolean force, HttpServletRequest request) {
        var container=runners.containers().stream().filter(c->c.id().equals(id) || c.id().startsWith(id) && id.matches("[0-9a-f]{12,64}")).findFirst()
            .orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"CONTAINER_NOT_FOUND","容器已退出管理范围。",Map.of()));
        var users = containerUsers();
        String owner;
        if ("mysql".equals(container.kind())) {
            owner = mysqlOwners(List.copyOf(users.keySet())).get(container.name());
            try {
                if (!mysqlEnvironment.releasePublic(container.name(), container.id(), force))
                    throw new ApiException(HttpStatus.CONFLICT,"CONTAINER_BUSY","学员正在执行 SQL 或判分，请等本次操作结束后再释放。",Map.of());
            } catch (MysqlEnvironment.Failure failure) {
                throw new ApiException(HttpStatus.CONFLICT,"CONTAINER_RELEASE_FAILED",failure.getMessage(),Map.of());
            }
        } else {
            var job = containerJob(container);
            owner = job == null ? container.ownerId() : job.owner();
            if (job == null && !stopped(container))
                throw new ApiException(HttpStatus.CONFLICT,"CONTAINER_IN_USE","暂时无法确认关联作业，请稍后再试。",Map.of());
            if (job != null) cancelContainerJob(job, container.jobId());
            runners.releaseCheck(container);
        }
        audit(actor(request),"container_released","container",container.name(),Objects.toString(users.get(owner),"未知使用者"),request);
        return Map.of("success",true);
    }

    private static boolean stopped(RunnerInventory.Container container) {
        return Set.of("exited","dead","created").contains(container.state());
    }

    @PostMapping("/system/prune-containers")
    Map<String,Integer> prune(HttpServletRequest request) {
        int removed=0;
        var actor=actor(request);
        var containers=runners.containers();
        var ownedMysql=mysqlOwners(List.copyOf(containerUsers().keySet()));
        for (var container:containers) {
            boolean orphan=container.kind().equals("mysql") ? !ownedMysql.containsKey(container.name()) && stopped(container) : !liveJob(container);
            if (!orphan) continue;
            runners.remove(container);
            audit(actor,"container_pruned","container",container.name(),container.kind(),request);
            removed++;
        }
        return Map.of("removed",removed);
    }

    @GetMapping("/audit")
    Page audit(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="30") int size,
               @RequestParam(defaultValue="") String action,@RequestParam(defaultValue="") String operator,
               @RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="") String from,
               @RequestParam(defaultValue="") String to) {
        page(page,size);
        var filter=auditFilter(action,operator,keyword,from,to);
        int total=accounts.queryForObject("SELECT count(*) "+filter.where(),Integer.class,filter.args().toArray());
        var args=new ArrayList<>(filter.args());
        args.add(size);
        args.add((page-1L)*size);
        var rows=accounts.queryForList(AUDIT_COLUMNS+filter.where()+" ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?",args.toArray());
        return new Page(rows,page,size,total);
    }

    private static final String AUDIT_COLUMNS="""
        SELECT l.*,CASE WHEN u.deleted_at IS NULL THEN u.username ELSE '已删除账号' END AS username
        """;
    private record AuditFilter(String where,List<Object> args) {}

    private static AuditFilter auditFilter(String action,String operator,String keyword,String from,String to) {
        if (operator.length()>254 || keyword.length()>1000) throw ApiException.invalid("keyword","检索词过长。");
        if (!from.isBlank() && !to.isBlank() && from.compareTo(to)>0)
            throw ApiException.invalid("to","结束日期不能早于开始日期。");
        var args=new ArrayList<Object>();
        var where=new StringBuilder(" FROM admin_audit_logs l LEFT JOIN users u ON u.id=l.admin_id WHERE 1=1");
        jobFilter(where,args," AND l.action=?",action);
        jobFilter(where,args," AND u.deleted_at IS NULL AND instr(lower(u.username),lower(?))>0",operator);
        jobFilter(where,args," AND instr(lower(l.action||' '||l.target_type||' '||coalesce(l.target_id,'')||' '||l.details),lower(?))>0",keyword);
        jobFilter(where,args," AND l.created_at>=?",dateBoundary(from,false));
        jobFilter(where,args," AND l.created_at<?",dateBoundary(to,true));
        return new AuditFilter(where.toString(),args);
    }

    @GetMapping("/audit/export")
    ResponseEntity<org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody> exportAudit(
        @RequestParam(defaultValue="") String action,@RequestParam(defaultValue="") String operator,
        @RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="") String from,
        @RequestParam(defaultValue="") String to,HttpServletRequest request) {
        var filter=auditFilter(action,operator,keyword,from,to);
        audit(actor(request),"audit_exported","audit",null,"",request);
        var statement=AUDIT_COLUMNS+filter.where()+" ORDER BY l.created_at DESC,l.id";
        var columns=List.of("created_at","username","action","target_type","target_id","details","ip");
        org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody body=output->{
            var writer=new java.io.BufferedWriter(new java.io.OutputStreamWriter(output,StandardCharsets.UTF_8));
            writer.write("\uFEFF时间,操作者,动作,目标类型,目标编号,详情,IP\r\n");
            try(var rows=accounts.queryForStream(statement,(row,n)->{
                var values=new ArrayList<String>();
                for (String column:columns) values.add(csv(row.getString(column)));
                return String.join(",",values);
            },filter.args().toArray())) {
                for(var iterator=rows.iterator();iterator.hasNext();) {
                    writer.write(iterator.next());
                    writer.write("\r\n");
                }
            }
            writer.flush();
        };
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
            .cacheControl(CacheControl.noStore()).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=audit.csv").body(body);
    }

    private static String csv(String value) {
        String text=Objects.toString(value,"");
        if (!text.isEmpty()) {
            String leading=text.stripLeading();
            if ("\t\r\n".indexOf(text.charAt(0))>=0 || (!leading.isEmpty() && "=+-@".indexOf(leading.charAt(0))>=0))
                text="'"+text;
        }
        return "\""+text.replace("\"","\"\"")+"\"";
    }

    @GetMapping("/school")
    Map<String,Object> school(@RequestParam(defaultValue="") String userId) {
        var progress=new ArrayList<Map<String,Object>>();
        if (!userId.isBlank()) {
            var user=auth.requireAccount(userId);
            if (storage.exists(userId)) progress.add(Map.of("userId",userId,"username",user.username(),"labs",school.progress(userId)));
        } else {
            for (var row:accounts.queryForList("SELECT id,username FROM users WHERE deleted_at IS NULL ORDER BY id")) {
                String id=(String)row.get("id");
                if (storage.exists(id)) progress.add(Map.of("userId",id,"username",row.get("username"),"labs",school.progress(id)));
            }
        }
        return Map.of("courses",school.courses(),"learners",progress);
    }

    @GetMapping("/school/labs")
    Map<String,Object> labProgress(@RequestParam(defaultValue="") String userId,@RequestParam(defaultValue="") String keyword,
                                    @RequestParam(defaultValue="") String labId,@RequestParam(defaultValue="") String status,
                                    @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        page(page,size);
        var labs=school.labs();
        String cte="""
            WITH definitions AS (
                SELECT value->>'courseId' AS course_id,value->>'labId' AS lab_id,value->>'title' AS title,
                       value->>'required' AS required FROM json_each(?)
            ), progress AS (
                SELECT u.id AS userId,u.username,d.course_id AS courseId,d.lab_id AS labId,d.title,d.required,
                    coalesce(l.required_completed,0) AS completed,coalesce(l.optional_completed,0) AS optionalCompleted,
                    CASE WHEN d.required>0 AND l.required_completed>=d.required THEN 'completed'
                         WHEN l.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM admin_school_lab_activity a
                            WHERE a.user_id=u.id AND a.course_id=d.course_id AND a.lab_id=d.lab_id)
                         THEN 'in_progress' ELSE 'unstarted' END AS state
                FROM users u CROSS JOIN definitions d
                LEFT JOIN admin_school_lab_index l ON l.user_id=u.id AND l.course_id=d.course_id AND l.lab_id=d.lab_id
                WHERE u.deleted_at IS NULL AND u.role='ROLE_STUDENT'
                AND (?='' OR u.id=?) AND instr(lower(u.username),lower(?))>0 AND (?='' OR d.lab_id=?)
            )
            """;
        String where=" FROM progress WHERE (?='' OR state=?)";
        List<Object> args=List.of(json.writeValueAsString(labs),userId,userId,keyword,labId,labId,status,status);
        int total=accounts.queryForObject(cte+"SELECT count(*)"+where,Integer.class,args.toArray());
        var paginated=new ArrayList<>(args);
        paginated.add(size);
        paginated.add((page-1L)*size);
        var items=accounts.queryForList(cte+"SELECT *"+where+" ORDER BY username COLLATE NOCASE,courseId,labId,userId LIMIT ? OFFSET ?",paginated.toArray());
        return Map.of("labs",labs,"progress",new Page(items,page,size,total));
    }

    @GetMapping("/school/labs/{courseId}/{labId}/learners/{userId}")
    List<AdminSchoolService.QuestionProgress> labQuestions(@PathVariable String courseId,@PathVariable String labId,
                                                         @PathVariable String userId,HttpServletRequest request) {
        auth.requireAccount(userId);
        audit(actor(request),"school_progress_viewed","user",userId,courseId+"/"+labId,request);
        return school.questions(userId,courseId,labId);
    }

    @GetMapping("/school/exams")
    Map<String,Object> exams(@RequestParam(defaultValue="") String userId,@RequestParam(defaultValue="") String keyword,
                             @RequestParam(defaultValue="") String paperId,@RequestParam(defaultValue="1") int page,
                             @RequestParam(defaultValue="20") int size) {
        return Map.of("attempts",examAttempts(userId,keyword,paperId,page,size),"papers",analytics.papers(),"mistakes",analytics.mistakes(userId));
    }

    private Page examAttempts(String userId,String keyword,String paperId,int page,int size) {
        page(page,size);
        String where="""
            FROM admin_school_exam_index e JOIN users u ON u.id=e.user_id WHERE u.deleted_at IS NULL AND u.role='ROLE_STUDENT'
                AND e.mode='exam' AND (?='' OR e.user_id=?) AND instr(lower(u.username),lower(?))>0 AND (?='' OR e.paper_id=?)
            """;
        int total=accounts.queryForObject("SELECT count(*) "+where,Integer.class,userId,userId,keyword,paperId,paperId);
        var items=accounts.queryForList("SELECT e.*,u.username "+where+" ORDER BY e.submitted_at DESC,e.id,e.user_id LIMIT ? OFFSET ?",
            userId,userId,keyword,paperId,paperId,size,(page-1L)*size);
        var titles=new HashMap<List<String>,String>();
        school.papers().forEach(paper->titles.put(List.of(paper.courseId(),paper.paperId()),paper.title()));
        items.forEach(item->item.put("paperTitle",titles.get(List.of(item.get("course_id"),item.get("paper_id")))));
        return new Page(items,page,size,total);
    }

    record ReportExport(String courseId,String format,String labId,String userId) {}

    @PostMapping("/school/reports")
    ResponseEntity<AdminReportExports.Status> archive(@RequestBody ReportExport input,HttpServletRequest request) {
        var actor=actor(request);
        String userId=Objects.toString(input.userId(),"");
        if (!userId.isBlank()) auth.requireAccount(userId);
        var status=exports.start(actor.userId(),input.courseId(),input.format(),Objects.toString(input.labId(),""),userId);
        audit(actor,"report_export_requested","course",input.courseId(),input.format(),request);
        return ResponseEntity.accepted().body(status);
    }

    @GetMapping("/school/reports")
    List<AdminReportExports.Status> recentArchives(HttpServletRequest request) {
        return exports.recent(actor(request).userId());
    }

    @GetMapping("/school/reports/{id}")
    AdminReportExports.Status archiveStatus(@PathVariable String id,HttpServletRequest request) {
        return exports.status(actor(request).userId(),id);
    }

    @GetMapping("/school/reports/{id}/download")
    ResponseEntity<org.springframework.core.io.Resource> archiveDownload(@PathVariable String id,HttpServletRequest request) {
        var actor=actor(request);
        var archive=exports.download(actor.userId(),id);
        audit(actor,"reports_exported","course",archive.courseId(),archive.format(),request);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip")).cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(archive.courseId()+"-reports.zip").build().toString())
            .body(new org.springframework.core.io.FileSystemResource(archive.file()));
    }

    @PostMapping("/school/{courseId}/learners/{id}/reset")
    Map<String,Boolean> schoolReset(@PathVariable String courseId,@PathVariable String id,HttpServletRequest request) {
        auth.requireAccount(id);
        school.reset(id,courseId);
        audit(actor(request),"school_database_reset","user",id,courseId,request);
        return Map.of("success",true);
    }

    private boolean liveJob(RunnerInventory.Container container) {
        var job = containerJob(container);
        if (job == null) return !stopped(container);
        String table = switch (job.kind()) {
            case "portfolio" -> "portfolio_checks";
            case "generated" -> "generated_attempts";
            default -> "check_jobs";
        };
        return indexedLearning(job).queryForObject("SELECT count(*) FROM "+table
            +" WHERE id=? AND status IN ('queued','running','cancelling','awaiting_runner')",Integer.class,container.jobId())>0;
    }

    private static int count(JdbcTemplate jdbc,String query) { return jdbc.queryForObject(query,Integer.class); }

    private static void page(int page,int size) {
        if (page<1 || page>1000 || size<1 || size>100) throw ApiException.invalid("page","分页参数无效。");
    }

    private static long freeSpace(Path path) { try { return Files.getFileStore(path).getUsableSpace(); } catch(IOException e) { return 0; } }

    private static AuthService.User actor(HttpServletRequest request) { return AuthController.principal(request).user(); }

    private void audit(AuthService.User actor,String action,String type,String id,String details,HttpServletRequest request) {
        auth.audit(actor.userId(),action,type,id,details,request.getRemoteAddr());
    }

    private static ApiException missingJob() {
        return new ApiException(HttpStatus.NOT_FOUND,"JOB_NOT_FOUND","作业不存在。",Map.of());
    }
}

package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.auth.*;
import dev.codesomething.storage.LearningDataSource;
import dev.codesomething.profile.LearnerController;
import dev.codesomething.school.AdminSchoolService;
import dev.codesomething.tutor.TutorController;
import dev.codesomething.sql.SqlLearningController;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
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

    AdminController(LearningDataSource storage, AuthService auth, RunnerInventory runners, AdminSchoolService school,
                    LearnerController learner, TutorController tutor, SqlLearningController sql, JsonMapper json, AdminIndex index, AdminJobRetry retries, AdminReportExports exports) {
        this.storage=storage;this.accounts=new JdbcTemplate(storage.primary());this.auth=auth;this.runners=runners;
        this.school=school;this.learner=learner;this.tutor=tutor;this.sql=sql;this.json=json;this.index=index;this.retries=retries;this.exports=exports;
    }

    record Page(List<Map<String,Object>> items,int page,int size,int total) {}
    record AccountStatus(String status) {}
    record Role(String role) {}
    record Password(String newPassword) {}
    record Invite(int maxUses,int hours) {}

    @GetMapping("/users")
    Page users(@RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int size,
               @RequestParam(defaultValue="") String keyword, @RequestParam(defaultValue="") String role,
               @RequestParam(defaultValue="") String status) {
        page(page,size);
        if (keyword.length()>254) throw ApiException.invalid("keyword", "检索词过长。");
        String where = """
            FROM users WHERE deleted_at IS NULL
                AND (?='' OR instr(lower(username),lower(?))>0 OR instr(lower(coalesce(email,'')),lower(?))>0)
                AND (?='' OR role=?) AND (?='' OR status=?)
            """;
        int total=accounts.queryForObject("SELECT count(*) "+where,Integer.class,keyword,keyword,keyword,role,role,status,status);
        var rows=accounts.queryForList("SELECT "+USER_COLUMNS+" "+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
            keyword,keyword,keyword,role,role,status,status,size,(page-1L)*size);
        return new Page(rows,page,size,total);
    }

    @GetMapping("/users/{id}")
    Map<String,Object> profile(@PathVariable String id,HttpServletRequest request) {
        var actor=actor(request);
        var user=auth.requireAccount(id);
        audit(actor,"profile_viewed","user",id,"",request);
        if (!storage.exists(id)) return Map.of("user",user,"profile",Map.of(),"school",school.progress(id));
        try (var scope=LearningDataSource.asOwner(id)) {
            return Map.of("user",user,"profile",learner.profile(),"school",school.progress(id));
        }
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
    List<Map<String,Object>> invites() {
        return accounts.queryForList("""
            SELECT substr(code,1,12) AS id,max_uses,used_count,status,expires_at
            FROM invitation_codes ORDER BY expires_at DESC LIMIT 100
            """);
    }

    @PostMapping("/invitations")
    Map<String,String> invite(@RequestBody Invite input,HttpServletRequest request) {
        return Map.of("code",auth.invite(actor(request),input.maxUses(),input.hours(),request.getRemoteAddr()));
    }

    @GetMapping("/analytics/overview")
    Map<String,Object> overview() {
        int registered=accounts.queryForObject("SELECT count(*) FROM users WHERE role='ROLE_STUDENT' AND deleted_at IS NULL",Integer.class);
        int active=accounts.queryForObject("SELECT count(*) FROM users WHERE role='ROLE_STUDENT' AND deleted_at IS NULL AND last_seen_at>=?",Integer.class,
            LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant().toString());
        int administrators=count(accounts,"SELECT count(*) FROM users WHERE role='ROLE_ADMIN' AND deleted_at IS NULL");
        long submissions=accounts.queryForObject("SELECT count(*) FROM admin_submission_index", Long.class);
        long passed=0,pending=0,graded=0;
        var errors=new TreeMap<String,Long>();
        for (var row:accounts.queryForList("SELECT status,count(*) AS n FROM admin_job_index GROUP BY status")) {
            String status=(String)row.get("status");long n=((Number)row.get("n")).longValue();
            if ("passed".equals(status)) passed+=n;
            if (GRADED.contains(status)) graded+=n;
            if (PENDING.contains(status)) pending+=n;
            if (ERRORS.contains(status)) errors.put(status,n);
        }
        var result=new LinkedHashMap<String,Object>();
        result.put("registered",registered);result.put("administrators",administrators);result.put("activeToday",active);result.put("submissions",submissions);
        result.put("passed",passed);result.put("graded",graded);result.put("pending",pending);
        result.put("passRate",graded==0?null:(double)passed/graded);result.put("errors",errors);
        return result;
    }

    @GetMapping("/analytics/activity-timeline")
    List<Map<String,Object>> activity(@RequestParam(defaultValue="24") int hours) {
        if (hours!=24 && hours!=168) throw ApiException.invalid("hours","仅支持近24小时或7天。");
        Instant last=Instant.now().truncatedTo(ChronoUnit.HOURS);
        Instant first=last.minus(hours-1,ChronoUnit.HOURS);
        var totals=new long[hours];
        var learners=new int[hours];
        var submissions=accounts.queryForList("""
            SELECT substr(created_at,1,13) AS hour,count(*) AS n FROM admin_submission_index
            WHERE created_at>=? AND created_at<? GROUP BY hour
            """,first.toString().substring(0,13),last.plus(1,ChronoUnit.HOURS).toString().substring(0,13));
        for (var row:submissions) {
            int index=(int)ChronoUnit.HOURS.between(first,Instant.parse(row.get("hour")+":00:00Z"));
            totals[index]=((Number)row.get("n")).longValue();
        }
        var active=accounts.queryForList("""
            SELECT a.hour,count(*) AS n FROM user_activity_hourly a JOIN users u ON u.id=a.user_id
            WHERE a.hour>=? AND a.hour<=? AND u.role='ROLE_STUDENT' GROUP BY a.hour
            """,first.toString(),last.toString());
        for(var row:active) {
            int index=(int)ChronoUnit.HOURS.between(first,Instant.parse((String)row.get("hour")));
            if(index>=0 && index<hours) learners[index]=((Number)row.get("n")).intValue();
        }
        var result=new ArrayList<Map<String,Object>>();
        for (int i=0;i<hours;i++) result.add(Map.of("time",first.plus(i,ChronoUnit.HOURS).toString(),"submissions",totals[i],"active",learners[i]));
        return result;
    }

    @GetMapping("/jobs")
    Page jobs(@RequestParam(defaultValue="") String status,@RequestParam(defaultValue="") String userId,
              @RequestParam(defaultValue="") String courseId,@RequestParam(defaultValue="") String keyword,
              @RequestParam(defaultValue="") String from,@RequestParam(defaultValue="") String to,
              @RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        page(page,size);
        if (!keyword.matches("[0-9a-fA-F-]{0,36}")) throw ApiException.invalid("keyword","请输入作业或提交编号。");
        var args = new ArrayList<Object>();
        var where = new StringBuilder(" FROM admin_job_index j JOIN users u ON u.id=j.user_id WHERE 1=1");
        jobFilter(where,args," AND j.status=?",status);
        jobFilter(where,args," AND j.user_id=?",userId);
        jobFilter(where,args," AND j.course_id=?",courseId);
        jobFilter(where,args," AND j.created_at>=?",dateBoundary(from));
        jobFilter(where,args," AND j.created_at<?",dateBoundary(to));
        if (!from.isBlank() && !to.isBlank() && from.compareTo(to)>=0)
            throw ApiException.invalid("to","结束日期必须晚于开始日期。");
        if (!keyword.isEmpty()) {
            where.append(" AND (j.id GLOB ? OR j.submission_id GLOB ?)");
            String pattern = keyword.toLowerCase(Locale.ROOT)+"*";
            args.add(pattern);
            args.add(pattern);
        }
        int total=accounts.queryForObject("SELECT count(*)"+where,Integer.class,args.toArray());
        args.add(size);
        args.add((page-1L)*size);
        var rows=accounts.queryForList("SELECT j.*,CASE WHEN u.deleted_at IS NULL THEN u.username ELSE '已删除账号' END AS username,u.status AS user_status"+where
            +" ORDER BY j.created_at DESC,j.id,j.user_id,j.kind LIMIT ? OFFSET ?",args.toArray());
        return new Page(rows,page,size,total);
    }

    private static void jobFilter(StringBuilder where,List<Object> args,String condition,String value) {
        if (value.isBlank()) return;
        where.append(condition);
        args.add(value);
    }

    private static String dateBoundary(String value) {
        if (value.isBlank()) return "";
        try {
            var instant = LocalDate.parse(value).atStartOfDay(ZONE).toInstant().toString();
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
                SELECT id,status,created_at,id AS submission_id,'portfolio' AS course_id,phase AS stage_id,digest,files AS source,report
                FROM portfolio_checks WHERE id=?
                """;
            case "sql" -> """
                SELECT id,status,created_at,finished_at,id AS submission_id,'sql-foundations' AS course_id,stage_id,digest,source,report
                FROM sql_attempts WHERE id=?
                """;
            default -> """
                SELECT j.id,j.status,j.created_at,j.finished_at,j.report,s.id AS submission_id,s.course_id,s.stage_id,s.digest,s.source
                FROM check_jobs j JOIN submissions s ON j.submission_id=s.id WHERE j.id=?
                """;
        },id);
        if (rows.isEmpty()) throw missingJob();
        var row=rows.getFirst();
        row.put("user_id",job.owner());
        if (row.get("source") instanceof byte[] source) row.put("source",new String(source,StandardCharsets.UTF_8));
        if (row.get("report") instanceof String report) row.put("report",json.readTree(report));
        audit(actor(request),"snapshot_viewed","job",id,job.owner(),request);
        return row;
    }

    @PostMapping("/jobs/{id}/kill")
    Map<String,Boolean> kill(@PathVariable String id,@RequestParam(defaultValue="") String userId,HttpServletRequest request) {
        var job=locateJob(id,userId);
        var learning=indexedLearning(job);
        int updated=switch(job.kind()) {
            case "portfolio" -> learning.update("""
                UPDATE portfolio_checks SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END
                WHERE id=? AND status IN ('queued','running')
                """,id);
            case "sql" -> learning.update("""
                UPDATE sql_attempts SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END,
                    finished_at=CASE WHEN status='running' THEN finished_at ELSE ? END
                WHERE id=? AND status IN ('queued','running')
                """,Instant.now().toString(),id);
            default -> learning.update("""
                UPDATE check_jobs SET status=CASE WHEN status='running' THEN 'cancelling' ELSE 'cancelled' END,
                    finished_at=CASE WHEN status='running' THEN finished_at ELSE ? END
                WHERE id=? AND status IN ('queued','running','awaiting_runner')
                """,Instant.now().toString(),id);
        };
        if (updated==0) throw new ApiException(HttpStatus.CONFLICT,"JOB_NOT_RUNNING","该作业已结束或正在停止。",Map.of());
        audit(actor(request),"job_cancelled","job",id,job.owner(),request);
        return Map.of("success",true);
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
        return Map.of("docker",index.docker(),"database",Map.of("bytes",disk.bytes(),"walBytes",disk.walBytes(),
            "journalMode",accounts.queryForObject("PRAGMA journal_mode",String.class)),
            "diskFreeBytes",freeSpace(storage.database("admin")),"tutor",tutorHealth,"mysqlPoolLimit",sql.publicPoolLimit());
    }

    @PostMapping("/system/tutor-probe")
    Map<String,String> tutorProbe(HttpServletRequest request) {
        var status=tutor.connect();
        audit(actor(request),"tutor_probed","tutor",null,status.get("status"),request);
        return status;
    }

    @GetMapping("/system/containers")
    List<RunnerInventory.Container> containers() { return runners.containers(); }

    @PostMapping("/system/prune-containers")
    Map<String,Integer> prune(HttpServletRequest request) {
        int removed=0;
        var actor=actor(request);
        var containers=runners.containers();
        var ids=accounts.queryForList("SELECT id FROM users WHERE deleted_at IS NULL",String.class);
        var ownedMysql=school.schoolContainers(ids);
        ids.stream().map(sql::publicContainer).forEach(ownedMysql::add);
        for (var container:containers) {
            boolean orphan=container.kind().equals("mysql") ? !container.state().equals("running")||!ownedMysql.contains(container.name()) : !liveJob(container);
            if (!orphan) continue;
            runners.remove(container);
            audit(actor,"container_pruned","container",container.name(),container.kind(),request);
            removed++;
        }
        return Map.of("removed",removed);
    }

    @GetMapping("/audit")
    Page audit(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="30") int size,
               @RequestParam(defaultValue="") String action) {
        page(page,size);
        int total=accounts.queryForObject("SELECT count(*) FROM admin_audit_logs WHERE (?='' OR action=?)",Integer.class,action,action);
        var rows=accounts.queryForList("""
            SELECT l.*,CASE WHEN u.deleted_at IS NULL THEN u.username ELSE '已删除账号' END AS username
            FROM admin_audit_logs l LEFT JOIN users u ON u.id=l.admin_id
            WHERE (?='' OR l.action=?) ORDER BY l.created_at DESC,l.id LIMIT ? OFFSET ?
            """,action,action,size,(page-1L)*size);
        return new Page(rows,page,size,total);
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

    record ReportExport(String courseId,String format) {}

    @PostMapping("/school/reports")
    ResponseEntity<AdminReportExports.Status> archive(@RequestBody ReportExport input,HttpServletRequest request) {
        var actor=actor(request);
        var status=exports.start(actor.userId(),input.courseId(),input.format());
        audit(actor,"report_export_requested","course",input.courseId(),input.format(),request);
        return ResponseEntity.accepted().body(status);
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
        try {
            var job=locateJob(container.jobId(),"");
            String table=switch(job.kind()) {
                case "portfolio" -> "portfolio_checks";
                case "sql" -> "sql_attempts";
                default -> "check_jobs";
            };
            return indexedLearning(job).queryForObject("SELECT count(*) FROM "+table
                +" WHERE id=? AND status IN ('queued','running','cancelling')",Integer.class,container.jobId())>0;
        } catch (ApiException error) {
            // A newly started job can reach Docker before its index entry. Keep unknown live containers.
            return !Set.of("exited","dead").contains(container.state());
        }
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

package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.school.AdminSchoolService;
import dev.codesomething.storage.LearningDataSource;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="cs.public",havingValue="true")
final class AdminLearningAnalytics {
    static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
    private static final String STUDENTS="role='ROLE_STUDENT' AND deleted_at IS NULL";
    private final JdbcTemplate db;
    private final AdminSchoolService school;

    AdminLearningAnalytics(LearningDataSource storage,AdminSchoolService school) {
        this.db=new JdbcTemplate(storage.primary());
        this.school=school;
    }

    int required() { return school.labs().stream().mapToInt(AdminSchoolService.LabDefinition::required).sum(); }

    Map<String,Object> overview(JdbcTemplate db) {
        var today=LocalDate.now(ZONE);
        var result=db.queryForMap("""
            WITH students AS (SELECT id,created_at FROM users WHERE
            """+STUDENTS+"""
            ), activity AS (
                SELECT user_id,max(hour) AS latest FROM user_activity_hourly
                WHERE hour>=? AND user_id IN (SELECT id FROM students) GROUP BY user_id
            )
            SELECT (SELECT count(*) FROM students) AS registered,
                (SELECT count(*) FROM activity WHERE latest>=?) AS activeToday,
                (SELECT count(*) FROM activity WHERE latest>=?) AS active7Days,
                (SELECT count(*) FROM activity) AS active30Days,
                (SELECT count(*) FROM students WHERE created_at>=?) AS newToday,
                (SELECT count(*) FROM students WHERE created_at>=?) AS new7Days,
                (SELECT coalesce(sum(required_completed+optional_completed),0) FROM admin_school_lab_index
                    WHERE user_id IN (SELECT id FROM students)) AS schoolCompleted,
                (SELECT count(*) FROM admin_bookmark_index WHERE user_id IN (SELECT id FROM students)) AS bookmarkCount,
                (SELECT count(*) FROM admin_school_exam_draft_index WHERE user_id IN (SELECT id FROM students)) AS examDraftCount
            """,start(today.minusDays(29)),start(today),start(today.minusDays(6)),datePrefix(today),datePrefix(today.minusDays(6)));
        var tests=db.queryForMap("""
            SELECT count(*) AS examCount,avg(CASE WHEN complete_grading=1 THEN score END) AS examAverage,
                   avg(CASE WHEN complete_grading=1 THEN passed END) AS examPassRate
            FROM admin_school_exam_index WHERE mode='exam' AND user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+")");
        result.putAll(tests);
        result.put("tutor",db.queryForMap("""
            SELECT count(*) AS total,count(DISTINCT user_id) AS learners,
                   count(CASE WHEN status='completed' THEN 1 END) AS succeeded,
                   count(CASE WHEN status='failed' THEN 1 END) AS failed
            FROM admin_tutor_index WHERE user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+")"));
        result.put("labFunnel",labFunnel(db));
        result.put("papers",papers(db));
        result.put("mistakes",mistakes(db,""));
        result.put("bookmarks",db.queryForList("""
            SELECT category,id,min(title) AS title,min(href) AS href,count(*) AS bookmarks
            FROM admin_bookmark_index WHERE user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+") GROUP BY category,id ORDER BY bookmarks DESC,category,id LIMIT 10"));
        result.put("pendingFeedback",db.queryForObject("SELECT count(*) FROM learner_feedback WHERE status='pending'",Integer.class));
        result.put("publishedAnnouncements",db.queryForObject("SELECT count(*) FROM site_announcements WHERE status='published'",Integer.class));
        return result;
    }

    private List<Map<String,Object>> labFunnel(JdbcTemplate db) {
        var grouped=new HashMap<List<Object>,List<Map<String,Object>>>();
        for(var row:db.queryForList("""
            WITH started AS (
                SELECT user_id,course_id,lab_id,required_completed FROM admin_school_lab_index
                UNION ALL
                SELECT DISTINCT a.user_id,a.course_id,a.lab_id,0 FROM admin_school_lab_activity a
                WHERE NOT EXISTS (SELECT 1 FROM admin_school_lab_index l
                    WHERE l.user_id=a.user_id AND l.course_id=a.course_id AND l.lab_id=a.lab_id)
            )
            SELECT course_id,lab_id,required_completed,count(*) AS learners FROM started
            WHERE user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+") GROUP BY course_id,lab_id,required_completed")) {
            grouped.computeIfAbsent(List.of(row.get("course_id"),row.get("lab_id")),key->new ArrayList<>()).add(row);
        }
        return school.labs().stream().map(lab->{
            long started=0,completed=0;
            for (var bucket:grouped.getOrDefault(List.of(lab.courseId(),lab.labId()),List.of())) {
                long learners=((Number)bucket.get("learners")).longValue();
                started+=learners;
                if (lab.required()>0 && ((Number)bucket.get("required_completed")).intValue()>=lab.required()) completed+=learners;
            }
            Map<String,Object> row=new LinkedHashMap<>();
            row.put("started",started);
            row.put("completed",completed);
            row.put("courseId",lab.courseId());
            row.put("labId",lab.labId());
            row.put("title",lab.title());
            return row;
        }).toList();
    }

    List<Map<String,Object>> papers() {
        return papers(db);
    }

    private List<Map<String,Object>> papers(JdbcTemplate db) {
        var stats=db.queryForList("""
            SELECT course_id,paper_id,count(*) AS attempts,avg(CASE WHEN complete_grading=1 THEN score END) AS average,
                   avg(CASE WHEN complete_grading=1 THEN passed END) AS passRate
            FROM admin_school_exam_index WHERE mode='exam' AND user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+") GROUP BY course_id,paper_id");
        var byPaper=new HashMap<List<Object>,Map<String,Object>>();
        for(var row:stats) byPaper.put(List.of(row.get("course_id"),row.get("paper_id")),row);
        var drafts=new HashMap<List<Object>,Object>();
        for (var row:db.queryForList("""
            SELECT course_id,paper_id,count(*) AS drafts FROM admin_school_exam_draft_index
            WHERE user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+") GROUP BY course_id,paper_id")) {
            drafts.put(List.of(row.get("course_id"),row.get("paper_id")),row.get("drafts"));
        }
        var papers=new ArrayList<Map<String,Object>>();
        for (var paper:school.papers()) {
            var row=new LinkedHashMap<String,Object>();
            row.put("courseId",paper.courseId());
            row.put("paperId",paper.paperId());
            row.put("title",paper.title());
            row.put("attempts",0);
            row.put("average",null);
            row.put("passRate",null);
            row.putAll(byPaper.getOrDefault(List.of(paper.courseId(),paper.paperId()),Map.of()));
            row.put("drafts",drafts.getOrDefault(List.of(paper.courseId(),paper.paperId()),0));
            papers.add(row);
        }
        return papers;
    }

    List<Map<String,Object>> mistakes(String owner) {
        return mistakes(db,owner);
    }

    private List<Map<String,Object>> mistakes(JdbcTemplate db,String owner) {
        return db.queryForList("""
            SELECT course_id,question_id,min(paper_id) AS paper_id,min(title) AS title,
                   count(*) AS learners,sum(mistakes) AS mistakes
            FROM admin_school_mistake_index WHERE (?='' OR user_id=?)
            AND user_id IN (SELECT id FROM users WHERE
            """+STUDENTS+") GROUP BY course_id,question_id ORDER BY mistakes DESC,course_id,question_id LIMIT 10",owner,owner);
    }

    List<Map<String,Object>> userLabs(String owner) {
        return school.labs().stream().map(lab->{
            var rows=db.queryForList("""
                WITH recent AS (
                    SELECT max(created_at) AS lastPracticeAt,max(CASE WHEN passed=1 THEN created_at END) AS lastPassedAt
                    FROM admin_school_lab_activity WHERE user_id=? AND course_id=? AND lab_id=?
                )
                SELECT coalesce(l.required_completed,0) AS completed,coalesce(l.optional_completed,0) AS optionalCompleted,
                    (l.user_id IS NOT NULL OR recent.lastPracticeAt IS NOT NULL) AS started,recent.*
                FROM recent LEFT JOIN admin_school_lab_index l ON l.user_id=? AND l.course_id=? AND l.lab_id=?
                """,owner,lab.courseId(),lab.labId(),owner,lab.courseId(),lab.labId());
            var row=new LinkedHashMap<String,Object>();
            row.putAll(rows.getFirst());
            row.put("courseId",lab.courseId());
            row.put("labId",lab.labId());
            row.put("title",lab.title());
            row.put("required",lab.required());
            return (Map<String,Object>)row;
        }).toList();
    }

    List<Map<String,Object>> timeline(int hours) {
        if (!Set.of(24,168,720).contains(hours)) throw ApiException.invalid("hours","请选择近24小时、7天或30天。");
        boolean daily=hours!=24;
        int buckets=daily?hours/24:24;
        Instant now=Instant.now();
        Instant last=daily?LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant():now.truncatedTo(ChronoUnit.HOURS);
        long seconds=daily?86400:3600;
        Instant first=last.minusSeconds((buckets-1)*seconds);
        String firstPrefix=first.toString().substring(0,19);
        var rows=db.queryForList("""
            WITH events(time,kind,user_id) AS (
                SELECT created_at,'submissions',NULL FROM admin_submission_index WHERE created_at>=?
                UNION ALL SELECT created_at,'school',user_id FROM admin_school_lab_activity WHERE kind='grade' AND created_at>=?
                UNION ALL SELECT strftime('%Y-%m-%dT%H:%M:%SZ',submitted_at/1000,'unixepoch'),'school',user_id
                    FROM admin_school_exam_index WHERE submitted_at>=? AND mode='exam'
                UNION ALL SELECT a.hour,'active',u.id FROM user_activity_hourly a JOIN users u ON u.id=a.user_id
                    WHERE a.hour>=? AND u.role='ROLE_STUDENT' AND u.deleted_at IS NULL
                UNION ALL SELECT created_at,'registrations',id FROM users WHERE created_at>=? AND
            """+STUDENTS+"""
            )
            SELECT CAST((unixepoch(time)-?)/? AS INTEGER) AS bucket,
                count(CASE WHEN kind='submissions' THEN 1 END) AS submissions,
                count(CASE WHEN kind='school' THEN 1 END) AS school,
                count(DISTINCT CASE WHEN kind='active' THEN user_id END) AS active,
                count(CASE WHEN kind='registrations' THEN 1 END) AS registrations
            FROM events GROUP BY bucket
            """,firstPrefix,firstPrefix,first.toEpochMilli(),first.toString(),firstPrefix,first.getEpochSecond(),seconds);
        var keyed=new HashMap<Integer,Map<String,Object>>();
        for (var row:rows) if (row.get("bucket") instanceof Number n) keyed.put(n.intValue(),row);
        var result=new ArrayList<Map<String,Object>>();
        for (int i=0;i<buckets;i++) {
            var row=new LinkedHashMap<String,Object>(Map.of("submissions",0,"school",0,"active",0,"registrations",0));
            row.putAll(keyed.getOrDefault(i,Map.of()));
            row.remove("bucket");
            row.put("time",first.plusSeconds(i*seconds).toString());
            result.add(row);
        }
        return result;
    }

    private static String start(LocalDate day) {return day.atStartOfDay(ZONE).toInstant().toString();}
    private static String datePrefix(LocalDate day) {return start(day).substring(0,19);}
}

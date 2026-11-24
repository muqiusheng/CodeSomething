package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
class ExamStore {
    record Draft(String id, String paperId, String title, String mode, int minutes, long startedAt, long revision,
                 List<String> questionIds, Map<String, List<String>> order, Map<String, List<String>> answers,
                 List<String> stars, Map<String, Integer> paperRevisions) {}
    record Summary(String id, String paperId, String title, String mode, int score, int maxScore, String level,
                   Map<String, Integer> scores, long elapsedSeconds, long submittedAt, boolean completeGrading) {}
    record Item(ExamCatalog.VisibleQuestion question, List<String> answer, int score, String status, String explanation,
                List<String> correct, List<List<String>> acceptedBlanks, String referenceSql, List<ExamSqlRunner.CheckResult> checks,
                ExamSqlScript.Diagnostic sqlError) {
        Item(ExamCatalog.VisibleQuestion question, List<String> answer, int score, String status, String explanation,
             List<String> correct, List<List<String>> acceptedBlanks, String referenceSql, List<ExamSqlRunner.CheckResult> checks) {
            this(question, answer, score, status, explanation, correct, acceptedBlanks, referenceSql, checks, null);
        }
    }
    record Attempt(Summary summary, List<Item> items) {}
    record Mistake(String paperId, String paperTitle, String attemptId, Item item, int count, boolean mastered, long updatedAt) {}
    record TopicScoring(String labId, List<String> tags, int points, int score) {}

    private final JdbcTemplate jdbc;
    private final LearningDataSource sources;
    private final JsonMapper json;

    ExamStore(JdbcTemplate jdbc, LearningDataSource sources, JsonMapper json) {
        this.jdbc = jdbc;
        this.sources = sources;
        this.json = json;
    }

    List<Draft> drafts(String course) {
        return jdbc.query("SELECT payload FROM school_exam_drafts WHERE course_id=?",
            (row, i) -> json.readValue(row.getString(1), Draft.class), course);
    }

    Draft draft(String course, String id) {
        return jdbc.query("SELECT payload FROM school_exam_drafts WHERE course_id=? AND id=?",
            (row, i) -> json.readValue(row.getString(1), Draft.class), course, id).stream().findFirst().orElseThrow(ExamCatalog::missing);
    }

    Draft start(String course, Draft draft) {
        jdbc.update("INSERT INTO school_exam_drafts(course_id,id,paper_id,revision,payload) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
            course, draft.id(), draft.paperId(), draft.revision(), json.writeValueAsString(draft));
        return drafts(course).stream().filter(d -> d.paperId().equals(draft.paperId())).findFirst().orElseThrow(ExamStore::conflict);
    }

    Draft save(String course, Draft draft) {
        if (jdbc.update("UPDATE school_exam_drafts SET revision=?,payload=? WHERE course_id=? AND id=? AND revision=?",
            draft.revision(), json.writeValueAsString(draft), course, draft.id(), draft.revision() - 1) != 1) throw conflict();
        return draft;
    }

    void abandon(String course, String paper, String id, long revision) {
        if (jdbc.update("DELETE FROM school_exam_drafts WHERE course_id=? AND paper_id=? AND id=? AND revision=?",
            course, paper, id, revision) != 1) throw conflict();
    }

    List<Summary> history(String course) {
        return jdbc.query("SELECT payload FROM school_exam_attempts WHERE course_id=? ORDER BY submitted_at DESC,id DESC",
            (row, i) -> json.readValue(row.getString(1), Summary.class), course);
    }

    List<TopicScoring> latestScoring(String course) {
        return jdbc.query("""
            WITH ranked AS (
                SELECT i.rowid AS item_rowid, ROW_NUMBER() OVER (
                    PARTITION BY i.question_id ORDER BY a.submitted_at DESC, a.rowid DESC
                ) AS rank
                FROM school_exam_attempt_items i
                JOIN school_exam_attempts a ON a.course_id=i.course_id AND a.id=i.attempt_id
                WHERE i.course_id=? AND json_extract(i.payload, '$.status') IN ('correct', 'partial', 'wrong')
            )
            SELECT json_extract(i.payload, '$.question.labId'), json_extract(i.payload, '$.question.tags'),
                json_extract(i.payload, '$.question.points'), json_extract(i.payload, '$.score')
            FROM ranked JOIN school_exam_attempt_items i ON i.rowid=ranked.item_rowid WHERE rank=1
            """, (row, i) -> new TopicScoring(row.getString(1), List.of(json.readValue(row.getString(2), String[].class)),
                row.getInt(3), row.getInt(4)), course);
    }

    Optional<Attempt> findAttempt(String course, String id, String paper) {
        return jdbc.query("SELECT payload FROM school_exam_attempts WHERE course_id=? AND id=? AND paper_id=?",
            (row, i) -> json.readValue(row.getString(1), Summary.class), course, id, paper).stream().findFirst().map(summary ->
            new Attempt(summary, jdbc.query("SELECT payload FROM school_exam_attempt_items WHERE course_id=? AND attempt_id=? ORDER BY rowid",
                (row, i) -> json.readValue(row.getString(1), Item.class), course, id)));
    }

    Attempt submit(String course, Draft draft, Attempt report, Map<String, ExamCatalog.Paper> origins) {
        return sources.inLearningTransaction(LearningDataSource.owner(), tx -> {
            if (tx.update("DELETE FROM school_exam_drafts WHERE course_id=? AND id=? AND revision=?",
                course, draft.id(), draft.revision()) != 1) throw conflict();
            var summary = report.summary();
            tx.update("INSERT INTO school_exam_attempts(course_id,id,paper_id,submitted_at,payload) VALUES(?,?,?,?,?)",
                course, summary.id(), summary.paperId(), summary.submittedAt(), json.writeValueAsString(summary));
            for (var item : report.items()) {
                tx.update("INSERT INTO school_exam_attempt_items(course_id,attempt_id,question_id,payload) VALUES(?,?,?,?)",
                    course, summary.id(), item.question().id(), json.writeValueAsString(item));
                if (item.status().equals("unavailable")) continue;
                var prior = findMistake(tx, course, item.question().id());
                if (item.score() < item.question().points()) {
                    var origin = origins.get(item.question().id());
                    updateMistake(tx, course, new Mistake(origin.id(), origin.title(), summary.id(), item,
                        prior.map(Mistake::count).orElse(0) + 1, false, summary.submittedAt()));
                } else if (prior.isPresent()) {
                    var old = prior.get();
                    updateMistake(tx, course, new Mistake(old.paperId(), old.paperTitle(), old.attemptId(),
                        old.item(), old.count(), true, summary.submittedAt()));
                }
            }
            return report;
        });
    }

    List<Mistake> mistakes(String course) {
        return jdbc.query("SELECT payload FROM school_exam_mistakes WHERE course_id=?",
            (row, i) -> json.readValue(row.getString(1), Mistake.class), course);
    }

    Mistake mistake(String course, String id) {
        return findMistake(jdbc, course, id).orElseThrow(ExamCatalog::missing);
    }

    Mistake mastery(String course, String id, boolean mastered) {
        return sources.inLearningTransaction(LearningDataSource.owner(), tx -> {
            var old = findMistake(tx, course, id).orElseThrow(ExamCatalog::missing);
            var next = new Mistake(old.paperId(), old.paperTitle(), old.attemptId(), old.item(), old.count(), mastered, System.currentTimeMillis());
            updateMistake(tx, course, next);
            return next;
        });
    }

    private Optional<Mistake> findMistake(JdbcTemplate tx, String course, String id) {
        return tx.query("SELECT payload FROM school_exam_mistakes WHERE course_id=? AND question_id=?",
            (row, i) -> json.readValue(row.getString(1), Mistake.class), course, id).stream().findFirst();
    }

    private void updateMistake(JdbcTemplate tx, String course, Mistake item) {
        tx.update("""
            INSERT INTO school_exam_mistakes(course_id,question_id,payload) VALUES(?,?,?)
            ON CONFLICT(course_id,question_id) DO UPDATE SET payload=excluded.payload
            """, course, item.item().question().id(), json.writeValueAsString(item));
    }

    static ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "SCHOOL_EXAM_REVISION", "当前作答已在另一页面保存或交卷。请复制未保存内容后重新载入。", Map.of());
    }
}

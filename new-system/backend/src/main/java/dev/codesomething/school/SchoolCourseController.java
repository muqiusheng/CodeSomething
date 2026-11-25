package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import dev.codesomething.sql.MysqlEnvironment;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/school/courses")
public class SchoolCourseController {
    record CourseGroup(String term, String title, List<CourseDetails> courses) {}
    record LabReview(String id, String title) {}
    record LabProgress(String id, String title, int questions, int executed, int totalQuestions,
                       List<LabReview> review) {}
    record CourseDetails(SchoolCourseCatalog.Course course, List<LabProgress> labs, int examCount) {}
    record LabDetails(SchoolCourseCatalog.Course course, SchoolCourseCatalog.LabOutline outline,
                      SchoolCourseCatalog.Lab lab, SchoolDraftStore.Draft work, SchoolStudent.Identity student, String database, boolean grading) {}
    record SaveRequest(long revision, Map<String, String> drafts) {}
    record RunRequest(long revision, Map<String, String> drafts, String questionId, String selection, String database) {}
    record GradeRequest(long revision, Map<String, String> drafts, String questionId, String selection, Integer offset) {}
    record LabDebugRequest(String sql, String mode, Integer offset) {}
    record RunResponse(SchoolDraftStore.Draft work, Map<String, SchoolLabRunner.RunResult> results) {}
    record ResetRequest(boolean empty) {}

    private final SchoolCourseCatalog catalog;
    private final SchoolDraftStore drafts;
    private final SchoolLabRunner runner;
    private final SchoolReportService reports;
    private final SchoolStudent student;
    private final ExamCatalog exams;
    private final ExamSqlRunner grader;

    SchoolCourseController(SchoolCourseCatalog catalog, SchoolDraftStore drafts, SchoolLabRunner runner,
                           SchoolReportService reports, SchoolStudent student, ExamCatalog exams, ExamSqlRunner grader) {
        this.catalog = catalog;
        this.drafts = drafts;
        this.runner = runner;
        this.reports = reports;
        this.student = student;
        this.exams = exams;
        this.grader = grader;
    }

    @GetMapping
    List<CourseGroup> courses() {
        var grouped = new LinkedHashMap<String, List<CourseDetails>>();
        for (var course : catalog.courses()) grouped.computeIfAbsent(course.term(), key -> new ArrayList<>()).add(details(course));
        return grouped.entrySet().stream().map(entry -> new CourseGroup(entry.getKey(),
            entry.getValue().getFirst().course().termTitle(), entry.getValue())).toList();
    }

    @GetMapping("/{courseId}")
    CourseDetails course(@PathVariable String courseId) {
        return details(catalog.course(courseId));
    }

    private CourseDetails details(SchoolCourseCatalog.Course course) {
        var progress = course.labs().stream().map(outline -> {
            var lab = catalog.lab(course, outline.id());
            var work = drafts.read(course.id(), lab);
            boolean grading = catalog.hasLabChecks(course, lab);
            var required = lab.questions().stream().filter(question -> !question.optional()).toList();
            int count = (int) required.stream().filter(question -> {
                var execution = work.executions().get(question.id());
                return execution != null && execution.completed(grading);
            }).count();
            var review = grading ? lab.questions().stream().filter(question -> {
                var execution = work.executions().get(question.id());
                return execution != null && Objects.equals(work.drafts().get(question.id()), execution.sql())
                    && execution.grade() != null && Set.of("wrong", "partial").contains(execution.grade().status());
            }).map(question -> new LabReview(question.id(), question.title())).toList() : List.<LabReview>of();
            return new LabProgress(outline.id(), outline.title(), required.size(), count, lab.questions().size(), review);
        }).toList();
        return new CourseDetails(course, progress, exams.papers(course.id()).size());
    }

    @GetMapping("/{courseId}/labs/{labId}")
    LabDetails lab(@PathVariable String courseId, @PathVariable String labId) {
        var course = catalog.course(courseId);
        var lab = catalog.lab(course, labId);
        return new LabDetails(course, catalog.outline(course, labId), lab,
            drafts.read(courseId, lab), student.identity(), runner.database(course), catalog.hasLabChecks(course, lab));
    }

    @PostMapping("/{courseId}/environment/activity")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void activity(@PathVariable String courseId) {
        runner.touch(catalog.course(courseId));
    }

    @PostMapping("/{courseId}/labs/{labId}/save")
    synchronized SchoolDraftStore.Draft save(@PathVariable String courseId, @PathVariable String labId, @RequestBody SaveRequest body) {
        var lab = catalog.lab(catalog.course(courseId), labId);
        var scripts = validate(lab, body.drafts());
        var current = drafts.read(courseId, lab);
        return drafts.save(courseId, lab, body.revision(), scripts, current.executions());
    }

    @PostMapping("/{courseId}/labs/{labId}/run")
    synchronized RunResponse run(@PathVariable String courseId, @PathVariable String labId, @RequestBody RunRequest body) {
        var course = catalog.course(courseId);
        var lab = catalog.lab(course, labId);
        var scripts = validate(lab, body.drafts());
        var current = drafts.read(courseId, lab);
        if (current.revision() != body.revision()) throw SchoolDraftStore.conflict();
        var chosen = new LinkedHashMap<String, String>();
        if (body.questionId() != null && !scripts.containsKey(body.questionId()))
            throw ApiException.invalid("questionId", "请先输入当前题的 SQL。");
        for (var question : lab.questions()) {
            String script = scripts.get(question.id());
            if (script != null && (body.questionId() == null || question.id().equals(body.questionId()))) chosen.put(question.id(), script);
        }
        if (chosen.isEmpty()) throw ApiException.invalid("drafts", "请至少编写一题 SQL。");
        try {
            if (body.selection() != null) {
                var full = body.questionId() == null ? null : chosen.get(body.questionId());
                if (full == null || body.selection().isBlank() || !full.contains(body.selection()))
                    throw ApiException.invalid("selection", "请选择当前题的 SQL 片段后重试。");
                return new RunResponse(current, runner.run(course, Map.of(body.questionId(), body.selection()), body.database()));
            }
            var outcomes = runner.run(course, chosen, body.database());
            var executions = new LinkedHashMap<>(current.executions());
            outcomes.forEach((id, result) -> {
                var previous = executions.get(id);
                if (previous == null || previous.grade() == null || !Objects.equals(previous.sql(), chosen.get(id)))
                    executions.put(id, new SchoolDraftStore.Execution(chosen.get(id), result));
            });
            return new RunResponse(drafts.save(courseId, lab, body.revision(), scripts, executions), outcomes);
        } catch (MysqlEnvironment.Failure e) {
            throw environmentFailure(e);
        }
    }

    @PostMapping("/{courseId}/labs/{labId}/grade")
    synchronized RunResponse grade(@PathVariable String courseId, @PathVariable String labId, @RequestBody GradeRequest body) {
        var course = catalog.course(courseId);
        var lab = catalog.lab(course, labId);
        var scripts = validate(lab, body.drafts());
        var current = drafts.read(courseId, lab);
        if (current.revision() != body.revision()) throw SchoolDraftStore.conflict();

        var definitions = catalog.labChecks(course, lab);
        if (definitions.isEmpty()) throw ApiException.invalid("labId", "这个实验未配置自动判分。");
        String id = body.questionId();
        var question = definitions.get(id);
        String script = scripts.get(id);
        if (question == null || script == null) throw ApiException.invalid("questionId", "请先输入当前题的 SQL。");
        if (body.selection() != null) {
            if (body.selection().isBlank() || !script.contains(body.selection()))
                throw ApiException.invalid("selection", "请选择当前题的 SQL 片段后重试。");
            int offset = body.offset() == null ? 0 : body.offset();
            if (offset < 0 || offset > 8192) throw ApiException.invalid("offset", "选区行号无效。");
            var debug = grader.debug(courseId, question, body.selection(), "selection", offset);
            var tables = debug.steps().stream().flatMap(step -> step.tables().stream()).toList();
            return new RunResponse(current, Map.of(id, new SchoolLabRunner.RunResult(debug.status(), debug.elapsedMs(), null,
                tables, debug.error() == null ? null : debug.error().raw())));
        }

        long started = System.nanoTime();
        var result = grader.grade(courseId, question, script);
        String status = switch (result.status()) {
            case "graded" -> result.score() == question.points() ? "correct" : result.score() == 0 ? "wrong" : "partial";
            default -> result.status();
        };
        var grade = new ExamStore.Item(ExamCatalog.visible(question, List.of()), List.of(script), result.score(), status,
            question.explanation(), List.of(), List.of(), null, result.checks(), result.error());
        long elapsed = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        var tables = result.checks().stream().filter(check -> check.points() == 5).findFirst()
            .map(ExamSqlRunner.CheckResult::actual).orElse(List.of());
        var output = new SchoolLabRunner.RunResult(status.equals("correct") ? "ok" : status, elapsed, null, tables,
            result.error() == null ? null : result.error().raw());
        var executions = new LinkedHashMap<>(current.executions());
        var previous = executions.get(id);
        if (!status.equals("unavailable") || previous == null || previous.grade() == null || !Objects.equals(previous.sql(), script))
            executions.put(id, new SchoolDraftStore.Execution(script, output, grade));
        return new RunResponse(drafts.save(courseId, lab, body.revision(), scripts, executions), Map.of(id, output));
    }

    @PostMapping("/{courseId}/labs/{labId}/questions/{questionId}/debug")
    ExamSqlRunner.Debug debug(@PathVariable String courseId, @PathVariable String labId,
                              @PathVariable String questionId, @RequestBody LabDebugRequest body) {
        var course = catalog.course(courseId);
        var question = catalog.labChecks(course, catalog.lab(course, labId)).get(questionId);
        if (question == null) throw ApiException.invalid("questionId", "找不到这道 SQL 实验题。");
        String mode = Objects.toString(body.mode(), "");
        if (!Set.of("run", "selection", "trace").contains(mode))
            throw ApiException.invalid("mode", "请选择一种 SQL 调试操作。");
        String sql = Objects.toString(body.sql(), "");
        if (sql.isBlank()) throw ApiException.invalid("sql", "请先输入要运行的 SQL。");
        int offset = body.offset() == null ? 0 : body.offset();
        if (offset < 0 || offset > 8192) throw ApiException.invalid("offset", "选区行号无效。");
        return grader.debug(courseId, question, sql, mode, mode.equals("selection") ? offset : 0);
    }

    record LabSolution(String referenceSql, String explanation) {}

    @GetMapping("/{courseId}/labs/{labId}/questions/{questionId}/solution")
    LabSolution solution(@PathVariable String courseId, @PathVariable String labId, @PathVariable String questionId) {
        var course = catalog.course(courseId);
        var question = catalog.labChecks(course, catalog.lab(course, labId)).get(questionId);
        if (question == null) throw ExamCatalog.missing();
        return new LabSolution(question.referenceSql(), question.explanation());
    }

    @GetMapping("/{courseId}/labs/{labId}/questions/{questionId}/tables")
    ExamSqlRunner.Debug questionTables(@PathVariable String courseId, @PathVariable String labId, @PathVariable String questionId) {
        var course = catalog.course(courseId);
        var question = catalog.labChecks(course, catalog.lab(course, labId)).get(questionId);
        if (question == null) throw ApiException.invalid("questionId", "找不到本题的初始数据。");
        return grader.debug(courseId, question, "", "tables", 0);
    }

    @GetMapping("/{courseId}/schema")
    synchronized SchoolSchema schema(@PathVariable String courseId, @RequestParam(required = false) String database) {
        try {
            return runner.schema(catalog.course(courseId), database);
        } catch (MysqlEnvironment.Failure e) {
            throw environmentFailure(e);
        }
    }

    record NewDatabase(String name) {}

    @GetMapping("/{courseId}/databases")
    synchronized List<String> databases(@PathVariable String courseId) {
        try {
            return runner.databases(catalog.course(courseId));
        } catch (MysqlEnvironment.Failure e) {
            throw environmentFailure(e);
        }
    }

    @PostMapping("/{courseId}/databases")
    synchronized NewDatabase createDatabase(@PathVariable String courseId, @RequestBody NewDatabase request) {
        try {
            runner.createDatabase(catalog.course(courseId), request.name());
            return request;
        } catch (MysqlEnvironment.Failure e) {
            throw environmentFailure(e);
        }
    }

    @PostMapping("/{courseId}/labs/{labId}/reset")
    synchronized Map<String, String> reset(@PathVariable String courseId, @PathVariable String labId, @RequestBody ResetRequest body) {
        var course = catalog.course(courseId);
        catalog.outline(course, labId);
        try {
            runner.reset(course, body.empty());
            return Map.of("message", body.empty() ? "已重置为空练习库。" : "已恢复预置练习数据。");
        } catch (MysqlEnvironment.Failure e) {
            throw environmentFailure(e);
        }
    }

    @GetMapping("/{courseId}/labs/{labId}/export")
    ResponseEntity<String> export(@PathVariable String courseId, @PathVariable String labId,
                                  @RequestParam(defaultValue = "false") boolean preview,
                                  @RequestParam(required = false) String name, @RequestParam(required = false) String number) {
        var details = lab(courseId, labId);
        var identity = new SchoolStudent.Identity(
            reportField(number, details.student().number(), 24), reportField(name, details.student().name(), 60));
        String report = reports.render(details.course(), details.outline(), details.lab(), details.work(), identity);
        var response = ResponseEntity.ok().cacheControl(CacheControl.noStore());
        if (preview) return response.contentType(new MediaType("text", "plain", StandardCharsets.UTF_8)).body(report);
        return response.contentType(new MediaType("application", "msword", StandardCharsets.UTF_8))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                .filename(details.outline().title() + ".doc", StandardCharsets.UTF_8).build().toString())
            .header("X-Content-Type-Options", "nosniff").body("\uFEFF" + report);
    }

    private static String reportField(String value, String fallback, int max) {
        if (value == null) return fallback;
        if (value.length() > max) throw ApiException.invalid("identity", "报告信息过长。");
        return value.strip();
    }

    private static Map<String, String> validate(SchoolCourseCatalog.Lab lab, Map<String, String> input) {
        if (input == null || input.size() > lab.questions().size()) throw ApiException.invalid("drafts", "草稿列表无效。");
        var ids = lab.questions().stream().map(SchoolCourseCatalog.Question::id).toList();
        var output = new LinkedHashMap<String, String>();
        input.forEach((id, text) -> {
            if (!ids.contains(id) || text == null || text.length() > 8192 || text.indexOf(0) >= 0)
                throw ApiException.invalid("drafts", "请保存有效题目，每题最多 8192 字符。");
            if (!text.isBlank()) output.put(id, text);
        });
        return output;
    }

    private static ApiException environmentFailure(MysqlEnvironment.Failure failure) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SCHOOL_MYSQL_UNAVAILABLE", failure.getMessage(), Map.of());
    }
}

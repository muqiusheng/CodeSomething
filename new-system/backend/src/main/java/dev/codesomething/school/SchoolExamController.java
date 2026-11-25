package dev.codesomething.school;

import dev.codesomething.api.ApiException;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/school/courses/{courseId}/exams")
class SchoolExamController {
    record PaperCard(String id, String title, String group, String labId, int count, Integer best, Integer latest, String draftId, int questionCount, int maxScore, Map<String, Long> questionCounts) {}
    record Topic(String tag, String labId, int points, int score, int percent) {}
    record Overview(List<PaperCard> papers, int completed, Integer best, Integer average, long pending, List<Topic> topics,
                    List<ExamStore.Summary> history, String reviewDraft, Map<String, String> labTitles) {}
    record Work(ExamStore.Draft draft, List<ExamCatalog.VisibleQuestion> questions, long serverNow, boolean outdated) {}
    record Start(String mode, int minutes, boolean shuffle, String fromAttempt, List<String> mistakes) {}
    record Save(long revision, Map<String, List<String>> answers, List<String> stars) {}
    record Input(List<String> answer, String mode, int offset) {}
    record Mastery(boolean mastered) {}
    record PaperInfo(String id, String title, List<ExamCatalog.VisibleQuestion> questions, List<ExamStore.Summary> history) {}

    private final ExamCatalog catalog;
    private final ExamStore store;
    private final ExamSqlRunner sql;

    SchoolExamController(ExamCatalog catalog, ExamStore store, ExamSqlRunner sql) {
        this.catalog = catalog;
        this.store = store;
        this.sql = sql;
    }

    @GetMapping
    Overview overview(@PathVariable String courseId) {
        var pack = catalog.pack(courseId);
        var history = store.history(courseId);
        var drafts = store.drafts(courseId).stream().collect(Collectors.toMap(ExamStore.Draft::paperId, ExamStore.Draft::id));
        var cards = pack.papers().stream().map(p -> {
            var runs = history.stream().filter(a -> a.paperId().equals(p.id())).toList();
            var full = runs.stream().filter(a -> a.maxScore() == 100).toList();
            return new PaperCard(p.id(), p.title(), p.group(), p.labId(), runs.size(),
                full.stream().mapToInt(ExamStore.Summary::score).max().stream().boxed().findFirst().orElse(null),
                full.isEmpty() ? null : full.getFirst().score(), drafts.get(p.id()), p.questions().size(),
                p.questions().stream().mapToInt(ExamCatalog.Question::points).sum(),
                p.questions().stream().collect(Collectors.groupingBy(ExamCatalog.Question::kind, Collectors.counting())));
        }).toList();
        var totals = new LinkedHashMap<List<String>, int[]>();
        for (var item : store.latestScoring(courseId)) {
            for (String tag : item.tags()) {
                var values = totals.computeIfAbsent(List.of(tag, item.labId()), key -> new int[2]);
                values[0] += item.points();
                values[1] += item.score();
            }
        }
        var topics = totals.entrySet().stream().map(entry -> {
            var pair = entry.getValue();
            return new Topic(entry.getKey().getFirst(), entry.getKey().getLast(), pair[0], pair[1], pair[1] * 100 / pair[0]);
        }).sorted(Comparator.comparingInt(Topic::percent).thenComparing(Topic::tag)).toList();
        var full = history.stream().filter(a -> a.maxScore() == 100).mapToInt(ExamStore.Summary::score).summaryStatistics();
        return new Overview(cards, (int) cards.stream().filter(c -> c.latest() != null).count(), full.getCount() == 0 ? null : full.getMax(),
            full.getCount() == 0 ? null : (int) Math.round(full.getAverage()), store.mistakes(courseId).stream().filter(m -> !m.mastered()).count(),
            topics, history, drafts.get("mistake-review"), pack.labTitles());
    }

    @GetMapping("/{paperId}")
    PaperInfo paper(@PathVariable String courseId, @PathVariable String paperId) {
        var paper = paperId.equals("mistake-review") ? null : findPaper(catalog.pack(courseId), paperId);
        return new PaperInfo(paperId, paper == null ? "错题组卷重练" : paper.title(),
            paper == null ? List.of() : paper.questions().stream().map(q -> ExamCatalog.visible(q, List.of("A", "B", "C", "D"))).toList(),
            store.history(courseId).stream().filter(a -> a.paperId().equals(paperId)).toList());
    }

    @PostMapping("/{paperId}/start")
    Work start(@PathVariable String courseId, @PathVariable String paperId, @RequestBody Start request) {
        var pack = catalog.pack(courseId);
        var index = pack.questions();
        String title;
        List<ExamCatalog.Question> questions;
        String mode = request.mode();
        if (!"exam".equals(mode) && !"practice".equals(mode)) throw ApiException.invalid("mode", "请选择考场模拟或刷题练习。");
        if (!Set.of(0, 60, 90, 120).contains(request.minutes())) throw ApiException.invalid("minutes", "请选择有效的考试时长。");
        if (paperId.equals("mistake-review")) {
            title = "错题组卷重练";
            mode = "practice";
            if (request.mistakes() == null || request.mistakes().isEmpty() || request.mistakes().size() > 25)
                throw ApiException.invalid("mistakes", "请选择 1–25 道错题。");
            questions = request.mistakes().stream().distinct().map(id -> {
                store.mistake(courseId, id);
                return question(index, id);
            }).sorted(Comparator.comparingInt(q -> kinds().indexOf(q.kind()))).toList();
        } else {
            var paper = findPaper(pack, paperId);
            title = paper.title();
            questions = paper.questions();
            if (request.fromAttempt() != null) {
                var source = store.findAttempt(courseId, request.fromAttempt(), paperId).orElseThrow(ExamCatalog::missing);
                var missed = source.items().stream().filter(i -> i.score() < i.question().points())
                    .map(i -> i.question().id()).collect(Collectors.toSet());
                questions = source.items().stream().map(i -> i.question().id()).filter(missed::contains)
                    .map(index::get).filter(Objects::nonNull).toList();
                if (questions.isEmpty()) throw ApiException.invalid("fromAttempt", "这次交卷没有待重练的题。");
            }
        }
        var order = new LinkedHashMap<String, List<String>>();
        for (var q : questions) if (q.kind().equals("choice")) {
            var options = new ArrayList<>(List.of("A", "B", "C", "D"));
            if (request.shuffle()) Collections.shuffle(options);
            order.put(q.id(), options);
        }
        var versions = new LinkedHashMap<String, Integer>();
        for (var question : questions) {
            var origin = pack.origins().get(question.id());
            versions.put(request.mistakes() != null || request.fromAttempt() != null ? question.id() : origin.id(), origin.version());
        }
        var draft = new ExamStore.Draft(UUID.randomUUID().toString(), paperId, title, mode,
            mode.equals("exam") ? request.minutes() : 0, System.currentTimeMillis(), 0,
            questions.stream().map(ExamCatalog.Question::id).toList(), order, Map.of(), List.of(), versions);
        return view(store.start(courseId, draft), pack);
    }

    @GetMapping("/{paperId}/drafts/{id}")
    Work work(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id) {
        return view(draft(courseId, paperId, id), catalog.pack(courseId));
    }

    @PostMapping("/{paperId}/drafts/{id}/save")
    ExamStore.Draft save(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id, @RequestBody Save body) {
        var draft = draft(courseId, paperId, id);
        var pack = catalog.pack(courseId);
        requireCurrent(draft, pack);
        if (expired(draft)) throw ApiException.invalid("minutes", "已到交卷时间，请提交服务端保存的作答。");
        return store.save(courseId, changed(draft, body, pack.questions(), true));
    }

    @DeleteMapping("/{paperId}/drafts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void abandon(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                 @RequestParam long revision) {
        draft(courseId, paperId, id);
        store.abandon(courseId, paperId, id, revision);
    }

    @PostMapping("/{paperId}/drafts/{id}/submit")
    ExamStore.Attempt submit(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id, @RequestBody Save body) {
        var existing = store.findAttempt(courseId, id, paperId);
        if (existing.isPresent()) return existing.get();
        var draft = draft(courseId, paperId, id);
        var pack = catalog.pack(courseId);
        requireCurrent(draft, pack);
        var index = pack.questions();
        long submitted = System.currentTimeMillis();
        var work = expired(draft) ? draft : changed(draft, body, index, false);
        var items = work.questionIds().stream().map(q -> grade(courseId, question(index, q), work.answers().getOrDefault(q, List.of()),
            work.order().getOrDefault(q, List.of()))).toList();
        var scores = new LinkedHashMap<String, Integer>();
        kinds().forEach(kind -> scores.put(kind, 0));
        items.forEach(item -> scores.merge(item.question().kind(), item.score(), Integer::sum));
        int total = scores.values().stream().mapToInt(Integer::intValue).sum();
        int max = items.stream().mapToInt(item -> item.question().points()).sum();
        long elapsed = Math.max(0, (submitted - work.startedAt()) / 1000);
        if (work.minutes() > 0) elapsed = Math.min(elapsed, work.minutes() * 60L);
        boolean complete = items.stream().noneMatch(item -> item.status().equals("unavailable"));
        String level = !complete ? "SQL 判题待补" : total * 100 >= max * 85 ? "优秀" : total * 100 >= max * 60 ? "及格" : "待提升";
        var summary = new ExamStore.Summary(id, paperId, work.title(), work.mode(), total, max, level, scores, elapsed, submitted, complete);
        try {
            return store.submit(courseId, draft, new ExamStore.Attempt(summary, items), pack.origins());
        } catch (ApiException conflict) {
            return store.findAttempt(courseId, id, paperId).orElseThrow(() -> conflict);
        }
    }

    @GetMapping("/{paperId}/attempts/{id}")
    ExamStore.Attempt report(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id) {
        return store.findAttempt(courseId, id, paperId).orElseThrow(ExamCatalog::missing);
    }

    record Solution(List<String> correct, List<List<String>> acceptedBlanks, String referenceSql, String explanation) {}

    @GetMapping("/{paperId}/drafts/{id}/questions/{questionId}/solution")
    Solution solution(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                      @PathVariable String questionId) {
        var attempt = store.findAttempt(courseId, id, paperId);
        if (attempt.isPresent()) {
            var item = attempt.get().items().stream().filter(question -> question.question().id().equals(questionId))
                .findFirst().orElseThrow(ExamCatalog::missing);
            return new Solution(item.correct(), item.acceptedBlanks(), item.referenceSql(), item.explanation());
        }
        var draft = draft(courseId, paperId, id);
        if (!draft.mode().equals("practice"))
            throw new ApiException(HttpStatus.FORBIDDEN, "EXAM_SOLUTION_FORBIDDEN", "考场模式交卷后可查看答案与解析。", Map.of());
        var question = draftQuestion(courseId, draft, questionId);
        return new Solution(question.answer() == null ? List.of() : List.of(question.answer()),
            question.blanks() == null ? List.of() : question.blanks(), question.referenceSql(), question.explanation());
    }

    @PostMapping("/{paperId}/drafts/{id}/questions/{questionId}/check")
    ExamStore.Item check(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                         @PathVariable String questionId, @RequestBody Input request) {
        var draft = draft(courseId, paperId, id);
        if (!draft.mode().equals("practice")) throw ApiException.invalid("mode", "考场模式交卷后可查看答案与解析。");
        var q = draftQuestion(courseId, draft, questionId);
        return grade(courseId, q, answer(q, request.answer()), draft.order().getOrDefault(questionId, List.of()));
    }

    @PostMapping("/{paperId}/drafts/{id}/questions/{questionId}/debug")
    ExamSqlRunner.Debug debug(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                              @PathVariable String questionId, @RequestBody Input request) {
        var draft = draft(courseId, paperId, id);
        if (expired(draft)) throw ApiException.invalid("minutes", "已到交卷时间。");
        return debug(courseId, draftQuestion(courseId, draft, questionId), request);
    }

    @GetMapping("/mistakes")
    List<ExamStore.Mistake> mistakes(@PathVariable String courseId) {
        return store.mistakes(courseId).stream().sorted(Comparator.comparingInt(ExamStore.Mistake::count).reversed()
            .thenComparing(Comparator.comparingLong(ExamStore.Mistake::updatedAt).reversed())).toList();
    }

    @PostMapping("/mistakes/{questionId}/mastery")
    ExamStore.Mistake mastery(@PathVariable String courseId, @PathVariable String questionId, @RequestBody Mastery request) {
        return store.mastery(courseId, questionId, request.mastered());
    }

    @PostMapping("/mistakes/{questionId}/check")
    ExamStore.Item recheck(@PathVariable String courseId, @PathVariable String questionId, @RequestBody Input request) {
        var item = store.mistake(courseId, questionId).item();
        var result = review(courseId, item, request.answer());
        if (result.score() == item.question().points()) store.mastery(courseId, questionId, true);
        return result;
    }

    @PostMapping("/mistakes/{questionId}/debug")
    ExamSqlRunner.Debug mistakeDebug(@PathVariable String courseId, @PathVariable String questionId, @RequestBody Input request) {
        store.mistake(courseId, questionId);
        return debug(courseId, question(catalog.pack(courseId).questions(), questionId), request);
    }

    @PostMapping("/{paperId}/attempts/{id}/questions/{questionId}/check")
    ExamStore.Item reportCheck(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                               @PathVariable String questionId, @RequestBody Input request) {
        return review(courseId, reportQuestion(courseId, paperId, id, questionId), request.answer());
    }

    @PostMapping("/{paperId}/attempts/{id}/questions/{questionId}/debug")
    ExamSqlRunner.Debug reportDebug(@PathVariable String courseId, @PathVariable String paperId, @PathVariable String id,
                                    @PathVariable String questionId, @RequestBody Input request) {
        var item = reportQuestion(courseId, paperId, id, questionId);
        return debug(courseId, question(catalog.pack(courseId).questions(), item.question().id()), request);
    }

    private ExamStore.Item reportQuestion(String courseId, String paper, String id, String question) {
        return report(courseId, paper, id).items().stream().filter(item -> item.question().id().equals(question)).findFirst()
            .orElseThrow(ExamCatalog::missing);
    }

    private ExamSqlRunner.Debug debug(String course, ExamCatalog.Question q, Input input) {
        if (!q.kind().equals("sql") || input.mode() == null || input.offset() < 0 || input.offset() > 8192)
            throw ApiException.invalid("sql", "无效的 SQL 调试请求。");
        return sql.debug(course, q, first(answer(q, input.answer())), input.mode(), input.offset());
    }

    private ExamStore.Item grade(String course, ExamCatalog.Question q, List<String> values, List<String> order) {
        var graded = q.kind().equals("sql") ? sql.grade(course, q, first(values)) : null;
        int score = graded == null ? ExamRules.objective(q, values) : graded.score();
        String status = graded != null && graded.status().equals("unavailable") ? "unavailable" : resultStatus(score, q.points(), values);
        return new ExamStore.Item(ExamCatalog.visible(q, order), values, score, status, q.explanation(),
            q.answer() == null ? List.of() : List.of(q.answer()), q.blanks() == null ? List.of() : q.blanks(),
            q.referenceSql(), graded == null ? List.of() : graded.checks(), graded == null ? null : graded.error());
    }

    private ExamStore.Item review(String course, ExamStore.Item item, List<String> input) {
        var snapshot = item.question();
        var current = catalog.pack(course).questions().get(snapshot.id());
        var order = snapshot.options().stream().map(ExamCatalog.Option::id).toList();
        if (snapshot.kind().equals("sql")) {
            if (current == null || !current.kind().equals("sql")) throw ExamCatalog.missing();
            return grade(course, current, answer(current, input), order);
        }
        // Keep historical options, prompts, and answer keys together when a pack rewrites a question.
        var values = answer(snapshot.kind(), snapshot.blankCount(), order, input);
        var blanks = current != null && snapshot.kind().equals("blank") && current.kind().equals("blank")
            && Objects.equals(current.prompt(), snapshot.prompt()) && Objects.equals(current.template(), snapshot.template())
            ? current.blanks() : item.acceptedBlanks();
        int score = ExamRules.objective(snapshot.kind(), snapshot.points(), item.correct(), blanks, values);
        return new ExamStore.Item(snapshot, values, score, resultStatus(score, snapshot.points(), values), item.explanation(),
            item.correct(), blanks, item.referenceSql(), item.checks(), item.sqlError());
    }

    private static String resultStatus(int score, int points, List<String> values) {
        return score == points ? "correct" : score > 0 ? "partial" : values.stream().allMatch(String::isBlank) ? "unanswered" : "wrong";
    }

    private static List<String> answer(ExamCatalog.Question q, List<String> values) {
        return answer(q.kind(), q.blanks() == null ? 0 : q.blanks().size(),
            q.options() == null ? List.of() : q.options().keySet(), values);
    }

    private static List<String> answer(String kind, int blanks, Collection<String> options, List<String> values) {
        if (values == null) return List.of();
        int count = kind.equals("blank") ? blanks : 1;
        int max = kind.equals("sql") ? 8192 : 512;
        if (values.size() > count || values.stream().anyMatch(s -> s == null || s.length() > max || s.indexOf(0) >= 0))
            throw ApiException.invalid("answer", "作答格式或长度不符合题目要求。");
        if (!values.isEmpty() && (kind.equals("choice") && !options.contains(values.getFirst())
            || kind.equals("boolean") && !Set.of("true", "false").contains(values.getFirst())))
            throw ApiException.invalid("answer", "请选择题目给出的有效选项。");
        return values;
    }

    private static String first(List<String> values) { return values.isEmpty() ? "" : values.getFirst(); }
    private static List<String> kinds() { return List.of("choice", "boolean", "blank", "sql"); }
    private static boolean expired(ExamStore.Draft draft) {
        return draft.minutes() != 0 && System.currentTimeMillis() >= draft.startedAt() + draft.minutes() * 60_000L;
    }

    private ExamStore.Draft draft(String course, String paper, String id) {
        var draft = store.draft(course, id);
        if (!draft.paperId().equals(paper)) throw ExamCatalog.missing();
        return draft;
    }

    private ExamCatalog.Question draftQuestion(String courseId, ExamStore.Draft draft, String id) {
        if (!draft.questionIds().contains(id)) throw ExamCatalog.missing();
        var pack = catalog.pack(courseId);
        requireCurrent(draft, pack);
        return question(pack.questions(), id);
    }

    private static ExamStore.Draft changed(ExamStore.Draft draft, Save body, Map<String, ExamCatalog.Question> index, boolean revise) {
        if (draft.revision() != body.revision()) throw ExamStore.conflict();
        if (body.answers() == null || body.stars() == null || body.answers().size() > draft.questionIds().size()
            || body.stars().size() > draft.questionIds().size() || !draft.questionIds().containsAll(body.answers().keySet())
            || !draft.questionIds().containsAll(body.stars())) throw ApiException.invalid("answers", "作答中含有不属于本卷的题目。");
        var answers = new LinkedHashMap<String, List<String>>();
        body.answers().forEach((id, values) -> answers.put(id, answer(question(index, id), values)));
        return new ExamStore.Draft(draft.id(), draft.paperId(), draft.title(), draft.mode(), draft.minutes(), draft.startedAt(),
            draft.revision() + (revise ? 1 : 0), draft.questionIds(), draft.order(), answers, body.stars().stream().distinct().toList(),
            draft.paperRevisions());
    }

    private static Work view(ExamStore.Draft draft, ExamCatalog.Pack pack) {
        boolean outdated = outdated(draft, pack);
        var questions = outdated ? List.<ExamCatalog.VisibleQuestion>of() : draft.questionIds().stream()
            .map(id -> ExamCatalog.visible(question(pack.questions(), id), draft.order().getOrDefault(id, List.of()))).toList();
        return new Work(draft, questions, System.currentTimeMillis(), outdated);
    }

    private static boolean outdated(ExamStore.Draft draft, ExamCatalog.Pack pack) {
        var versions = draft.paperRevisions() == null ? Map.<String, Integer>of() : draft.paperRevisions();
        var activePaper = pack.byPaperId().get(draft.paperId());
        if (activePaper != null && !versions.containsKey(draft.questionIds().getFirst())
            && versions.getOrDefault(activePaper.id(), 1) != activePaper.version()) return true;
        return draft.questionIds().stream().anyMatch(id -> {
            var paper = pack.origins().get(id);
            return paper == null || versions.getOrDefault(id, versions.getOrDefault(paper.id(), 1)) != paper.version();
        });
    }

    private static void requireCurrent(ExamStore.Draft draft, ExamCatalog.Pack pack) {
        if (outdated(draft, pack))
            throw new ApiException(HttpStatus.CONFLICT, "SCHOOL_EXAM_PACK_UPDATED", "试卷已更新。复制已保存的作答后，可以放弃旧草稿并重新开始。", Map.of());
    }

    private static ExamCatalog.Question question(Map<String, ExamCatalog.Question> index, String id) {
        var q = index.get(id);
        if (q == null) throw ExamCatalog.missing();
        return q;
    }

    private static ExamCatalog.Paper findPaper(ExamCatalog.Pack pack, String id) {
        var paper = pack.byPaperId().get(id);
        if (paper == null) throw ExamCatalog.missing();
        return paper;
    }
}

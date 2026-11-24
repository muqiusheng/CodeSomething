package dev.codesomething.interactive;

import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
class InteractiveLearningStore {
    static final String HTTP_ONE = "http-01-request-lifecycle";
    static final String HTTP_TWO = "http-02-json-contract";
    static final String HTTP_THREE = "http-03-java-to-endpoint";
    static final String SQL_ONE = "sql-01-visual-where";
    private static final int STEP_XP = 25;
    private static final List<String> HTTP = List.of(HTTP_ONE,HTTP_TWO,HTTP_THREE);
    private static final Map<String,List<String>> TAGS = Map.of(
        HTTP_ONE,List.of("请求与响应","HTTP 报文","路由分支","方法与 Content-Type"),
        HTTP_TWO,List.of("JSON 值类型","JSON 类型契约","JSON 布尔类型","接口到任务卡"),
        HTTP_THREE,List.of("路径命中","响应写出顺序","Java 路由与状态码","响应状态排错"),
        SQL_ONE,List.of("筛选、排序与截取","SQL 子句顺序","LIMIT 与 OFFSET","写入范围"));
    private static final Set<String> SKILLS = Set.of("java","http","sql","boot");
    private static final Map<String,List<String>> CHALLENGES = Map.of(
        "http",List.of("missed","5:boolean","application/json; charset=utf-8"),
        "sql",List.of("completed=0","three","3:where"));

    private final LearningDataSource sources;
    private final JsonMapper json;

    InteractiveLearningStore(LearningDataSource sources, JsonMapper json) {
        this.sources=sources;
        this.json=json;
    }

    record StepRecord(int misses,int hints) {}
    record PlacementData(Map<String,String> background,String goal,List<Boolean> results,String recommendedLessonId) {}
    record Profile(Map<String,String> background,String goal,List<Boolean> results,String recommendedLessonId,
                   String completedAt,String mode,int xp,int streakDays,int bestCombo,int revision) {}
    record Progress(boolean completed,int currentStep,int bestAccuracy,int xp,int bestCombo,int hintsUsed,
                    List<String> mistakes,List<StepRecord> steps,int revision,String updatedAt) {
        boolean finished(int size) { return currentStep==size; }
    }
    record State(Profile profile,Map<String,Progress> progress,Map<String,String> unlocks) {}
    private record Metrics(int accuracy,int combo,int hints,List<String> mistakes) {}

    State state() { return sources.inLearningTransaction(LearningDataSource.owner(),this::read); }

    State onboard(InteractiveLearningController.Placement input) {
        requireMode(input.mode());
        if (input.background()==null || !input.background().keySet().equals(SKILLS)
            || input.background().values().stream().anyMatch(value->!List.of("new","seen","used").contains(Objects.toString(value,"")))
            || !List.of("endpoint","crud").contains(Objects.toString(input.goal(),""))
            || input.results()==null || input.results().size()!=3 || input.results().stream().anyMatch(Objects::isNull))
            throw ApiException.invalid("placement","请选择四项熟悉度和目标，并完成三道快测。");

        return sources.inLearningTransaction(LearningDataSource.owner(),tx->{
            State state=read(tx);
            String recommendation = recommend(input,state);
            var placement=new PlacementData(input.background(),input.goal(),input.results(),recommendation);
            String now=Instant.now().toString();
            tx.update("""
                UPDATE interactive_learner_profile SET placement_json=?, mode=?, completed_at=?, revision=revision+1, updated_at=?
                WHERE singleton=1
                """,json.writeValueAsString(placement),input.mode(),now,now);
            return read(tx);
        });
    }

    State mode(String mode) {
        requireMode(mode);
        return sources.inLearningTransaction(LearningDataSource.owner(),tx->{
            tx.update("UPDATE interactive_learner_profile SET mode=?,revision=revision+1,updated_at=? WHERE singleton=1 AND mode<>?",mode,Instant.now().toString(),mode);
            return read(tx);
        });
    }

    State progress(String id, InteractiveLearningController.ProgressCommand input) {
        var tags=TAGS.get(id);
        if (tags==null) throw unknown("找不到这节互动课。");
        if (input.revision()==null || input.revision()<0 || !List.of("record","restart").contains(Objects.toString(input.action(),"")))
            throw ApiException.invalid("progress","进度版本或操作无效。");
        boolean restart="restart".equals(input.action());
        if (!restart && (input.step()==null || input.passed()==null || input.misses()==null || input.hints()==null
            || input.misses()<0 || input.misses()>10000 || input.hints()<0 || input.hints()>3))
            throw ApiException.invalid("progress","请提交当前步骤的有效记录。");

        return sources.inLearningTransaction(LearningDataSource.owner(),tx->{
            State state=read(tx);
            Progress old=state.progress().getOrDefault(id,new Progress(false,0,0,0,0,0,List.of(),List.of(),0,null));
            String command=json.writeValueAsString(input);
            if (input.revision()!=old.revision()) {
                if (old.revision()==input.revision()+1 && command.equals(
                    tx.queryForObject("SELECT last_command FROM interactive_lesson_progress WHERE lesson_id=?",String.class,id)))
                    return state;
                throw changed();
            }
            if (!available(id,state)) throw new ApiException(HttpStatus.FORBIDDEN,"LESSON_LOCKED","请先完成前置互动课或通过跳级挑战。",Map.of());
            int next=old.currentStep();
            List<StepRecord> records=new ArrayList<>(old.steps());
            if (restart) {
                if (!old.finished(tags.size())) throw changed();
                next=0;
                records.clear();
            } else {
                if (next!=input.step() || next>=tags.size()) throw changed();
                var record=new StepRecord(input.misses(),input.hints());
                if (records.size()>next) {
                    var previous=records.get(next);
                    if (record.misses()<previous.misses() || record.hints()<previous.hints()) throw changed();
                    records.set(next,record);
                } else records.add(record);
                if (input.passed()) next++;
            }
            boolean finished=next==tags.size();
            boolean completed=old.completed()||finished;
            Metrics metrics=measure(records,next,tags);
            int xp=completed?Math.max(old.xp(),tags.size()*STEP_XP):0;
            String now=Instant.now().toString();
            tx.update("""
                INSERT INTO interactive_lesson_progress
                    (lesson_id,completed,current_step,best_accuracy,xp,best_combo,hints_used,mistake_tags_json,steps_json,revision,last_command,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(lesson_id) DO UPDATE SET completed=excluded.completed,current_step=excluded.current_step,
                    best_accuracy=excluded.best_accuracy,xp=excluded.xp,best_combo=excluded.best_combo,hints_used=excluded.hints_used,
                    mistake_tags_json=excluded.mistake_tags_json,steps_json=excluded.steps_json,revision=excluded.revision,
                    last_command=excluded.last_command,updated_at=excluded.updated_at
                """,id,completed?1:0,next,Math.max(old.bestAccuracy(),finished?metrics.accuracy():0),xp,
                Math.max(old.bestCombo(),metrics.combo()),metrics.hints(),json.writeValueAsString(metrics.mistakes()),
                json.writeValueAsString(records),old.revision()+1,command,now);
            if (xp>old.xp() || metrics.combo()>state.profile().bestCombo()) updateProfile(tx,state.profile(),xp-old.xp(),metrics.combo(),now);
            if (finished && HTTP.contains(id) && HTTP.stream().allMatch(lesson->lesson.equals(id)||passed(state,lesson)))
                unlock(tx,"http","completed",now);
            if (finished && id.equals(SQL_ONE)) unlock(tx,"sql","completed",now);
            return read(tx);
        });
    }

    State skip(String module,List<String> answers) {
        var key=CHALLENGES.get(module);
        if (key==null) throw unknown("找不到这个跳级挑战。");
        if (answers.size()!=3 || answers.stream().anyMatch(item->item==null || item.length()>160))
            throw ApiException.invalid("answers","请提交三道挑战题的有效答案。");
        var given=new ArrayList<>(answers);
        if (module.equals("sql")) given.set(0,given.getFirst().strip().replaceAll("\\s+","").toLowerCase(Locale.ROOT));
        if (module.equals("http")) given.set(2,given.get(2).strip());
        if (!key.equals(given))
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"CHALLENGE_INCOMPLETE","三题全对才能解锁。请重新完成挑战。",Map.of());
        return sources.inLearningTransaction(LearningDataSource.owner(),tx->{
            unlock(tx,module,"skip_quiz",Instant.now().toString());
            return read(tx);
        });
    }

    private State read(JdbcTemplate tx) {
        Profile profile=tx.queryForObject("SELECT * FROM interactive_learner_profile WHERE singleton=1",(rs,row)->{
            var p=json.readValue(rs.getString("placement_json"),PlacementData.class);
            int streak=rs.getInt("streak_days");
            String day=rs.getString("last_award_day");
            if (day==null || LocalDate.parse(day).isBefore(today().minusDays(1))) streak=0;
            return new Profile(p.background()==null?Map.of():p.background(),p.goal(),p.results()==null?List.of():p.results(),
                p.recommendedLessonId()==null?HTTP_ONE:p.recommendedLessonId(),rs.getString("completed_at"),rs.getString("mode"),
                rs.getInt("xp"),streak,rs.getInt("best_combo"),rs.getInt("revision"));
        });
        Map<String,Progress> progress=new LinkedHashMap<>();
        tx.query("SELECT * FROM interactive_lesson_progress ORDER BY lesson_id",rs->{
            progress.put(rs.getString("lesson_id"),new Progress(rs.getBoolean("completed"),rs.getInt("current_step"),
                rs.getInt("best_accuracy"),rs.getInt("xp"),rs.getInt("best_combo"),rs.getInt("hints_used"),
                List.of(json.readValue(rs.getString("mistake_tags_json"),String[].class)),
                List.of(json.readValue(rs.getString("steps_json"),StepRecord[].class)),
                rs.getInt("revision"),rs.getString("updated_at")));
        });
        Map<String,String> unlocks=new LinkedHashMap<>();
        tx.query("SELECT module_id,reason FROM interactive_module_unlocks ORDER BY module_id",rs->{
            unlocks.put(rs.getString(1),rs.getString(2));
        });
        return new State(profile,progress,unlocks);
    }

    private static Metrics measure(List<StepRecord> records,int next,List<String> tags) {
        int chain=0, best=0, firstTries=0, hints=0;
        List<String> mistakes=new ArrayList<>();
        for(int i=0;i<records.size();i++) {
            var record=records.get(i);
            hints+=record.hints();
            if(record.misses()>0) mistakes.add(tags.get(i));
            if(i==next) continue;
            if(record.misses()==0) { chain++; firstTries++; }
            else chain=0;
            best=Math.max(best,chain);
        }
        return new Metrics(next==0?0:Math.round(firstTries*100f/next),best,hints,mistakes);
    }

    private static LocalDate today() { return LocalDate.now(ZoneId.of("Asia/Shanghai")); }

    private static void updateProfile(JdbcTemplate tx,Profile profile,int delta,int combo,String now) {
        String today=today().toString();
        String last=tx.queryForObject("SELECT last_award_day FROM interactive_learner_profile WHERE singleton=1",String.class);
        int streak=profile.streakDays();
        if (delta>0 && !today.equals(last)) streak++;
        tx.update("""
            UPDATE interactive_learner_profile SET xp=xp+?,best_combo=max(best_combo,?),streak_days=?,
                last_award_day=?,revision=revision+1,updated_at=? WHERE singleton=1
            """,delta,combo,streak,delta>0?today:last,now);
    }

    private static void unlock(JdbcTemplate tx,String module,String reason,String now) {
        tx.update("INSERT INTO interactive_module_unlocks VALUES (?,?,?) ON CONFLICT(module_id) DO NOTHING",module,reason,now);
    }

    private static String recommend(InteractiveLearningController.Placement input,State state) {
        if ("crud".equals(input.goal()) && input.results().get(0) && input.results().get(1)
            && !"new".equals(input.background().get("http"))
            && ("open".equals(input.mode()) || !state.unlocks().isEmpty() && (state.unlocks().containsKey("http")||state.unlocks().containsKey("sql"))))
            return SQL_ONE;
        return HTTP.stream().filter(id->!passed(state,id)).findFirst().orElse(SQL_ONE);
    }

    private static boolean passed(State state,String id) {
        Progress progress=state.progress().get(id);
        return progress!=null && progress.completed();
    }

    private static boolean available(String id,State state) {
        if ("open".equals(state.profile().mode()) || passed(state,id)) return true;
        if (id.equals(SQL_ONE)) return state.unlocks().containsKey("sql")||state.unlocks().containsKey("http");
        int index=HTTP.indexOf(id);
        return state.unlocks().containsKey("http") || index==0 || passed(state,HTTP.get(index-1));
    }

    private static void requireMode(String mode) {
        if (!List.of("guided","open").contains(Objects.toString(mode,"")))
            throw ApiException.invalid("mode","请选择循序渐进或自由探索。");
    }

    private static ApiException unknown(String message) {
        return new ApiException(HttpStatus.NOT_FOUND,"INTERACTIVE_NOT_FOUND",message,Map.of());
    }

    private static ApiException changed() {
        return new ApiException(HttpStatus.CONFLICT,"PROGRESS_CHANGED","这节课的保存位置已变化。请重新读取进度。",Map.of());
    }
}

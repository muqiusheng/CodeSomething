package dev.codesomething.admin;

import dev.codesomething.api.ApiException;
import dev.codesomething.auth.*;
import dev.codesomething.storage.LearningDataSource;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@ConditionalOnProperty(name="cs.public",havingValue="true")
public class QuestionBankController {
    private static final Set<String> TOPICS=Set.of("http","sql","boot","projects");
    private static final Set<String> STATES=Set.of("draft","published","archived");
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final AuthService auth;
    private final JsonMapper json;

    public QuestionBankController(LearningDataSource storage,AuthService auth,JsonMapper json) {
        jdbc=new JdbcTemplate(storage.primary());
        transactions=new TransactionTemplate(new JdbcTransactionManager(storage.primary()));
        this.auth=auth;this.json=json;
    }

    public record Write(String topic,String prompt,List<String> options,int answer,String explanation,String status,long revision) {}
    public record Answer(long revision,int option) {}
    public record Question(String id,String topic,String prompt,List<String> options,int answer,String explanation,String status,long revision) {}
    public record Practice(String id,String topic,String prompt,List<String> options,long revision) {}

    public record QuestionPage(List<Question> items,int page,int size,int total) {}

    @GetMapping("/api/v1/admin/questions")
    QuestionPage questions(@RequestParam(defaultValue="") String topic,@RequestParam(defaultValue="") String status,
                           @RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="1") int page,
                           @RequestParam(defaultValue="20") int size) {
        if(page<1 || size<1 || size>100) throw ApiException.invalid("page","分页范围无效。");
        if(keyword.length()>1000) throw ApiException.invalid("keyword","检索词过长。");
        String where = """
             FROM supplemental_questions WHERE (?='' OR topic=?) AND (?='' OR status=?)
                AND instr(lower(prompt),lower(?))>0
            """;
        int total=jdbc.queryForObject("SELECT count(*)"+where,Integer.class,topic,topic,status,status,keyword);
        var items=jdbc.query("SELECT *"+where+" ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",
            this::read,topic,topic,status,status,keyword,size,(page-1L)*size);
        return new QuestionPage(items,page,size,total);
    }

    @PostMapping("/api/v1/admin/questions")
    Question create(@RequestBody Write input,HttpServletRequest request) {
        var write=validate(input);
        String id=UUID.randomUUID().toString();
        return transactions.execute(status -> {
            jdbc.update("INSERT INTO supplemental_questions VALUES(?,?,?,?,?,?,?,1,?)",id,write.topic(),write.prompt(),
                json.writeValueAsString(write.options()),write.answer(),write.explanation(),write.status(),Instant.now().toString());
            audit(request,id,"question_created",write.status());
            return require(id,false);
        });
    }

    @PatchMapping("/api/v1/admin/questions/{id}")
    Question update(@PathVariable String id,@RequestBody Write input,HttpServletRequest request) {
        var write=validate(input);
        return transactions.execute(status -> {
            require(id,false);
            if(jdbc.update("""
                UPDATE supplemental_questions SET topic=?,prompt=?,options=?,answer=?,explanation=?,status=?,
                    revision=revision+1,updated_at=? WHERE id=? AND revision=?
                """,write.topic(),write.prompt(),json.writeValueAsString(write.options()),write.answer(),
                write.explanation(),write.status(),Instant.now().toString(),id,write.revision())!=1) throw stale();
            audit(request,id,"question_updated",write.status());
            return require(id,false);
        });
    }

    @GetMapping("/api/v1/reviews/supplemental")
    List<Practice> practice(@RequestParam(defaultValue="") String topic,@RequestParam(defaultValue="0") int offset) {
        if(offset<0 || offset>100000) throw ApiException.invalid("offset","分页范围无效。");
        return jdbc.query("""
            SELECT id,topic,prompt,options,revision FROM supplemental_questions WHERE status='published' AND (?='' OR topic=?)
            ORDER BY updated_at DESC,id LIMIT 20 OFFSET ?
            """,(row,index)->new Practice(row.getString("id"),row.getString("topic"),row.getString("prompt"),
                options(row.getString("options")),row.getLong("revision")),topic,topic,offset);
    }

    @PostMapping("/api/v1/reviews/supplemental/{id}/answer")
    Map<String,Object> answer(@PathVariable String id,@RequestBody Answer input) {
        var question=require(id,true);
        if(question.revision()!=input.revision()) throw stale();
        if(input.option()<0 || input.option()>=question.options().size()) throw ApiException.invalid("option","请选择有效选项。");
        return Map.of("correct",question.answer()==input.option(),"answer",question.answer(),"explanation",question.explanation());
    }

    private Question require(String id,boolean published) {
        return jdbc.query("SELECT * FROM supplemental_questions WHERE id=?",this::read,id).stream()
            .filter(question -> !published || question.status().equals("published")).findFirst()
            .orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"QUESTION_NOT_FOUND","题目不存在或尚未发布。",Map.of()));
    }

    private Question read(java.sql.ResultSet row,int index) throws java.sql.SQLException {
        return new Question(row.getString("id"),row.getString("topic"),row.getString("prompt"),options(row.getString("options")),
            row.getInt("answer"),row.getString("explanation"),row.getString("status"),row.getLong("revision"));
    }

    private List<String> options(String value) { return Arrays.asList(json.readValue(value,String[].class)); }

    private static Write validate(Write write) {
        if(!TOPICS.contains(Objects.toString(write.topic(),""))) throw ApiException.invalid("topic","请选择有效主题。");
        if(!STATES.contains(Objects.toString(write.status(),""))) throw ApiException.invalid("status","请选择有效状态。");
        if(write.options()==null || write.options().size()<2 || write.options().size()>6
            || write.answer()<0 || write.answer()>=write.options().size())
            throw ApiException.invalid("options","请填写2到6个选项，并指定正确答案。");
        var options=write.options().stream().map(value->text(value,"options",240)).toList();
        if(new HashSet<>(options).size()!=options.size()) throw ApiException.invalid("options","选项内容须各不相同。");
        return new Write(write.topic(),text(write.prompt(),"prompt",1000),options,write.answer(),
            text(write.explanation(),"explanation",2000),write.status(),write.revision());
    }

    private static String text(String value,String field,int max) {
        if(value==null || value.isBlank() || value.length()>max || value.indexOf(0)>=0)
            throw ApiException.invalid(field,"请填写内容，最多 "+max+" 字符。");
        return value.strip();
    }

    private void audit(HttpServletRequest request,String id,String action,String status) {
        auth.audit(AuthController.principal(request).user().userId(),action,"question",id,status,request.getRemoteAddr());
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT,"QUESTION_CHANGED","题目已更新，请刷新后重试。",Map.of());
    }
}

package dev.codesomething.school;

import dev.codesomething.admin.RunnerInventory;
import dev.codesomething.api.ApiException;
import dev.codesomething.storage.LearningDataSource;
import dev.codesomething.sql.MysqlEnvironment;
import java.io.OutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AdminSchoolService {
    public record Progress(String courseId,String labId,String title,int completed,int required) {}
    public record LabDefinition(String courseId,String labId,String title,int required) {}
    public record PaperDefinition(String courseId,String paperId,String title) {}
    public record Completion(int required,int optional) {}
    public record QuestionProgress(String id,String title,boolean optional,boolean completed,String sql,String status) {}
    public record Course(String id,String title) {}
    private final LearningDataSource storage;
    private final SchoolCourseCatalog catalog;
    private final SchoolDraftStore drafts;
    private final SchoolLabRunner runner;
    private final SchoolReportService reports;
    private final JsonMapper json;
    private final ExamCatalog exams;
    private long catalogExpiresAt;
    private List<LabDefinition> labDefinitions=List.of();
    private List<PaperDefinition> paperDefinitions=List.of();

    AdminSchoolService(LearningDataSource storage, SchoolCourseCatalog catalog, SchoolDraftStore drafts,
                       SchoolLabRunner runner, SchoolReportService reports, JsonMapper json, ExamCatalog exams) {
        this.storage=storage;this.catalog=catalog;this.drafts=drafts;this.runner=runner;this.reports=reports;
        this.json=json;this.exams=exams;
    }

    public List<Course> courses() {
        return catalog.courses().stream().map(course->new Course(course.id(),course.title())).toList();
    }

    private synchronized void refreshDefinitions() {
        long now=System.nanoTime();
        if (catalogExpiresAt!=0 && now-catalogExpiresAt<0) return;
        var courses=catalog.courses();
        var labs=courses.stream().flatMap(course->course.labs().stream().map(outline->
            new LabDefinition(course.id(),outline.id(),outline.title(),
                (int)catalog.lab(course,outline.id()).questions().stream().filter(q->!q.optional()).count()))).toList();
        var papers=courses.stream().flatMap(course->exams.papers(course.id()).stream()
            .map(paper->new PaperDefinition(course.id(),paper.id(),paper.title()))).toList();
        labDefinitions=labs;
        paperDefinitions=papers;
        catalogExpiresAt=now+java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
    }

    public synchronized List<LabDefinition> labs() { refreshDefinitions();return labDefinitions; }
    public synchronized List<PaperDefinition> papers() { refreshDefinitions();return paperDefinitions; }

    public Completion completion(String courseId,String labId,String payload) {
        var course=catalog.courses().stream().filter(c->c.id().equals(courseId)).findFirst().orElse(null);
        if (course==null || course.labs().stream().noneMatch(lab->lab.id().equals(labId))) return new Completion(0,0);
        var lab=catalog.lab(course,labId);
        // Read only progress evidence. Older drafts can predate the current result DTO.
        var work=json.readTree(payload);
        boolean grading=catalog.hasLabChecks(course,lab);
        int required=0,optional=0;
        for (var question:lab.questions()) {
            var sql=work.path("drafts").path(question.id());
            var execution=work.path("executions").path(question.id());
            if (!sql.isString() || !sql.equals(execution.path("sql"))) continue;
            var grade=execution.path("grade");
            boolean hasGrade=grade.isObject();
            if (hasGrade && question.gradingRevision()!=null &&
                !question.gradingId(lab.id()).equals(grade.path("question").path("id").asText())) continue;
            if (grading ? !hasGrade || !"correct".equals(grade.path("status").asText()) :
                !"ok".equals(execution.path("result").path("status").asText())) continue;
            if (question.optional()) optional++; else required++;
        }
        return new Completion(required,optional);
    }

    public List<QuestionProgress> questions(String owner,String courseId,String labId) {
        var course=catalog.course(courseId);
        var lab=catalog.lab(course,labId);
        boolean grading=catalog.hasLabChecks(course,lab);
        try (var scope=LearningDataSource.asOwner(owner)) {
            var work=storage.exists(owner) ? drafts.read(courseId,lab) : new SchoolDraftStore.Draft(0,Map.of(),Map.of());
            return lab.questions().stream().map(question->{
                String id=question.id();
                var execution=work.executions().get(id);
                return new QuestionProgress(id,question.title(),question.optional(),completed(work,id,grading),
                    work.drafts().getOrDefault(id,""),execution==null?(work.drafts().containsKey(id)?"in_progress":"unstarted"):execution.grade()==null
                        ? execution.result().status():execution.grade().status());
            }).toList();
        }
    }

    private static boolean completed(SchoolDraftStore.Draft work,String id,boolean grading) {
        var execution=work.executions().get(id);
        return execution!=null && execution.completed(grading) && Objects.equals(execution.sql(),work.drafts().get(id));
    }

    public List<Progress> progress(String id) {
        if (!storage.exists(id)) return List.of();
        var result=new ArrayList<Progress>();
        try(var scope=LearningDataSource.asOwner(id)) {
            for(var course:catalog.courses()) for(var outline:course.labs()) {
                var work=drafts.read(course.id(),outline.id());
                if(work.revision()==0) continue;
                var lab=catalog.lab(course,outline.id());
                result.add(progress(course,outline,lab,SchoolDraftStore.visible(work,lab)));
            }
        }
        return result;
    }

    private Progress progress(SchoolCourseCatalog.Course course, SchoolCourseCatalog.LabOutline outline,
                                     SchoolCourseCatalog.Lab lab, SchoolDraftStore.Draft work) {
        int required=0,completed=0;
        boolean grading=catalog.hasLabChecks(course,lab);
        for(var question:lab.questions()) {
            if(question.optional()) continue;
            required++;
            if(completed(work,question.id(),grading)) completed++;
        }
        return new Progress(course.id(),outline.id(),outline.title(),completed,required);
    }

    public void reset(String id,String courseId) {
        try(var scope=LearningDataSource.asOwner(id)) {
            runner.reset(catalog.course(courseId),false);
        } catch(MysqlEnvironment.Failure error) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"SCHOOL_MYSQL_UNAVAILABLE",error.getMessage(),Map.of());
        }
    }

    public Set<String> schoolContainers(List<String> owners) {
        return new HashSet<>(schoolContainerOwners(owners).keySet());
    }

    public Map<String,String> schoolContainerOwners(List<String> owners) {
        var names=new HashMap<String,String>();
        for(String id:owners) try(var scope=LearningDataSource.asOwner(id)) {
            for(var course:catalog.courses()) if("mysql".equals(course.engine())) names.put(runner.activeContainer(course),id);
        }
        return names;
    }

    public void validateExport(String courseId,String format,String labId) {
        if (format==null || !Set.of("word","markdown").contains(format)) throw ApiException.invalid("format","请选择 Word 或 Markdown。");
        var course=catalog.course(courseId);
        if (!labId.isBlank()) catalog.lab(course,labId);
    }

    public void export(String courseId,String format,String labId,List<String> owners,OutputStream output) throws IOException {
        var course=catalog.course(courseId);
        long uncompressed=0;
        try(var zip=new ZipOutputStream(output,StandardCharsets.UTF_8)) {
            for(String id:owners) try(var scope=LearningDataSource.asOwner(id)) {
                if (Thread.currentThread().isInterrupted()) throw new IOException("Export interrupted");
                for(var outline:course.labs()) {
                    if (!labId.isBlank() && !labId.equals(outline.id())) continue;
                    var lab=catalog.lab(course,outline.id());
                    var work=drafts.read(course.id(),lab);
                    var evidence=progress(course,outline,lab,work);
                    if(evidence.required()==0 || evidence.required()!=evidence.completed()) continue;
                    String content=format.equals("word")
                        ? "\uFEFF"+reports.render(course,outline,lab,work,new SchoolStudent.Identity("",id))
                        : reports.markdown(course,outline,lab,work);
                    byte[] bytes=content.getBytes(StandardCharsets.UTF_8);
                    uncompressed+=bytes.length;
                    if(uncompressed>32L*1024*1024) throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE,"REPORT_ARCHIVE_TOO_LARGE","报告归档超过32 MiB。",Map.of());
                    zip.putNextEntry(new ZipEntry(id+"/"+outline.id()+(format.equals("word")?".doc":".md")));
                    zip.write(bytes);
                    zip.closeEntry();
                }
            }
        }
    }
}

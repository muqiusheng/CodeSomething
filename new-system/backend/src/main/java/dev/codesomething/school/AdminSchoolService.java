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

@Service
public class AdminSchoolService {
    public record Progress(String courseId,String labId,String title,int completed,int required) {}
    public record Course(String id,String title) {}
    private final LearningDataSource storage;
    private final SchoolCourseCatalog catalog;
    private final SchoolDraftStore drafts;
    private final SchoolLabRunner runner;
    private final SchoolReportService reports;

    AdminSchoolService(LearningDataSource storage, SchoolCourseCatalog catalog, SchoolDraftStore drafts,
                       SchoolLabRunner runner, SchoolReportService reports) {
        this.storage=storage;this.catalog=catalog;this.drafts=drafts;this.runner=runner;this.reports=reports;
    }

    public List<Course> courses() {
        return catalog.courses().stream().map(course->new Course(course.id(),course.title())).toList();
    }

    public List<Progress> progress(String id) {
        if (!storage.exists(id)) return List.of();
        var result=new ArrayList<Progress>();
        try(var scope=LearningDataSource.asOwner(id)) {
            for(var course:catalog.courses()) for(var outline:course.labs()) {
                var work=drafts.read(course.id(),outline.id());
                if(work.revision()==0) continue;
                result.add(progress(course,outline,catalog.lab(course,outline.id()),work));
            }
        }
        return result;
    }

    private static Progress progress(SchoolCourseCatalog.Course course, SchoolCourseCatalog.LabOutline outline,
                                     SchoolCourseCatalog.Lab lab, SchoolDraftStore.Draft work) {
        int required=0,completed=0;
        for(var question:lab.questions()) {
            if(question.optional()) continue;
            required++;
            var execution=work.executions().get(question.id());
            if(execution!=null && "ok".equals(execution.result().status()) && execution.sql().equals(work.drafts().get(question.id()))) completed++;
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
        var names=new HashSet<String>();
        for(String id:owners) try(var scope=LearningDataSource.asOwner(id)) {
            for(var course:catalog.courses()) if("mysql".equals(course.engine())) names.add(runner.activeContainer(course));
        }
        return names;
    }

    public void validateExport(String courseId,String format) {
        if (format==null || !Set.of("word","markdown").contains(format)) throw ApiException.invalid("format","请选择 Word 或 Markdown。");
        catalog.course(courseId);
    }

    public void export(String courseId,String format,List<String> owners,OutputStream output) throws IOException {
        var course=catalog.course(courseId);
        long uncompressed=0;
        try(var zip=new ZipOutputStream(output,StandardCharsets.UTF_8)) {
            for(String id:owners) try(var scope=LearningDataSource.asOwner(id)) {
                if (Thread.currentThread().isInterrupted()) throw new IOException("Export interrupted");
                for(var outline:course.labs()) {
                    var lab=catalog.lab(course,outline.id());
                    var work=drafts.read(course.id(),outline.id());
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

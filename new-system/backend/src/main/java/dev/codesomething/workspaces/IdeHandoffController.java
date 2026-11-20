package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;

/** Explicit IDE-to-browser transfer. Secrets exist only in bounded, expiring memory. */
@RestController
@RequestMapping("/api/v1/ide-handoffs")
public class IdeHandoffController {
    private final WorkspaceController workspaces;
    private final SubmissionController submissions;
    private final CheckJobController jobs;
    private final Map<String, Pending> pending = new HashMap<>();
    public IdeHandoffController(WorkspaceController workspaces, SubmissionController submissions, CheckJobController jobs) {
        this.workspaces=workspaces;this.submissions=submissions;this.jobs=jobs;
    }
    public record Create(String bindingId,String jobId) {}
    public record Consume(String code) {}
    public record Ticket(String code,String expiresAt) {}
    public record Received(WorkspaceController.Paired binding,String courseId,String courseVersion,String stageId,String submissionId,String jobId) {}
    private record Pending(Received received,Instant expiry) {}
    @PostMapping(consumes="application/json")
    public synchronized Ticket create(@RequestBody Create write,@RequestHeader(value="Authorization",required=false) String authorization,HttpServletResponse response) {
        response.setHeader("Cache-Control","no-store");
        var binding=workspaces.authorize(write.bindingId(),authorization);
        var job=jobs.read(write.jobId(),authorization);
        var submission=submissions.read(job.submissionId(),authorization);
        if(!binding.id().equals(submission.bindingId()))throw ApiException.invalid("jobId","检查作业不属于当前配对。");
        Instant now=Instant.now();
        pending.values().removeIf(p->p.expiry().isBefore(now)||p.received().binding().id().equals(binding.id()));
        if(pending.size()>=64)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"HANDOFF_BUSY","网页交接繁忙，请稍后重试。",Map.of());
        String code=UUID.randomUUID()+"-"+UUID.randomUUID();Instant expiry=now.plusSeconds(60);
        var received=new Received(new WorkspaceController.Paired(binding.id(),binding.directory(),authorization.substring(7)),
            submission.courseId(),submission.courseVersion(),submission.stageId(),submission.id(),job.id());
        pending.put(WorkspaceController.hash(code),new Pending(received,expiry));
        return new Ticket(code,expiry.toString());
    }
    @PostMapping(value="/consume",consumes="application/json")
    public synchronized Received consume(@RequestBody Consume write,HttpServletResponse response) {
        response.setHeader("Cache-Control","no-store");
        if(write.code()==null||write.code().length()>100)throw ApiException.invalid("code","请从IDE重新打开报告。");
        var item=pending.remove(WorkspaceController.hash(write.code()));
        pending.values().removeIf(p->p.expiry().isBefore(Instant.now()));
        if(item==null||!item.expiry().isAfter(Instant.now()))throw new ApiException(HttpStatus.CONFLICT,"HANDOFF_EXPIRED","网页交接已失效，请从IDE重新打开报告。",Map.of());
        workspaces.authorize(item.received().binding().id(),"Bearer "+item.received().binding().token());
        return item.received();
    }
}

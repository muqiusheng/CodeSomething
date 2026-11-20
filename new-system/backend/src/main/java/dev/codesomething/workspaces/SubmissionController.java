package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/submissions")
@DependsOn("flyway")
public class SubmissionController {
    private final JdbcTemplate jdbc;
    private final WorkspaceController workspaces;
    public SubmissionController(JdbcTemplate jdbc,WorkspaceController workspaces) {this.jdbc=jdbc;this.workspaces=workspaces;}
    public record SubmissionWrite(String bindingId,String expectedDigest) {}
    public record Submission(String id,String bindingId,String courseId,String courseVersion,String stageId,String digest,String source,String createdAt) {}
    @PostMapping(consumes="application/json")
    @Transactional
    public Submission save(@RequestBody SubmissionWrite write,@RequestHeader(value="Authorization",required=false) String authorization) {
        var binding=workspaces.authorize(write.bindingId(),authorization);
        var capture=workspaces.capture(binding.directory(),binding.courseId(),binding.stageId());
        if(!capture.digest().equals(write.expectedDigest())) throw new ApiException(HttpStatus.CONFLICT,"SNAPSHOT_CHANGED","代码已变更，请重新预览后保存快照。",Map.of());
        String id=UUID.randomUUID().toString(), now=Instant.now().toString();
        jdbc.update("INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)",id,binding.id(),binding.courseId(),binding.courseVersion(),binding.stageId(),capture.digest(),capture.bytes(),now);
        return read(id,authorization);
    }
    @GetMapping("/{id}")
    public Submission read(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization) {
        if(authorization==null) throw new ApiException(HttpStatus.UNAUTHORIZED,"PAIRING_REQUIRED","请先配对本地目录。",Map.of());
        var rows=jdbc.query("SELECT id,binding_id,course_id,course_version,stage_id,digest,source,created_at FROM submissions WHERE id=?",(r,n)->new Submission(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6),new String(r.getBytes(7),StandardCharsets.UTF_8),r.getString(8)),id);
        if(rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"SUBMISSION_NOT_FOUND","提交记录不存在。",Map.of());
        var result=rows.getFirst();workspaces.authorize(result.bindingId(),authorization);return result;
    }
}

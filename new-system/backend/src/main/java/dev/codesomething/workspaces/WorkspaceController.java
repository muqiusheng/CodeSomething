package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import dev.codesomething.courses.CourseController;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.DependsOn;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@DependsOn("flyway")
public class WorkspaceController {
    private final JdbcTemplate jdbc;
    private final CourseController courses;
    @org.springframework.beans.factory.annotation.Value("${cs.runner.mode:local_first}") private String runnerMode;
    public WorkspaceController(JdbcTemplate jdbc, CourseController courses) { this.jdbc=jdbc; this.courses=courses; }
    public record PreviewWrite(String directory, String courseId, String courseVersion, String stageId) {}
    public record PairWrite(String previewId, String pairingCode) {}
    public record FileEntry(String path, int bytes, String sha256) {}
    public record Preview(String id, String directory, String digest, List<FileEntry> files, String pairingCode, String expiresAt) {}
    public record Binding(String id, String directory, String courseId, String courseVersion, String stageId, String tokenHash) {}
    public record Paired(String id, String directory, String token) {}
    public record Captured(byte[] bytes, String digest, List<FileEntry> files) {}

    public static String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    static String hash(String value) { return hash(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    private static boolean secretEquals(String expected, String actual) { return actual != null && MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.UTF_8), hash(actual).getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    private static ApiException error(HttpStatus status, String code, String message) { return new ApiException(status,code,message,Map.of()); }

    public Captured capture(String directory) {
        requireLocal();
        if (directory == null || directory.isBlank() || directory.length()>1024) throw ApiException.invalid("directory", "请输入练习目录的绝对路径。");
        try {
            Path root = Path.of(directory).normalize();
            if (!root.isAbsolute() || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS) || !root.toRealPath().equals(root))
                throw ApiException.invalid("directory", "请选择真实目录，不能使用相对路径、符号链接或目录联接。");
            Path source=root.resolve("TaskServer.java");
            if (!Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS) || !source.toRealPath().equals(source))
                throw ApiException.invalid("directory", "目录内需要一个普通文件TaskServer.java，不支持文件链接。");
            // Fixed allowlist: no directory traversal, recursive scan or learner-supplied build scripts.
            try (SeekableByteChannel channel=Files.newByteChannel(source,Set.of(StandardOpenOption.READ,LinkOption.NOFOLLOW_LINKS))) {
                if(channel.size()>65536) throw ApiException.invalid("directory","TaskServer.java不能超过64KiB。");
                ByteBuffer buffer=ByteBuffer.allocate(65537);
                while (buffer.hasRemaining() && channel.read(buffer)!=-1) { }
                if(buffer.position()>65536) throw ApiException.invalid("directory","TaskServer.java不能超过64KiB。");
                byte[] bytes=Arrays.copyOf(buffer.array(),buffer.position());
                String digest=hash(bytes);
                return new Captured(bytes,digest,List.of(new FileEntry("TaskServer.java",bytes.length,digest)));
            }
        } catch (IOException | InvalidPathException | SecurityException e) { throw ApiException.invalid("directory", "无法读取练习文件，请检查目录和读取权限。"); }
    }
    public Captured capture(String directory,String course,String stage) {
        if(directory!=null&&directory.startsWith("browser:")) {
            var rows=jdbc.queryForList("SELECT files FROM browser_workspaces WHERE binding_id=?",directory.substring(8));
            if(rows.isEmpty())throw ApiException.invalid("directory","网页草稿不存在，请重新打开工作区。");
            String encoded=(String)rows.getFirst().get("files");
            var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
            var files=Arrays.asList(mapper.readValue(encoded,dev.codesomething.boot.BootProjectSnapshot.Source[].class));
            if(!dev.codesomething.boot.BootCourses.supports(course)) {
                byte[] bytes=files.getFirst().content().getBytes(java.nio.charset.StandardCharsets.UTF_8);String digest=hash(bytes);
                return new Captured(bytes,digest,List.of(new FileEntry("TaskServer.java",bytes.length,digest)));
            }
            var snapshot=dev.codesomething.boot.BootProjectSnapshot.restore(encoded);
            return new Captured(encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8),snapshot.digest(),files.stream().map(f->new FileEntry(f.path(),f.content().getBytes(java.nio.charset.StandardCharsets.UTF_8).length,hash(f.content()))).toList());
        }
        requireLocal();
        if(!dev.codesomething.boot.BootCourses.supports(course))return capture(directory);
        try {
            var snapshot=dev.codesomething.boot.BootProjectSnapshot.capture(Path.of(directory),dev.codesomething.boot.BootCourses.jdbc(stage));
            byte[] bytes=tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(snapshot.files()).getBytes(java.nio.charset.StandardCharsets.UTF_8);
            return new Captured(bytes,snapshot.digest(),snapshot.files().stream().map(f->new FileEntry(f.path(),f.content().getBytes(java.nio.charset.StandardCharsets.UTF_8).length,hash(f.content()))).toList());
        } catch(Exception e){throw ApiException.invalid("directory",e.getMessage()==null?"无法读取工程范围。":e.getMessage());}
    }
    private void requireLocal() {
        if ("docker_only".equals(runnerMode)) throw error(HttpStatus.FORBIDDEN, "LOCAL_RUNNER_DISABLED", "公网仅允许网页工作区读取源码。");
    }
    @PostMapping(value="/workspace-previews", consumes="application/json")
    public Preview preview(@RequestBody PreviewWrite write) {
        if(write.directory()!=null&&write.directory().startsWith("browser:"))throw ApiException.invalid("directory","网页工作区请使用原网页会话提交。");
        courses.requirePublished(write.courseId(),write.courseVersion(),write.stageId());
        if(!"http-json-basics".equals(write.courseId())&&!dev.codesomething.boot.BootCourses.supports(write.courseId()))throw new ApiException(HttpStatus.BAD_REQUEST,"SQL_SUBMISSION_REQUIRED","SQL课程请使用SQL编辑器或导入.sql文件提交，不使用Java目录配对。",Map.of());
        var captured=capture(write.directory(),write.courseId(),write.stageId());
        String id=UUID.randomUUID().toString(), code=UUID.randomUUID().toString();
        String expiry=Instant.now().plusSeconds(300).toString();
        String directory=Path.of(write.directory()).normalize().toString();
        jdbc.update("INSERT INTO workspace_previews(id,directory,course_id,course_version,stage_id,digest,code_hash,expires_at) VALUES(?,?,?,?,?,?,?,?)",id,directory,write.courseId(),write.courseVersion(),write.stageId(),captured.digest(),hash(code),expiry);
        return new Preview(id,directory,captured.digest(),captured.files(),code,expiry);
    }
    @PostMapping(value="/workspace-bindings", consumes="application/json")
    @Transactional
    public Paired pair(@RequestBody PairWrite write) {
        if(write.previewId()==null) throw ApiException.invalid("previewId","请先预览文件范围。");
        var rows=jdbc.queryForList("SELECT * FROM workspace_previews WHERE id=?",write.previewId());
        if(rows.isEmpty()) throw error(HttpStatus.NOT_FOUND,"PREVIEW_NOT_FOUND","请重新预览文件范围。");
        var row=rows.getFirst();
        if(!secretEquals((String)row.get("code_hash"),write.pairingCode())) throw error(HttpStatus.FORBIDDEN,"PAIRING_REJECTED","配对码不正确。");
        if(((Number)row.get("consumed")).intValue()!=0 || Instant.parse((String)row.get("expires_at")).isBefore(Instant.now())) throw error(HttpStatus.CONFLICT,"PREVIEW_EXPIRED","预览已失效，请重新预览。");
        String directory=(String)row.get("directory");
        if(!capture(directory,(String)row.get("course_id"),(String)row.get("stage_id")).digest().equals(row.get("digest"))) throw error(HttpStatus.CONFLICT,"SNAPSHOT_CHANGED","文件已经修改，请重新预览后确认。");
        String id=UUID.randomUUID().toString(), token=UUID.randomUUID()+"-"+UUID.randomUUID();
        jdbc.update("UPDATE workspace_previews SET consumed=1 WHERE id=?",write.previewId());
        jdbc.update("INSERT INTO workspace_bindings VALUES(?,?,?,?,?,?,?)",id,directory,row.get("course_id"),row.get("course_version"),row.get("stage_id"),hash(token),Instant.now().toString());
        return new Paired(id,directory,token);
    }
    public Binding authorize(String id, String authorization) {
        if(authorization==null || !authorization.startsWith("Bearer ")) throw error(HttpStatus.UNAUTHORIZED,"PAIRING_REQUIRED","请先配对本地目录。");
        var rows=jdbc.query("SELECT id,directory,course_id,course_version,stage_id,token_hash FROM workspace_bindings WHERE id=?",(r,n)->new Binding(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6)),id);
        if(rows.isEmpty() || !secretEquals(rows.getFirst().tokenHash(),authorization.substring(7))) throw error(HttpStatus.UNAUTHORIZED,"PAIRING_REQUIRED","目录配对无效，请重新配对。");
        return rows.getFirst();
    }
    @GetMapping("/workspace-bindings/{id}/preview")
    public Preview current(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization) {
        var binding=authorize(id,authorization);var captured=capture(binding.directory(),binding.courseId(),binding.stageId());
        return new Preview(id,binding.directory(),captured.digest(),captured.files(),null,null);
    }
    @GetMapping("/workspace-bindings/{id}/sources")
    public Map<String,Object> sources(@PathVariable String id,@RequestHeader(value="Authorization",required=false) String authorization,
                                     @RequestParam(required=false) String expectedDigest) {
        var binding=authorize(id,authorization);
        var captured=capture(binding.directory(),binding.courseId(),binding.stageId());
        if(expectedDigest!=null&&!expectedDigest.equals(captured.digest()))
            throw error(HttpStatus.CONFLICT,"SNAPSHOT_CHANGED","文件已变化，请重新读取最新文件后再检查。");
        Map<String,String> files=new LinkedHashMap<>();
        String content=new String(captured.bytes(),java.nio.charset.StandardCharsets.UTF_8);
        if(dev.codesomething.boot.BootCourses.supports(binding.courseId())) {
            for(var source:tools.jackson.databind.json.JsonMapper.builder().build().readValue(content,dev.codesomething.boot.BootProjectSnapshot.Source[].class))
                files.put(source.path(),source.content());
        } else files.put("TaskServer.java",content);
        return Map.of("digest",captured.digest(),"files",files);
    }
}

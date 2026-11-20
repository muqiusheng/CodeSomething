package dev.codesomething.workspaces;

import dev.codesomething.api.ApiException;
import dev.codesomething.boot.BootProjectSnapshot;
import java.io.IOException;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** Capability-bound access to a directory explicitly selected on this machine. */
@Service
public class LocalProjectStore {
    public record Grant(String id,String token,String name) {}
    public record Stored(String id,String tokenHash,String directory) {}
    public record Entry(String name,String kind) {}
    private final Path registry;
    private final Map<String,Stored> grants=new HashMap<>();
    private boolean corruptRegistry;
    private final JsonMapper json=JsonMapper.builder().build();
    public LocalProjectStore(@Value("${cs.data-directory}") String data) throws IOException {
        registry=Path.of(data).toAbsolutePath().resolve("local-projects.json");
        if(Files.exists(registry))try{
            for(var g:json.readValue(Files.readString(registry),Stored[].class))if(g!=null&&g.id()!=null&&g.tokenHash()!=null&&g.tokenHash().matches("[a-f0-9]{64}")&&g.directory()!=null&&Path.of(g.directory()).isAbsolute())grants.put(g.id(),g);
        }catch(Exception e){grants.clear();corruptRegistry=true;System.getLogger(LocalProjectStore.class.getName()).log(System.Logger.Level.WARNING,"本机工程连接记录无法恢复；学习服务继续运行，请重新选择工程。");}
    }
    private static ApiException problem(HttpStatus status,String code,String path,String message){return new ApiException(status,code,message,Map.of("path",Objects.toString(path,"")));}
    private static ApiException io(Exception e,String path){
        return problem(HttpStatus.CONFLICT,e instanceof NoSuchFileException?"PROJECT_ENTRY_MISSING":e instanceof AccessDeniedException?"PROJECT_ACCESS_DENIED":"PROJECT_IO_ERROR",path,
            (e instanceof NoSuchFileException?"找不到文件或目录：":e instanceof AccessDeniedException?"没有文件读取权限：":"无法读取工程文件：")+path+"。请刷新目录；工程已移动时请重新选择。");
    }
    public synchronized Grant connect(Path selected) throws IOException {
        Path root=selected.toAbsolutePath().normalize();
        if(!Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS)||!root.toRealPath().equals(root))throw problem(HttpStatus.BAD_REQUEST,"PROJECT_ROOT_INVALID","","请选择真实项目目录，不支持链接或目录联接。");
        if(Files.exists(root.resolve("PRODUCT.md"))&&Files.isDirectory(root.resolve("new-system"))||Files.exists(root.resolve("package.json"))&&Files.readString(root.resolve("package.json")).contains("\"codesomething-frontend\""))throw problem(HttpStatus.BAD_REQUEST,"WEBSITE_DIRECTORY","","请选择学习工程，不要选择网站自身的代码目录。");
        String id=UUID.randomUUID().toString(),token=UUID.randomUUID()+"-"+UUID.randomUUID();
        Stored grant=new Stored(id,WorkspaceController.hash(token),root.toString());grants.put(id,grant);
        try{persist();}catch(IOException e){grants.remove(id);throw e;}
        return new Grant(id,token,root.getFileName().toString());
    }
    Path toolsDirectory(){return registry.getParent().resolve("tools");}
    private void persist() throws IOException {
        Files.createDirectories(registry.getParent());if(corruptRegistry&&Files.exists(registry)){Files.copy(registry,registry.resolveSibling("local-projects-corrupt-"+System.currentTimeMillis()+".json"));corruptRegistry=false;}Path temp=Files.createTempFile(registry.getParent(),"projects-",".tmp");
        try{Files.writeString(temp,json.writeValueAsString(grants.values()));try{Files.move(temp,registry,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException e){Files.move(temp,registry,StandardCopyOption.REPLACE_EXISTING);}}finally{Files.deleteIfExists(temp);}
    }
    private Path root(String id,String token) {
        Stored grant=grants.get(id);
        if(grant==null||token==null||!java.security.MessageDigest.isEqual(grant.tokenHash().getBytes(StandardCharsets.UTF_8),WorkspaceController.hash(token).getBytes(StandardCharsets.UTF_8)))throw problem(HttpStatus.FORBIDDEN,"PROJECT_AUTH_REQUIRED","","工程连接凭据已失效，请重新选择项目目录。");
        Path root=Path.of(grant.directory());
        try{if(!Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS)||!root.toRealPath().equals(root))throw new NoSuchFileException(root.toString());return root;}catch(IOException e){throw problem(HttpStatus.CONFLICT,"PROJECT_ROOT_MISSING","","已记住工程，但原目录已移动、删除或不可访问，请重新选择项目目录。");}
    }
    private Path resolve(Path root,String relative) throws IOException {
        if(relative==null||relative.length()>1024||relative.contains("\\")||relative.contains(":")||relative.chars().anyMatch(c->c<32)||Arrays.stream(relative.split("/",-1)).anyMatch(p->p.isEmpty()||p.equals(".")||p.equals("..")))throw problem(HttpStatus.BAD_REQUEST,"PROJECT_PATH_INVALID",String.valueOf(relative),"工程内文件路径无效。");
        Path current=root;
        for(String part:relative.split("/")){current=current.resolve(part);if(Files.isSymbolicLink(current)||!current.toRealPath().equals(current))throw problem(HttpStatus.BAD_REQUEST,"PROJECT_LINK_REJECTED",relative,"不支持符号链接或目录联接："+relative);}
        return current;
    }
    public synchronized List<Entry> tree(String id,String token,String relative) {
        Path root=root(id,token);
        try{Path directory=relative==null||relative.isEmpty()?root:resolve(root,relative);var result=new ArrayList<Entry>();
            try(var entries=Files.newDirectoryStream(directory)){for(Path path:entries){if(result.size()>=5000)throw problem(HttpStatus.BAD_REQUEST,"DIRECTORY_TOO_LARGE",relative==null?"":relative,"目录项目过多，请在IDE中查看。");result.add(new Entry(path.getFileName().toString(),Files.isDirectory(path,LinkOption.NOFOLLOW_LINKS)?"directory":"file"));}}
            result.sort(Comparator.comparing(Entry::kind).thenComparing(Entry::name));return result;
        }catch(IOException e){throw io(e,relative==null?"":relative);}
    }
    public synchronized String read(String id,String token,String relative) {
        Path root=root(id,token);
        for(int attempt=0;;attempt++)try{Path path=resolve(root,relative);if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))throw new NoSuchFileException(relative);if(Files.size(path)>1048576)throw problem(HttpStatus.BAD_REQUEST,"FILE_TOO_LARGE",relative,"文件超过1MiB，请在IDE中打开："+relative);
            byte[] bytes;try(var in=Files.newInputStream(path,LinkOption.NOFOLLOW_LINKS)){bytes=in.readNBytes(1048577);}if(bytes.length>1048576)throw problem(HttpStatus.BAD_REQUEST,"FILE_TOO_LARGE",relative,"文件超过1MiB，请在IDE中打开："+relative);
            String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();if(text.indexOf(0)>=0)throw new CharacterCodingException();return text;
        }catch(CharacterCodingException e){throw problem(HttpStatus.BAD_REQUEST,"NOT_TEXT_FILE",relative,"此文件不是UTF-8文本，请在IDE中打开："+relative);}catch(IOException e){if(attempt<2&&(e instanceof NoSuchFileException||e instanceof FileSystemException)){pause();continue;}throw io(e,relative);}
    }
    public synchronized void write(String id,String token,String relative,String expected,String value) {
        if(expected==null||value==null||value.getBytes(StandardCharsets.UTF_8).length>1048576)throw problem(HttpStatus.BAD_REQUEST,"FILE_TOO_LARGE",relative,"保存内容无效或超过1MiB。");
        if(!read(id,token,relative).equals(expected))throw problem(HttpStatus.CONFLICT,"PROJECT_WRITE_CONFLICT",relative,"文件已被IDE或其他页面修改："+relative+"。当前网页修改仍保留，请重新读取后合并。");
        Path root=root(id,token);
        try{Path path=resolve(root,relative);Path temp=Files.createTempFile(path.getParent(),".cs-save-",".tmp");
            try{Files.writeString(temp,value);if(!read(id,token,relative).equals(expected))throw problem(HttpStatus.CONFLICT,"PROJECT_WRITE_CONFLICT",relative,"文件在保存期间被修改，网页修改仍保留："+relative);try{Files.move(temp,path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException e){throw problem(HttpStatus.CONFLICT,"ATOMIC_SAVE_UNAVAILABLE",relative,"此文件系统不支持安全替换，请在IDE中保存："+relative);}}finally{Files.deleteIfExists(temp);}
        }catch(IOException e){throw io(e,relative);}
    }
    private Map<String,String> capture(Path root,String course) throws IOException {
        if("http-json-basics".equals(course))return Map.of("TaskServer.java",readPath(root,"TaskServer.java"));
        var snapshot=BootProjectSnapshot.capture(root);var files=new TreeMap<String,String>();for(var f:snapshot.files())files.put(f.path(),f.content());return files;
    }
    private String readPath(Path root,String path) throws IOException {Path file=resolve(root,path);if(Files.size(file)>65536)throw new IOException("单个检查文件最多64KiB："+path);try(var in=Files.newInputStream(file,LinkOption.NOFOLLOW_LINKS)){byte[] bytes=in.readNBytes(65537);if(bytes.length>65536)throw new IOException("单个检查文件最多64KiB："+path);return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}}
    public synchronized Map<String,String> snapshot(String id,String token,String course) {
        Path root=root(id,token);Exception last=null;
        for(int attempt=0;attempt<3;attempt++)try{var first=capture(root,course);var second=capture(root,course);if(first.equals(second))return second;last=new IOException("工程持续变化");pause();}catch(IOException|IllegalArgumentException e){last=e;pause();}
        throw problem(HttpStatus.CONFLICT,"PROJECT_UNSTABLE","", "未能取得稳定工程快照，请等待IDE保存完成后重试。"+(last==null?"":last.getMessage()));
    }
    public synchronized String stamp(String id,String token,String course) {
        Path root=root(id,token);var entries=new TreeMap<String,String>();
        try{if("http-json-basics".equals(course))metadata(root,"TaskServer.java",entries);else{metadata(root,"pom.xml",entries);for(String source:List.of("src/main/java","src/main/resources","src/test/java","src/test/resources"))if(Files.exists(root.resolve(source)))scan(root,source,entries);if(Files.exists(root.resolve("RUN.md")))metadata(root,"RUN.md",entries);}return WorkspaceController.hash(json.writeValueAsString(entries));}catch(IOException e){throw io(e,"检查文件");}
    }
    private void metadata(Path root,String path,Map<String,String> entries)throws IOException{try{Path file=resolve(root,path);var attributes=Files.readAttributes(file,java.nio.file.attribute.BasicFileAttributes.class,LinkOption.NOFOLLOW_LINKS);entries.put(path,attributes.size()+":"+attributes.lastModifiedTime()+":"+attributes.fileKey());}catch(IOException e){throw io(e,path);}}
    private void scan(Path root,String path,Map<String,String> entries)throws IOException{Path dir=resolve(root,path);try(var list=Files.newDirectoryStream(dir)){for(Path item:list){String relative=path+"/"+item.getFileName();if(Files.isDirectory(item,LinkOption.NOFOLLOW_LINKS))scan(root,relative,entries);else if(BootProjectSnapshot.allowedPath(relative)){metadata(root,relative,entries);if(entries.size()>100)throw new IOException("检查文件超过100个");}}}}
    private static void pause(){try{Thread.sleep(80);}catch(InterruptedException e){Thread.currentThread().interrupt();throw problem(HttpStatus.CONFLICT,"PROJECT_READ_CANCELLED","","工程读取已停止。");}}
}

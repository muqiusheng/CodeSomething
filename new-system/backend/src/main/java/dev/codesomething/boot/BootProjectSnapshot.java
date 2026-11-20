package dev.codesomething.boot;

import dev.codesomething.workspaces.WorkspaceController;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;

/** Immutable original Maven project sources, independent of package and startup class names. */
public final class BootProjectSnapshot {
    public static final String SOURCE_DIRECTORY="src/main/java/dev/codesomething/lab";
    public record Source(String path, String content) {}
    private final List<Source> files;
    private final String digest;
    private BootProjectSnapshot(List<Source> files) {
        this.files=List.copyOf(files);
        try(var bytes=new ByteArrayOutputStream(); var out=new DataOutputStream(bytes)) {
            out.writeUTF("boot-snapshot-v1");
            for(var file:files) {
                byte[] path=file.path().getBytes(StandardCharsets.UTF_8),content=file.content().getBytes(StandardCharsets.UTF_8);
                out.writeInt(path.length);out.write(path);out.writeInt(content.length);out.write(content);
            }
            out.flush();digest=WorkspaceController.hash(bytes.toByteArray());
        } catch(IOException e) {throw new UncheckedIOException(e);}
    }
    public List<Source> files(){return files;}
    public String digest(){return digest;}
    public Source startupSource(){return files.stream().filter(f->f.path().startsWith("src/main/java/")&&f.content().contains("SpringBootApplication")).findFirst().orElseGet(()->files.stream().filter(f->f.path().startsWith("src/main/java/")).findFirst().orElseThrow());}
    public String startupPackage(){var match=java.util.regex.Pattern.compile("(?m)^\\s*package\\s+([A-Za-z_$][A-Za-z0-9_$.]*)\\s*;").matcher(startupSource().content());return match.find()?match.group(1):"";}
    public String startupName(){String path=startupSource().path();return path.substring(path.lastIndexOf('/')+1,path.length()-5);}
    public String mutationSource(String content){return content.replace("package dev.codesomething.lab;",startupPackage().isEmpty()?"":"package "+startupPackage()+";").replace("dev.codesomething.lab.",startupPackage().isEmpty()?"":startupPackage()+".").replaceAll("\\bApplication\\b",java.util.regex.Matcher.quoteReplacement(startupName()));}
    public static String trustedPom() {
        return trustedPom(false);
    }
    public static String trustedPom(boolean jdbc) {
        try(var in=BootProjectSnapshot.class.getResourceAsStream(jdbc?"/runner/boot/jdbc-pom.xml":"/runner/boot/pom.xml")) {
            return new String(Objects.requireNonNull(in).readAllBytes(),StandardCharsets.UTF_8);
        } catch(IOException e){throw new UncheckedIOException(e);}
    }
    private static Path regularPath(Path root,String relative,boolean directory) throws IOException {
        Path current=root;
        for(Path segment:Path.of(relative)) {
            current=current.resolve(segment);
            if(Files.isSymbolicLink(current)||!current.toRealPath().equals(current))throw new IOException("不支持链接或目录联接："+relative);
        }
        if(directory?!Files.isDirectory(current,LinkOption.NOFOLLOW_LINKS):!Files.isRegularFile(current,LinkOption.NOFOLLOW_LINKS))
            throw new IOException("需要普通"+(directory?"目录":"文件")+"："+relative);
        return current;
    }
    private static String read(Path file) throws IOException {
        try(SeekableByteChannel channel=Files.newByteChannel(file,Set.of(StandardOpenOption.READ,LinkOption.NOFOLLOW_LINKS))) {
            ByteBuffer bytes=ByteBuffer.allocate(65537);
            if(channel.size()>65536)throw new IOException("单个源码不能超过64KiB。");
            while(bytes.hasRemaining()&&channel.read(bytes)!=-1){}
            if(bytes.position()>65536)throw new IOException("单个源码不能超过64KiB。");
            bytes.flip();return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(bytes).toString();
        }
    }
    public static BootProjectSnapshot capture(Path directory) throws IOException {
        return capture(directory,false);
    }
    public static boolean allowedPath(String path) {
        if(path==null||path.length()>512||path.contains("\\")||path.contains(":")||path.chars().anyMatch(c->c<32||c==127)||Arrays.stream(path.split("/",-1)).anyMatch(p->p.isEmpty()||p.equals(".")||p.equals("..")))return false;
        return path.equals("pom.xml")||path.equals("RUN.md")||path.matches("src/(main|test)/java/(?:[A-Za-z_$][A-Za-z0-9_$]*/)*[A-Za-z_$][A-Za-z0-9_$]*\\.java")||path.matches("src/(main|test)/resources/(?:[^/]+/)*[^/]+\\.(?:properties|ya?ml|xml|json|sql|txt|md|html|css|js|csv)");
    }
    public static BootProjectSnapshot restore(String encoded) {
        var values=tools.jackson.databind.json.JsonMapper.builder().build().readValue(encoded,Source[].class);
        var files=new TreeMap<String,String>();
        for(var value:values)if(files.put(value.path(),value.content())!=null)throw new IllegalArgumentException("Duplicate stored source path");
        return fromFiles(files,false);
    }
    public static BootProjectSnapshot fromFiles(Map<String,String> input,boolean jdbc) {
        if(input==null||input.isEmpty()||input.size()>100)throw new IllegalArgumentException("请提供1至100个工程文件。");
        int total=0;var files=new ArrayList<Source>();
        for(var entry:new TreeMap<>(input).entrySet()) {
            String path=entry.getKey(),content=entry.getValue();
            if(content==null||!allowedPath(path))throw new IllegalArgumentException("文件不在工程源码范围内："+path);
            int bytes=content.getBytes(StandardCharsets.UTF_8).length;total+=bytes;
            if(bytes>65536||total>2097152)throw new IllegalArgumentException("单文件最多64KiB，工程最多2MiB。");
            files.add(new Source(path,content));
        }
        if(!input.containsKey("pom.xml")||input.keySet().stream().noneMatch(p->p.startsWith("src/main/java/")&&p.endsWith(".java")))throw new IllegalArgumentException("请选择包含pom.xml与src/main/java源码的Maven工程根目录。");
        MavenProjectConfig.parse(input.get("pom.xml"));
        return new BootProjectSnapshot(files);
    }
    public static BootProjectSnapshot capture(Path directory,boolean jdbc) throws IOException {
        Path root=directory.toAbsolutePath().normalize();
        if(!directory.isAbsolute()||!Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS)||!root.toRealPath().equals(root))throw new IOException("请选择绝对路径的真实工程目录。");
        var files=new TreeMap<String,String>();
        files.put("pom.xml",read(regularPath(root,"pom.xml",false)));
        for(String source:List.of("src/main/java","src/test/java","src/main/resources","src/test/resources"))if(Files.exists(root.resolve(source),LinkOption.NOFOLLOW_LINKS))collect(root,source,files);
        if(Files.exists(root.resolve("RUN.md"),LinkOption.NOFOLLOW_LINKS))files.put("RUN.md",read(regularPath(root,"RUN.md",false)));
        try{return fromFiles(files,jdbc);}catch(IllegalArgumentException e){throw new IOException(e.getMessage(),e);}
    }
    private static void collect(Path root,String relative,Map<String,String> files) throws IOException {
        Path directory=regularPath(root,relative,true);
        try(var entries=Files.newDirectoryStream(directory)) {for(Path entry:entries){
            String path=relative+"/"+entry.getFileName();
            if(Files.isDirectory(entry,LinkOption.NOFOLLOW_LINKS)){collect(root,path,files);}
            else if(allowedPath(path)){files.put(path,read(regularPath(root,path,false)));if(files.size()>100)throw new IOException("检查最多支持100个工程文件。");}
            else if(Files.isSymbolicLink(entry))throw new IOException("不支持文件链接："+path);
        }}
    }
}

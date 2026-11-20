package dev.codesomething.tutor;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** One ephemeral provider connection per answer. Never exposes credentials or raw provider errors. */
final class AppServerClient implements AutoCloseable {
    static final class Failure extends RuntimeException {
        final String code;
        Failure(String code) {super(code);this.code=code;}
    }
    private final JsonMapper json=JsonMapper.builder().build();
    private final Process process;
    private final BufferedWriter writer;
    private final Map<Integer,CompletableFuture<JsonNode>> pending=new ConcurrentHashMap<>();
    private final BlockingQueue<JsonNode> events=new LinkedBlockingQueue<>(2048);
    private final AtomicInteger sequence=new AtomicInteger();
    private final Path cwd;
    private volatile boolean closed;

    AppServerClient(String binary,String arguments,Path cwd) throws IOException {
        this.cwd=cwd;Files.createDirectories(cwd);
        List<String> command=new ArrayList<>();command.add(binary);
        if(arguments.isBlank()) {
            command.addAll(List.of("app-server","--listen","stdio://"));
            for(String flag:List.of("multi_agent","multi_agent_v2","shell_tool","unified_exec","apps","plugins","hooks","browser_use","computer_use","image_generation","view_image","code_mode","code_mode_host","skill_search")) command.addAll(List.of("-c","features."+flag+"=false"));
            command.addAll(List.of("-c","web_search=\"disabled\"","-c","project_doc_max_bytes=0"));
        } else for(var arg:json.readTree(arguments)) command.add(arg.asText());
        var builder=new ProcessBuilder(command).directory(cwd.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD);
        // The only supported billing route is the existing ChatGPT login.
        builder.environment().remove("OPENAI_API_KEY");builder.environment().remove("CODEX_API_KEY");
        process=builder.start();writer=new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.UTF_8));
        Thread.ofVirtual().name("tutor-provider-reader").start(()->{
            try(var reader=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8))) {
                String line;while((line=reader.readLine())!=null&&!closed) {
                    JsonNode message;try{message=json.readTree(line);}catch(Exception ignored){continue;}
                    if(message.has("id")&&message.has("method")) {
                        send(Map.of("id",message.get("id"),"error",Map.of("code",-32601,"message","Tools unavailable in learning tutor")));continue;
                    }
                    if(message.has("id")) {
                        var future=pending.remove(message.path("id").asInt());
                        if(future!=null){if(message.has("error"))future.completeExceptionally(failure(message.path("error")));else future.complete(message.path("result"));}
                    } else if(!events.offer(message)) {close();break;}
                }
            }catch(Exception ignored){}finally{
                pending.values().forEach(f->f.completeExceptionally(new Failure("PROVIDER_DISCONNECTED")));
                events.offer(json.readTree("{\"method\":\"connection/closed\"}"));
            }
        });
    }
    private synchronized void send(Object message) throws IOException {writer.write(json.writeValueAsString(message));writer.newLine();writer.flush();}
    JsonNode rpc(String method,Object params) throws Exception {
        int id=sequence.incrementAndGet();var future=new CompletableFuture<JsonNode>();pending.put(id,future);
        try{send(Map.of("id",id,"method",method,"params",params));return future.get(25,TimeUnit.SECONDS);}
        catch(ExecutionException e){if(e.getCause() instanceof Failure f)throw f;throw new Failure("PROVIDER_DISCONNECTED");}
        finally{pending.remove(id);}
    }
    String initialize() throws Exception {
        rpc("initialize",Map.of("clientInfo",Map.of("name","codesomething_tutor","version","0.10.0"),"capabilities",Map.of("experimentalApi",true)));
        send(Map.of("method","initialized"));
        var account=rpc("account/read",Map.of("refreshToken",false));
        if(!"chatgpt".equals(account.path("account").path("type").asText()))throw new Failure("AUTH_REQUIRED");
        var models=rpc("model/list",Map.of("limit",100));String selected=null;
        for(var model:models.path("data")){if(selected==null||model.path("isDefault").asBoolean())selected=model.path("id").asText();if(model.path("isDefault").asBoolean())break;}
        if(selected==null||selected.isBlank())throw new Failure("MODEL_UNAVAILABLE");return selected;
    }
    String answer(String model,String instructions,String prompt,Consumer<String> output,java.util.function.BooleanSupplier cancelled,int timeoutSeconds) throws Exception {
        // Disable configured MCP servers without reading or changing their secrets/config files.
        var config=new LinkedHashMap<String,Object>();
        var settings=rpc("config/read",Map.of("includeLayers",false));
        for(var name:settings.path("config").path("mcp_servers").properties()) config.put("mcp_servers."+name.getKey()+".enabled",false);
        String thread=rpc("thread/start",Map.of("model",model,"modelProvider","openai","cwd",cwd.toString(),"approvalPolicy","never","sandbox","read-only","ephemeral",true,"baseInstructions",instructions,"developerInstructions",instructions,"config",config)).path("thread").path("id").asText();
        if(cancelled.getAsBoolean())return "cancelled";
        String turn=rpc("turn/start",Map.of("threadId",thread,"input",List.of(Map.of("type","text","text",prompt)),"effort","low",
            "sandboxPolicy",Map.of("type","readOnly"))).path("turn").path("id").asText();
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(timeoutSeconds);boolean stopping=false;long stopDeadline=0;
        while(true) {
            if(cancelled.getAsBoolean()&&!stopping){stopping=true;stopDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);rpc("turn/interrupt",Map.of("threadId",thread,"turnId",turn));}
            if(stopping&&System.nanoTime()>stopDeadline)return "cancelled";
            if(System.nanoTime()>deadline)throw new Failure("TUTOR_TIMEOUT");
            var event=events.poll(150,TimeUnit.MILLISECONDS);if(event==null)continue;
            String method=event.path("method").asText();var p=event.path("params");
            if(method.equals("connection/closed"))throw new Failure("PROVIDER_DISCONNECTED");
            if(p.has("threadId")&&!thread.equals(p.path("threadId").asText()))continue;
            if(method.equals("item/agentMessage/delta")) output.accept(p.path("delta").asText());
            if(method.equals("turn/completed")&&turn.equals(p.path("turn").path("id").asText())) {
                String status=p.path("turn").path("status").asText();
                if(status.equals("failed"))throw failure(p.path("turn").path("error"));
                return stopping||status.equals("interrupted")?"cancelled":"completed";
            }
        }
    }
    private Failure failure(JsonNode error) {
        String text=error.toString().toLowerCase(Locale.ROOT);
        if(text.contains("usagelimit")||text.contains("rate_limit")||text.contains("usage limit")||text.contains("quota"))return new Failure("RATE_LIMITED");
        if(text.contains("unauthorized")||text.contains("auth")||text.contains("401"))return new Failure("AUTH_REQUIRED");
        return new Failure("PROVIDER_ERROR");
    }
    @Override public void close() {closed=true;try{writer.close();}catch(Exception ignored){}process.descendants().forEach(ProcessHandle::destroy);process.destroy();if(process.isAlive())process.destroyForcibly();}
}

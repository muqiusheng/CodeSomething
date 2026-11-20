from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'backend/src/main/java/dev/codesomething/boot/BootProjectRunner.java'
code=source.read_text(encoding='utf-8')
# Preserve the R3.4 runner byte for byte. The R7 runner shares the sandbox contract,
# with its own byte-bound probe, schema and behavior matrix.
code=code[:code.index('    private void verify(')]
code=code.replace('public final class BootProjectRunner','public final class CollaborationRunner').replace('public BootProjectRunner(','public CollaborationRunner(').replace('BootProjectRunner.class','CollaborationRunner.class')
start=code.index('            String seed=');end=code.index('            String implementation;',start)
code=code[:start]+'''            String seed;
            try(var stream=getClass().getResourceAsStream("/runner/collaboration/seed.sql")){seed="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE cs_lab CHARACTER SET utf8mb4; CREATE USER 'learner'@'%' IDENTIFIED BY '"+secret+"'; GRANT SELECT,INSERT,UPDATE,DELETE ON cs_lab.* TO 'learner'@'%'; USE cs_lab; "+new String(Objects.requireNonNull(stream).readAllBytes(),StandardCharsets.UTF_8);}
'''+code[end:]
start=code.index('            if(stage.equals("a-transfer"))for(');end=code.index('            harness=',start)
code=code[:start]+code[end:]
needle='            harness=WorkspaceController.hash('
code=code.replace(needle,'''            if(Set.of("b-tests","b-deploy").contains(stage))for(String name:List.of("Application","AuthService","PlanService","BusinessController","Problem","ApiErrors","RequestLog"))
                try(var stream=getClass().getResourceAsStream("/runner/collaboration/mutation/"+name+".java")){implementation+=WorkspaceController.hash(Objects.requireNonNull(stream).readAllBytes());}
'''+needle)
code=code.replace('/runner/boot/BootProbe.java','/runner/collaboration/R7Probe.java').replace('BootProbe.java','R7Probe.java')
code=code.replace('if(stage.equals("a-transfer"))verifyTests(app,input,deadline,cancelled,checks);','if(Set.of("b-tests","b-deploy").contains(stage))verifyTests(app,input,deadline,cancelled,checks);')
old='''        var args=new ArrayList<>(List.of("exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","/input/R7Probe.java",method,path));if(body!=null)args.add(Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)));'''
new='''        return request(app,deadline,cancelled,method,path,body,null);
    }
    private Response request(String app,long deadline,BooleanSupplier cancelled,String method,String path,String body,String token) throws Exception {
        var args=new ArrayList<>(List.of("exec",app,"java","-Xmx64m","-XX:ActiveProcessorCount=1","/input/R7Probe.java",method,path,body==null?"-":Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8)),token==null?"-":token));'''
assert old in code
code=code.replace(old,new)
code=code.replace('"/input/R7Probe.java",method,path','"-cp","/tmp","R7Probe",method,path')
code=code.replace('private record Response(int status,String type,String body) {}','private record Response(int status,String type,String body,String requestId) { private Response(int status,String type,String body){this(status,type,body,"");} }')
code=code.replace('new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8));','new String(Base64.getDecoder().decode(lines[2]),StandardCharsets.UTF_8),lines.length>3?lines[3].strip():"");')
code=code.replace('            var build=maven(', '            require(cmd(deadline,cancelled,"exec",app,"javac","-d","/tmp","/input/R7Probe.java"));\n            var build=maven(')
verify=(root/'tooling/r7-verify.java.txt').read_text(encoding='utf-8')
(source.parent/'CollaborationRunner.java').write_text(code+verify+'\n}\n',encoding='utf-8')
probe=(root/'backend/src/main/resources/runner/boot/BootProbe.java').read_text(encoding='utf-8').replace('class BootProbe','class R7Probe')
probe=probe.replace('var request=HttpRequest.newBuilder','var builder=HttpRequest.newBuilder').replace('.method(args[0],args.length>2?', '.method(args[0],args.length>2&&!args[2].equals("-")?').replace('HttpRequest.BodyPublishers.noBody()).build();','HttpRequest.BodyPublishers.noBody());\n            if(args.length>3&&!args[3].equals("-"))builder.header("Authorization","Bearer "+args[3]);\n            var request=builder.build();')
probe=probe.replace('System.out.println(Base64.getEncoder().encodeToString(body));return;','System.out.println(Base64.getEncoder().encodeToString(body));\n            System.out.println(response.headers().firstValue("X-Request-Id").orElse(""));return;')
(root/'backend/src/main/resources/runner/collaboration/R7Probe.java').write_text(probe,encoding='utf-8')
print('Authored independent R7 runner without rewriting the R3.4 sandbox strategy.')

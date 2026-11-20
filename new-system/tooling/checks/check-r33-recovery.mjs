import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve('new-system'),evidence=path.join(root,'docs/acceptance/R3.3'),base='http://127.0.0.1:5189/api/v1',docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body,token){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());return r.json()}
function cmd(...args){const r=spawnSync(docker,args,{encoding:'utf8',windowsHide:true,timeout:15000});return {code:r.status,output:r.stdout+r.stderr}}
const journey=JSON.parse(fs.readFileSync(path.join(evidence,'journey.json'),'utf8')),binding=journey.bindings['a-transfer'];
if(process.argv[2]==='prepare') {
 const before={boot:await api('/learning/progress/boot-foundations/1.0.0'),tasks:await api('/learning/progress/task-manager/1.0.0'),resume:await api('/learning/continue')};
 if(before.boot.completedCount!==4||before.tasks.completedCount!==6)throw new Error('Expected all ten completed stages after release-JAR restart');
 const preview=await api('/workspace-bindings/'+binding.id+'/preview',undefined,binding.token),submission=await api('/submissions',{bindingId:binding.id,expectedDigest:preview.digest},binding.token),job=await api('/check-jobs',{submissionId:submission.id,idempotencyKey:crypto.randomUUID()},binding.token);
 const app='cs-r33-app-'+job.id,db='cs-r33-db-'+job.id,net='cs-r33-net-'+job.id;
 let info;
 for(let i=0;i<500;i++){const result=cmd('container','inspect',app);if(result.code===0){info=JSON.parse(result.output)[0];if(info.State.Running)break}await pause(100)}
 if(!info?.State.Running)throw new Error('Application container did not start');
 const network=JSON.parse(cmd('network','inspect',net).output)[0],database=JSON.parse(cmd('container','inspect',db).output)[0];
 if(!network.Internal||Object.keys(info.HostConfig.PortBindings||{}).length||Object.keys(database.HostConfig.PortBindings||{}).length)throw new Error('Check network or published ports do not match isolation contract');
 const probe=`import java.net.*;import java.sql.*;class NetworkProbe { public static void main(String[] args)throws Exception {
 try(var socket=new Socket()){socket.connect(new InetSocketAddress("1.1.1.1",53),500);throw new AssertionError("external network reachable");}catch(java.io.IOException expected){}
 Class.forName("com.mysql.cj.jdbc.Driver");String url=System.getenv("SPRING_DATASOURCE_URL");
 try(var connection=DriverManager.getConnection(url,"root","")){throw new AssertionError("remote root allowed");}catch(SQLException expected){}
 try(var connection=DriverManager.getConnection(url,System.getenv("SPRING_DATASOURCE_USERNAME"),System.getenv("SPRING_DATASOURCE_PASSWORD"));var statement=connection.createStatement()){
 try {statement.execute("CREATE DATABASE outside_allowed_database");throw new AssertionError("global DDL allowed");}catch(SQLException expected){}
 }
 for(String file:java.util.List.of("/input/project/pom.xml","/etc/write-test","/opt/repository/write-test")){try{java.nio.file.Files.writeString(java.nio.file.Path.of(file),"changed");throw new AssertionError("writable source/root/repo");}catch(java.io.IOException expected){}}
 System.out.println("R33_ISOLATION_OK");}}
 `;
 fs.writeFileSync(path.join(root,'runtime/r33-acceptance-data/boot-runner',job.id,'NetworkProbe.java'),probe);
 const probeResult=cmd('exec',app,'java','-Xmx64m','-cp','/opt/repository/com/mysql/mysql-connector-j/9.7.0/mysql-connector-j-9.7.0.jar','/input/NetworkProbe.java');
 if(probeResult.code!==0||!probeResult.output.includes('R33_ISOLATION_OK'))throw new Error(probeResult.output);
 const current=await api('/jobs/'+job.id,undefined,binding.token);if(current.status!=='running')throw new Error('Must interrupt an actually running job');
 fs.writeFileSync(path.join(evidence,'recovery-before.json'),JSON.stringify({jobId:job.id,status:current.status,bootCount:before.boot.completedCount,taskCount:before.tasks.completedCount,resume:before.resume,networkInternal:network.Internal,publishedPorts:0,appUser:info.Config.User,probe:probeResult.output.trim()},null,2));
 console.log('Prepared running job for forced interruption:',job.id);
}else {
 const before=JSON.parse(fs.readFileSync(path.join(evidence,'recovery-before.json'),'utf8')),job=await api('/jobs/'+before.jobId,undefined,binding.token),boot=await api('/learning/progress/boot-foundations/1.0.0'),tasks=await api('/learning/progress/task-manager/1.0.0'),resume=await api('/learning/continue');
 if(job.status!=='environment_error'||boot.completedCount!==4||tasks.completedCount!==6||resume.session.stageId!==before.resume.session.stageId)throw new Error('Interrupted job or persisted evidence did not recover');
 for(const [kind,name] of [['container','cs-r33-app-'],['container','cs-r33-db-'],['network','cs-r33-net-']])if(cmd(kind,'inspect',name+before.jobId).code===0)throw new Error('Interrupted resource remains: '+name);
 if(fs.existsSync(path.join(root,'runtime/r33-acceptance-data/boot-runner',before.jobId)))throw new Error('Interrupted input remains');
 fs.writeFileSync(path.join(evidence,'recovery-after.json'),JSON.stringify({status:job.status,report:job.report,bootCount:boot.completedCount,taskCount:tasks.completedCount,resume,resourcesCleaned:true},null,2));console.log('Interrupted job recovered; all ten completions and cursor preserved; resources cleaned.');
}

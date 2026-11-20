import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('new-system'),data=path.join(root,'runtime','r25-recovery-'+Date.now()),base='http://127.0.0.1:5190/api/v1';
fs.mkdirSync(data,{recursive:true});
const report={checks:[],provider:'controlled app-server protocol fixture; not a real account error'};
let processHandle;
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
async function start(){
 const log=fs.openSync(path.join(data,'server.log'),'a');
 processHandle=spawn('C:/Program Files (x86)/jdk/jdk21/bin/java.exe',['-jar','backend/target/codesomething-backend-0.1.0.jar','--server.port=5190','--cs.data-directory='+data,'--cs.course-directory=course-packs','--cs.runner.enabled=false','--cs.tutor.binary='+process.execPath,'--cs.tutor.arguments='+JSON.stringify([path.join(root,'backend/src/test/resources/fake-app-server.mjs')])],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});
 fs.closeSync(log);
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('Recovery backend did not start');
}
async function stop(){if(!processHandle)return;await new Promise(resolve=>{processHandle.once('exit',resolve);processHandle.kill()});processHandle=null}
async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(await r.text());return r.json()}
try{
 await start();const request={courseId:'http-json-basics',courseVersion:'1.1.0',stageId:'json',level:'concept',question:'SLOW',includeLesson:true,idempotencyKey:'recover-same-request'};
 const answer=await api('/tutor/requests',request);let partial;
 for(let i=0;i<100;i++){partial=await api('/tutor/requests/'+answer.id);if(partial.answer)break;await new Promise(r=>setTimeout(r,50))}
 assert(partial.status==='running'&&partial.answer==='false是','Crash fixture has an in-flight partial answer');
 await stop();await start();
 const restored=await api('/tutor/requests/'+answer.id);assert(restored.status==='interrupted'&&restored.errorCode==='SERVICE_RESTARTED','An interrupted request is marked after an ungraceful restart');
 assert(restored.answer==='false是','Restart preserves the last persisted partial answer');
 const duplicate=await api('/tutor/requests',request);assert(duplicate.id===answer.id&&duplicate.status==='interrupted','Replaying an old request does not regenerate or charge again');
 const fresh=await api('/tutor/requests',{...request,question:'解释布尔值',idempotencyKey:'new-question'});let finished;
 for(let i=0;i<100;i++){finished=await api('/tutor/requests/'+fresh.id);if(finished.status==='completed')break;await new Promise(r=>setTimeout(r,50))}
 assert(finished.status==='completed','An explicit new request works after process recovery');
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{await stop();fs.writeFileSync(path.join(root,'docs/acceptance/R2.5/recovery-checks.json'),JSON.stringify(report,null,2))}

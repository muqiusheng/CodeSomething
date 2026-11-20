import fs from 'node:fs';
import path from 'node:path';
const base=process.env.CS_ACCEPTANCE_URL||'http://127.0.0.1:5189/api/v1';
const root=path.resolve('new-system'),evidence=path.join(root,'docs/acceptance/R3.3'),work=path.join(root,'runtime/r33-journey-'+Date.now());
fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(work,{recursive:true});
const report={checks:[],jobs:[],bindings:{},startedAt:new Date().toISOString()};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function assert(ok,label){if(!ok)throw new Error(label);report.checks.push(label)}
async function request(route,body,token,method){const r=await fetch(base+route,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()}}
async function api(route,body,token,method){const r=await request(route,body,token,method);if(r.status!==200)throw new Error(route+': '+JSON.stringify(r));return r.body}
async function terminal(route,token){for(let i=0;i<1000;i++){const r=await api(route,undefined,token);if(!['queued','running','cancelling'].includes(r.status))return r;await pause(250)}throw new Error('Job did not finish '+route)}
async function pair(courseId,courseVersion,stageId,directory){const p=await api('/workspace-previews',{courseId,courseVersion,stageId,directory});assert(p.files.length>0,stageId+': explicit file scope');const b=await api('/workspace-bindings',{previewId:p.id,pairingCode:p.pairingCode});report.bindings[stageId]=b;return b}
async function check(binding){const p=await api('/workspace-bindings/'+binding.id+'/preview',undefined,binding.token);const s=await api('/submissions',{bindingId:binding.id,expectedDigest:p.digest},binding.token);const payload={submissionId:s.id,idempotencyKey:crypto.randomUUID()};const j=await api('/check-jobs',payload,binding.token);assert((await api('/check-jobs',payload,binding.token)).id===j.id,'Duplicate job request is idempotent');const final=await terminal('/jobs/'+j.id,binding.token);report.jobs.push(final);return final}
async function understand(binding,job,answers,key=crypto.randomUUID()){return request('/understanding-attempts',{jobId:job.id,ruleVersion:'1',answers,idempotencyKey:key},binding.token)}
const httpSolutions={'run-server':{restart:1,connection:2},'fix-response':{status:0,type:1},transfer:{route:1,mapping:2}};
try {
 if(!process.env.CS_SKIP_PREREQUISITES){
 let java=fs.readFileSync(path.join(root,'course-packs/http-json-basics/1.1.0/TaskServer.java'),'utf8').replace('"completed":"false"','"completed":false');const last=java.lastIndexOf('status = 200;');java=java.slice(0,last)+java.slice(last).replace('status = 200;','status = 404;');
 for(const stage of ['run-server','fix-response','transfer']){if((await api('/learning/progress/http-json-basics/1.1.0')).completions.some(c=>c.stageId===stage))continue;const directory=path.join(work,stage);fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'TaskServer.java'),stage==='transfer'?java.replaceAll('/api/tasks/','/api/notes/').replaceAll('学习 HTTP','第一条笔记').replaceAll('completed','archived'):java);const b=await pair('http-json-basics','1.1.0',stage,directory),job=await check(b);assert(job.status==='passed',stage+': HTTP prerequisite passes');const u=await understand(b,job,httpSolutions[stage]);assert(u.status===200&&u.body.passed,stage+': prerequisite double result');console.log('HTTP prerequisite complete:',stage)}
 await api('/sql/environment/start',{});for(let i=0;i<200;i++){if((await api('/sql/environment')).status==='ready')break;await pause(300)}
 const sql=[['db-connect','SELECT 1 AS connected,DATABASE() AS current_database;',1],['db-model','CREATE TABLE tasks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,completed BOOLEAN NOT NULL DEFAULT 0);',1],['sql-read','SELECT id,title FROM tasks WHERE completed=0 ORDER BY id;',2],['sql-write',"INSERT INTO tasks VALUES (9,'整理笔记',0); UPDATE tasks SET completed=1 WHERE id=1; DELETE FROM tasks WHERE id=2;",1],['sql-page','SELECT id,title,completed FROM tasks ORDER BY completed,id LIMIT 2 OFFSET 2;',0],['sql-transfer',"CREATE TABLE bookmarks (id INT PRIMARY KEY,title VARCHAR(100) NOT NULL,saved BOOLEAN NOT NULL DEFAULT 0); INSERT INTO bookmarks VALUES (1,'Java文档',0),(2,'SQL手册',0),(3,'接口笔记',0); UPDATE bookmarks SET saved=1 WHERE id=1; DELETE FROM bookmarks WHERE id=2; SELECT id,title FROM bookmarks WHERE saved=0 ORDER BY id;",1]];
 for(const [stageId,source,answer] of sql){if((await api('/learning/progress/sql-foundations/1.0.0')).completions.some(c=>c.stageId===stageId))continue;const a=await api('/sql/attempts',{courseVersion:'1.0.0',stageId,mode:'check',sql:source,idempotencyKey:crypto.randomUUID()}),done=await terminal('/sql/attempts/'+a.id);assert(done.status==='passed',stageId+': real SQL prerequisite passes');const rule=await api('/sql/rules/'+stageId);const answers=Object.fromEntries(rule.questions.map(q=>[q.id,answer]));const u=await api('/sql/understanding',{attemptId:a.id,courseVersion:'1.0.0',stageId,ruleVersion:rule.ruleVersion,currentSql:source,answers,idempotencyKey:crypto.randomUUID()});assert(u.passed,stageId+': SQL double result');console.log('SQL prerequisite complete:',stageId)}
 }
 for(const courseId of ['boot-foundations','task-manager']) {
  const course=JSON.parse(fs.readFileSync(path.join(root,'course-packs',courseId,'1.0.0/project.json'),'utf8'));
  const published=await api('/courses/'+courseId+'/versions/1.0.0');assert(!JSON.stringify(published).includes('formalAnswer'),courseId+': formal answers are private');
  const initial=(await api('/learning/progress/'+courseId+'/1.0.0')).completedCount;
  for(const [index,chapter] of course.chapters.entries()) {
   if(index<initial)continue;
   const stage=chapter.stageId,directory=path.join(work,stage);fs.cpSync(path.join(root,'course-packs',courseId,'1.0.0',stage,'reference'),directory,{recursive:true});
   const b=await pair(courseId,'1.0.0',stage,directory);const job=await check(b);assert(job.status==='passed',stage+': real functional check passes');
   assert((await api('/learning/progress/'+courseId+'/1.0.0')).completedCount===index,stage+': functionality alone cannot complete');
   const wrong={...chapter.formalAnswer,apply:(chapter.formalAnswer.apply+1)%3};let u=await understand(b,job,wrong);assert(u.status===200&&!u.body.passed,stage+': wrong understanding does not complete');
   if(stage==='boot-start'){
    const file=path.join(directory,'src/main/java/dev/codesomething/lab/HealthController.java'),original=fs.readFileSync(file,'utf8');fs.writeFileSync(file,original+'\n// changed source');u=await understand(b,job,chapter.formalAnswer);assert(u.status===409&&u.body.code==='FUNCTIONAL_REQUIRED','Changed source cannot reuse an old functional report');fs.writeFileSync(file,original);
    const preview=await request('/learning/sessions/local',{courseId,courseVersion:'1.0.0',stageId:'boot-jdbc',step:'task',expectedRevision:(await api('/learning/continue')).session?.revision||0},undefined,'PUT');assert(preview.status===409&&preview.body.code==='PREVIEW_ONLY','Preview does not replace the formal learning cursor');
   }
   const key=crypto.randomUUID();u=await understand(b,job,chapter.formalAnswer,key);assert(u.status===200&&u.body.passed,stage+': double result completes');assert((await understand(b,job,chapter.formalAnswer,key)).body.id===u.body.id,stage+': understanding retry is idempotent');
   assert((await api('/learning/progress/'+courseId+'/1.0.0')).completedCount===index+1,stage+': exactly one completion persisted');
   const resume=await api('/learning/continue');await api('/learning/sessions/local',{courseId,courseVersion:'1.0.0',stageId:stage,step:'report',expectedRevision:resume.session?.revision||0},undefined,'PUT');
   const position=await api('/learning/continue');assert(position.session.courseId===courseId&&position.session.stageId===stage,stage+': cross-course resume is correct');
   console.log('Boot/A double result complete:',stage);
   fs.writeFileSync(path.join(evidence,'journey-in-progress.json'),JSON.stringify(report,null,2));
  }
  assert((await api('/learning/progress/'+courseId+'/1.0.0')).projectCompleted,courseId+': all stages complete');
 }
 report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'journey.json'),JSON.stringify(report,null,2));console.log('Journey passed:',report.checks.length,'assertions');
}catch(error){fs.writeFileSync(path.join(evidence,'journey-failed.json'),JSON.stringify({...report,error:String(error)},null,2));throw error}

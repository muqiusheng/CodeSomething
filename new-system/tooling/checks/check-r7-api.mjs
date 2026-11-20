import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve('new-system'),base='http://127.0.0.1:5189/api/v1',out=path.join(root,'docs/acceptance/R7'),testData=process.env.CS_R7_API_DATA||'r7-api-final';
fs.mkdirSync(out,{recursive:true});
const report={checks:[],stages:[],prerequisites:'Six explicitly synthetic project-A completion fixtures in isolated runtime/r7-api only. R7 submissions/jobs/completions use real APIs and Docker.'};
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
async function request(route,body,token,method=body===undefined?'GET':'POST',status=200){
 const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();check(response.status===status,method+' '+route+' '+status+' (got '+response.status+')');return result;
}
const project=JSON.parse(fs.readFileSync(path.join(root,'course-packs/collaboration/1.0.0/project.json'),'utf8'));
const course=await request('/courses/collaboration/versions/1.0.0');check(course.chapters.length===8&&!JSON.stringify(course).includes('formalAnswer'),'Eight public chapters hide answer key');
await request('/courses/collaboration/versions/99.0.0',undefined,undefined,'GET',404);
check((await request('/learning/progress/collaboration/1.0.0')).completedCount===0,'Fresh isolated project B starts empty');
for(const [index,chapter] of project.chapters.entries()){
 const stage=chapter.stageId,directory=path.join(root,'course-packs/collaboration/1.0.0',stage,'reference');
 const preview=await request('/workspace-previews',{directory,courseId:'collaboration',courseVersion:'1.0.0',stageId:stage});
 const binding=await request('/workspace-bindings',{previewId:preview.id,pairingCode:preview.pairingCode});
 const token=binding.token;
 await request('/submissions',{bindingId:binding.id,expectedDigest:preview.digest},undefined,'POST',401);
 const submission=await request('/submissions',{bindingId:binding.id,expectedDigest:preview.digest},token);
 const body={submissionId:submission.id,idempotencyKey:'r7-'+stage};let job=await request('/check-jobs',body,token);
 check((await request('/check-jobs',body,token)).id===job.id,'Check creation is idempotent '+stage);
 let count=0;
 while(['queued','running','cancelling'].includes(job.status)){
  if(count++>1000)throw Error('Check did not finish '+stage);await new Promise(r=>setTimeout(r,500));
  // Polling is recorded once per completed job, not as hundreds of assertions.
  const response=await fetch(base+'/jobs/'+job.id,{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);job=await response.json();
 }
 check(job.status==='passed'&&job.report.functionalPassed,'Actual Docker job passes '+stage);
 check(job.report.snapshotDigest===preview.digest,'Report binds exact snapshot '+stage);
 const rule=await request('/understanding-rules/collaboration/1.0.0/'+stage);check(rule.questions.length===2&&!JSON.stringify(rule).includes('correct'),'Two fresh formal questions '+stage);
 const answers={jobId:job.id,ruleVersion:'1',answers:chapter.formalAnswer,idempotencyKey:'understand-'+stage};
 if(index===0){
  const blocked=await request('/understanding-attempts',answers,token,'POST',409);check(blocked.code==='PREREQUISITE_REQUIRED','Project A prerequisite enforced');
  const seeded=spawnSync('python',[path.join(root,'tooling/checks/r7-prerequisite-fixtures.py'),path.join(root,'runtime',testData,'codesomething.db'),submission.id,job.id,binding.id,preview.digest],{encoding:'utf8',windowsHide:true});
  assert.equal(seeded.status,0,seeded.stderr);check(true,'Synthetic prerequisites confined to isolated test database');
 }
 const wrong={...answers,idempotencyKey:'wrong-'+stage,answers:{...chapter.formalAnswer,apply:(chapter.formalAnswer.apply+1)%3}};
 check(!(await request('/understanding-attempts',wrong,token)).passed,'Wrong concept does not complete '+stage);
 const passed=await request('/understanding-attempts',answers,token);check(passed.passed,'Double result completes '+stage);
 check((await request('/understanding-attempts',answers,token)).id===passed.id,'Understanding retry is idempotent '+stage);
 const progress=await request('/learning/progress/collaboration/1.0.0');check(progress.completedCount===index+1,'Authoritative progress '+stage);
 const resume=await request('/learning/continue');
 await request('/learning/sessions/local',{courseId:'collaboration',courseVersion:'1.0.0',stageId:stage,step:'report',expectedRevision:resume.session?.revision||0},undefined,'PUT');
 const continuing=await request('/learning/continue');check(continuing.session.courseId==='collaboration'&&continuing.nextAction===(index===7?'project-summary':'next-stage'),'Cross-course resume '+stage);
 report.stages.push({stageId:stage,submissionId:submission.id,jobId:job.id,digest:preview.digest,understandingId:passed.id,assertions:job.report.assertions.length});
 // Keep local browser handoff private; public evidence never includes pairing credentials.
 if(index===0)fs.writeFileSync(path.join(root,'runtime/r7-browser-binding.json'),JSON.stringify({binding,submission,job}));
 fs.writeFileSync(path.join(out,'api.json'),JSON.stringify(report,null,2));console.log(stage+' real job + formal understanding completed');
}
const profile=await request('/learner/profile');check(profile.knowledge.filter(k=>k.skill.courseId==='collaboration').length===8,'Eight skills project real completion evidence');
const review=await request('/learner/reviews',{stageId:'b-transaction',help:'none'});check(review.options.length===3,'R7 transfer review available');
check((await request('/learner/reviews/'+review.id+'/answer',{answer:1})).passed,'R7 review graded by server');
report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'api.json'),JSON.stringify(report,null,2));
console.log('R7 real submission → check → understanding → completion → resume flow passed');

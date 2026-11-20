import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const x=JSON.parse(fs.readFileSync('new-system/runtime/r7-interruption.json','utf8')),base='http://127.0.0.1:5189/api/v1';
async function get(route){const r=await fetch(base+route,{headers:{Authorization:'Bearer '+x.token}});assert.equal(r.status,200);return r.json()}
const job=await get('/jobs/'+x.jobId),progress=await get('/learning/progress/collaboration/1.0.0'),resume=await get('/learning/continue');
assert.equal(job.status,'environment_error');assert.equal(job.report.policy,'interrupted');assert.equal(progress.completedCount,8);assert.equal(resume.session.courseId,'collaboration');assert.equal(resume.session.stageId,'b-login');assert.equal(resume.nextAction,'next-stage');
const docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const containers=spawnSync(docker,['ps','-a','--filter','label=codesomething.r33-job='+job.id,'--format','{{.Names}}'],{encoding:'utf8',windowsHide:true});assert.equal(containers.status,0);assert.equal(containers.stdout.trim(),'');
const networks=spawnSync(docker,['network','ls','--filter','label=codesomething.r33-job='+job.id,'--format','{{.Name}}'],{encoding:'utf8',windowsHide:true});assert.equal(networks.status,0);assert.equal(networks.stdout.trim(),'');
fs.writeFileSync('new-system/docs/acceptance/R7/recovery.json',JSON.stringify({jobId:job.id,status:job.status,report:job.report,completedCount:progress.completedCount,session:resume.session,nextAction:resume.nextAction,ownedContainers:[],ownedNetworks:[],verifiedAt:new Date().toISOString()},null,2));
console.log('Forced interruption recovered as environment_error; eight completions, persisted position and owned-resource cleanup verified.');

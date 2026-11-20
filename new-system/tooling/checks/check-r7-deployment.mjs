import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const base='http://127.0.0.1:5197/api';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'Learn-2026!'})});assert.equal(login.status,200);const auth=await login.json();
async function get(route){const r=await fetch(base+route,{headers:{Authorization:'Bearer '+auth.token}});assert.equal(r.status,200);return r.json()}
const plans=await get('/plans'),plan=plans.at(-1);assert(plan.id>2,'UI-created plan required for restart evidence');
const tasks=await get('/plans/'+plan.id+'/tasks?size=50');assert.equal(tasks.total,2);assert(tasks.items.some(t=>t.status==='done'));
const docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const inspected=spawnSync(docker,['inspect','cs-r7-acceptance-ui-app'],{encoding:'utf8',windowsHide:true});assert.equal(inspected.status,0);const info=JSON.parse(inspected.stdout)[0];assert.equal(info.Config.Labels['codesomething.r7-deploy'],'acceptance-ui');
const restarted=spawnSync(docker,['restart','--time=10','cs-r7-acceptance-ui-app'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(restarted.status,0,restarted.stderr);
let healthy=false;for(let i=0;i<60;i++){try{const r=await fetch(base+'/health');if(r.ok&&(await r.json()).status==='ok'){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert(healthy);
assert.deepEqual(await get('/plans'),plans);assert.deepEqual(await get('/plans/'+plan.id+'/tasks?size=50'),tasks);
fs.writeFileSync('new-system/docs/acceptance/R7/deployment-restart.json',JSON.stringify({instance:'acceptance-ui',planId:plan.id,taskCount:tasks.total,completedTasks:tasks.items.filter(t=>t.status==='done').length,plansAndTasksPreserved:true,sameSessionPreserved:true,loopbackOnly:info.HostConfig.PortBindings['8080/tcp'][0].HostIp==='127.0.0.1',verifiedAt:new Date().toISOString()},null,2));
console.log('Actual deployed JAR restart retained UI-created plans, tasks, completed state and the same server session.');

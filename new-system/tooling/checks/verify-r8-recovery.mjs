import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const prior=JSON.parse(fs.readFileSync('new-system/runtime/r8-interruption.json','utf8')),base='http://127.0.0.1:5189/api/v1/portfolio',docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const checks=[];function check(p,name){checks.push({pass:!!p,name});assert(p,name)}
async function req(p,body){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json()}
let w;for(let n=0;n<100;n++){try{w=await req('/'+prior.id);if(w.checks[0].status==='interrupted')break}catch{}await new Promise(r=>setTimeout(r,300))}
check(w.checks.length===1&&w.checks[0].id===prior.job&&w.checks[0].status==='interrupted','forced restart preserves same job as interrupted');check(w.checks[0].digest===prior.digest,'immutable source digest survives process kill');
w=await req('/'+prior.id+'/checks',prior.payload);check(w.checks.length===1,'retry of lost response does not duplicate job');
for(const args of [['ps','-a','--filter','label=codesomething.r8-job='+prior.job,'-q'],['network','ls','--filter','label=codesomething.r8-job='+prior.job,'-q']]){const r=spawnSync(docker,args,{encoding:'utf8',windowsHide:true,timeout:20000});check(r.status===0&&!r.stdout.trim(),'restart cleans owned '+args[0]+' resources')}
check(!fs.existsSync('new-system/runtime/r8-acceptance/data/portfolio-runner/'+prior.job),'restart removes temporary input directory');
w=await req('/'+prior.id+'/checks',{...prior.payload,idempotencyKey:'cancel-'+crypto.randomUUID()});const job=w.checks.at(-1).id;await req('/'+prior.id+'/checks/'+job+'/stop',{});
for(let n=0;n<100;n++){w=await req('/'+prior.id);if(w.checks.at(-1).status==='cancelled')break;await new Promise(r=>setTimeout(r,200))}
check(w.checks.at(-1).status==='cancelled','explicit stop cancels real queued or running job');check(w.state==='in-progress'&&w.independence==='待实际回访核实','interruption and cancellation never certify learning');
fs.writeFileSync('new-system/docs/acceptance/R8/process-recovery.json',JSON.stringify({checks,job:prior.job,digest:prior.digest,finishedAt:new Date().toISOString()},null,2));console.log(checks.length+' process recovery checks passed');

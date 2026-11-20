import {spawnSync} from 'node:child_process';import fs from 'node:fs';import assert from 'node:assert/strict';
const base='http://127.0.0.1:5197',docker='C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const checks=[];function check(pass,name){checks.push({pass:!!pass,name});assert(pass,name)}
async function req(path,body,token){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});assert(r.ok,'HTTP '+r.status);return r.json()}
const login=()=>req('/api/auth/login',{username:'alice',password:'Learn-2026!'}).then(v=>v.token);
let token=await login();const created=await req('/api/reservations',{resourceId:2,quantity:1},token);const before=await req('/api/resources',null,token);
for(const name of ['cs-r8-acceptance-app','cs-r8-acceptance-db']){const r=spawnSync(docker,['restart',name],{encoding:'utf8',windowsHide:true,timeout:40000});assert.equal(r.status,0,r.stderr)}
let ready=false;for(let n=0;n<80;n++){try{token=await login();ready=true;break}catch{await new Promise(r=>setTimeout(r,500))}}
check(ready,'database and application restart with durable volume');const after=await req('/api/resources',null,token),list=await req('/api/reservations',null,token);
check(list.some(v=>v.id===created.id&&v.status==='active'),'original reservation survives database and app restart');check(JSON.stringify(before)===JSON.stringify(after),'resource capacity survives complete deployment restart');
fs.writeFileSync('new-system/docs/acceptance/R8/deployment-persistence.json',JSON.stringify({checks,finishedAt:new Date().toISOString()},null,2));console.log(checks.length+' deployment persistence checks passed');

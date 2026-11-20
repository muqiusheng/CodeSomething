import fs from 'node:fs';import assert from 'node:assert/strict';
const base='http://127.0.0.1:5189/api/v1',local=JSON.parse(fs.readFileSync('new-system/runtime/r7-browser-binding.json','utf8'));
async function req(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+local.binding.token},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json()}
const p=await req('/workspace-bindings/'+local.binding.id+'/preview');const s=await req('/submissions',{bindingId:local.binding.id,expectedDigest:p.digest});let j=await req('/check-jobs',{submissionId:s.id,idempotencyKey:'r7-recovery-final'});
for(let i=0;i<100&&j.status==='queued';i++){await new Promise(r=>setTimeout(r,100));j=await req('/jobs/'+j.id)}
assert.equal(j.status,'running');fs.writeFileSync('new-system/runtime/r7-interruption.json',JSON.stringify({jobId:j.id,token:local.binding.token}));
fs.writeFileSync('new-system/docs/acceptance/R7/interruption-before.json',JSON.stringify({jobId:j.id,status:j.status,at:new Date().toISOString()},null,2));console.log('A real R7 check is running and ready for forced process interruption.');

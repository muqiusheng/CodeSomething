import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const base='http://127.0.0.1:5189/api/v1/portfolio';
async function req(p,body){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json()}
const work=await req('',{theme:'中断恢复工程夹具',domain:'reservation',idempotencyKey:'recovery-'+crypto.randomUUID()});
const preview=await req('/'+work.id+'/previews',{directory:path.resolve('new-system/tooling/fixtures/r8-reservation'),phase:'core'});
const payload={previewId:preview.id,idempotencyKey:'interruption-'+crypto.randomUUID()};await req('/'+work.id+'/checks',payload);
let state;for(let n=0;n<100;n++){state=await req('/'+work.id);if(state.checks[0].status==='running')break;await new Promise(r=>setTimeout(r,100))}
assert.equal(state.checks[0].status,'running');fs.writeFileSync('new-system/runtime/r8-interruption.json',JSON.stringify({id:work.id,job:state.checks[0].id,digest:preview.digest,payload}));console.log('Prepared one real running job for forced restart.');

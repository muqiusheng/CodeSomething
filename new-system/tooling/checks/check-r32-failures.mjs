import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
const base='http://127.0.0.1:5189/api/v1',container='cs-sql-r32-acceptance';
const report={checks:[],attempts:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
async function api(p,body){const r=await fetch(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
const docker=(...args)=>{const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:15000});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim()};
async function submit(sql,mode='practice',stageId='sql-read'){const r=await api('/sql/attempts',{courseVersion:'1.0.0',stageId,mode,sql,idempotencyKey:crypto.randomUUID()});assert(r.status===200,'SQL attempt accepted');return r.body.id}
async function terminal(id){for(let i=0;i<140;i++){const r=(await api('/sql/attempts/'+id)).body;if(!['queued','running','cancelling'].includes(r.status)){report.attempts.push(r);return r}await pause(150)}throw new Error('Attempt stuck '+id)}
async function lock(){
 const child=spawn('docker',['exec','-i',container,'mysql','-uroot','--batch','--unbuffered'],{windowsHide:true});
 child.stderr.on('data',()=>{});
 await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Lock timeout')),5000);child.stdout.on('data',data=>{text+=data;if(text.includes('lock-held')){clearTimeout(timer);resolve()}});child.on('exit',code=>reject(new Error('Lock connection exited '+code)));child.stdin.write("USE cs_practice; LOCK TABLES tasks WRITE; SELECT 'lock-held';\n")});
 return async()=>{child.stdin.end('UNLOCK TABLES;\n');await new Promise(r=>child.once('exit',r));};
}
try {
 let release=await lock();
 try{const id=await submit('SELECT id,title FROM tasks ORDER BY id;');const a=await terminal(id);assert(a.status==='timeout','A real blocked MySQL query reaches the timeout state');}finally{await release()}
 release=await lock();
 try{const id=await submit('SELECT id,title FROM tasks ORDER BY id;');for(let i=0;i<40;i++){if((await api('/sql/attempts/'+id)).body.status==='running')break;await pause(80)}await pause(200);await api('/sql/attempts/'+id+'/cancel',{});assert((await terminal(id)).status==='cancelled','Stop cancels a running blocked MySQL query');}finally{await release()}
 const clean=docker('exec',container,'mysql','-uroot','--batch','-e',"SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE USER='cs_practice';");assert(clean.endsWith('\n0'),'Cancelled and timed-out clients release MySQL connections');
 const ids=await Promise.all([submit('SELECT 1 AS connected,DATABASE() AS current_database;','check','db-connect'),submit('SELECT 1 AS connected,DATABASE() AS current_database;','check','db-connect')]);
 const isolated=await Promise.all(ids.map(terminal));assert(isolated.every(a=>a.status==='passed'),'Simultaneously submitted checks both pass');
 assert(isolated[0].report.result.rows[0][1]!==isolated[1].report.result.rows[0][1],'Each formal attempt has a different database');
 assert(docker('exec',container,'mysql','-uroot','--batch','-e',"SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name LIKE 'cs_check_%';").endsWith('\n0'),'Formal attempt databases are removed after checks');
 for(const sql of ['INSERT INTO tasks SELECT id,title,completed FROM tasks;','CREATE TABLE bookmarks (id INT) AS SELECT id FROM tasks;'])assert((await api('/sql/attempts',{courseVersion:'1.0.0',stageId:'sql-write',mode:'practice',sql,idempotencyKey:crypto.randomUUID()})).status===400,'Bulk subquery writing is rejected before execution');
 docker('stop',container);
 const stopped=await terminal(await submit('SELECT id,title FROM tasks;'));assert(stopped.status==='environment_error','Stopped MySQL is classified as an environment failure');
 await api('/sql/environment/start',{});
 for(let i=0;i<100;i++){if((await api('/sql/environment')).body.status==='ready')break;await pause(250)}
 const restored=await terminal(await submit('SELECT id,title FROM tasks ORDER BY id;'));assert(restored.status==='executed'&&restored.report.result.rows.length===6,'Restart restores practice data from the persistent volume');
 const semantics=docker('exec',container,'mysql','-uroot','--batch','-e',"CREATE DATABASE cs_semantics_r32; USE cs_semantics_r32; CREATE TABLE flags(id INT PRIMARY KEY,done BOOLEAN NOT NULL DEFAULT 0); SET autocommit=0; INSERT INTO flags(id) VALUES(1); CREATE TABLE marker(id INT); ROLLBACK; SELECT id,done FROM flags; DROP DATABASE cs_semantics_r32;");
 assert(semantics.includes('1\t0'),'Real MySQL BOOLEAN defaults to 0 and CREATE TABLE implicitly commits preceding writes');report.mysqlSemantics=semantics;
 assert((await api('/learning/progress/sql-foundations/1.0.0')).body.completedCount===6,'Timeout, cancellation and environment failures preserve existing completion evidence');
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync('new-system/docs/acceptance/R3.2/failure-checks.json',JSON.stringify(report,null,2))}

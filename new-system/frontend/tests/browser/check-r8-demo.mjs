import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-r8-demo',out=path.resolve('new-system/docs/acceptance/R8');assert(bin);
const report={checks:[],startedAt:new Date().toISOString()};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
try{
 run('open','http://127.0.0.1:5197/');run('snapshot','-i');run('fill','input[name=password]','wrong');click('登录');run('wait','--text','账号或密码不正确');check(ev('document.getElementById("mine").textContent')==='','failed login has no previous-user data');
 run('fill','input[name=password]','Learn-2026!');click('登录');run('wait','--text','已刷新');check(ev('JSON.parse(document.getElementById("resources").textContent)[0].available')===3,'fresh real MySQL resources available');
 run('fill','input[name=resourceId]','1');run('fill','input[name=quantity]','2');click('预约');run('wait','--fn','document.getElementById("mine").textContent.includes("active")');
 const mine=ev('JSON.parse(document.getElementById("mine").textContent)');const booking=mine.find(x=>x.status==='active');check(booking?.quantity===2,'real frontend reservation recorded');check(ev('JSON.parse(document.getElementById("resources").textContent)[0].available')===1,'frontend shows updated inventory');
 run('fill','input[name=username]','bob');click('登录');run('wait','--fn','document.getElementById("mine").textContent.trim()==="[]"');check(ev('document.getElementById("mine").textContent').trim()==='[]','switching identity clears prior reservations');
 run('fill','input[name=id]',String(booking.id));click('取消预约');run('wait','--text','无权取消');check(ev('JSON.parse(document.getElementById("resources").textContent)[0].available')===1,'unauthorized cancel leaves inventory unchanged');
 run('fill','input[name=username]','alice');click('登录');run('wait','--fn','document.getElementById("mine").textContent.includes("active")');click('取消预约');run('wait','--fn','JSON.parse(document.getElementById("resources").textContent)[0].available===3');click('取消预约');run('wait','--text','已刷新');check(ev('JSON.parse(document.getElementById("resources").textContent)[0].available')===3,'repeat cancellation never restores inventory twice');
 for(const width of [320,375,768,1440]){run('set','viewport',String(width),'1000');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'deployed demo '+width+' no overflow')}
 run('screenshot',path.join(out,'deployed-demo.png'));report.finishedAt=new Date().toISOString();
}finally{fs.writeFileSync(path.join(out,'deployment-browser.json'),JSON.stringify(report,null,2));try{run('close')}catch{}}
console.log(report.checks.length+' deployed browser checks passed');

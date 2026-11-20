import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const browser=process.env.CS_BROWSER_BIN;
if(!browser)throw new Error('Set CS_BROWSER_BIN.');
const session='cs-r1-web-1111';
const evidence=path.resolve('new-system/docs/acceptance/R1');
const direct='http://127.0.0.1:5188/api/v1';
const front='http://127.0.0.1:5178';
const report={checks:[],layout:[]};
const original=await fetch(direct+'/profiles/me/preferences').then(r=>r.json());
function run(...args){const r=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout.trim();}
function evaluate(code){const r=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout);}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message);}
async function current(){return fetch(direct+'/profiles/me/preferences').then(r=>r.json());}
async function restore(){await fetch(direct+'/profiles/me/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({dailyMinutes:original.dailyMinutes,motion:original.motion})});}

try{
  const health=await fetch(front+'/api/v1/health').then(r=>r.json());
  assert(health.status==='UP'&&health.database.status==='UP','Vite proxy reaches real Spring Boot and SQLite health');
  run('open',front+'/settings');run('set','viewport','1440','1000');run('wait','--text','本机数据库');run('snapshot','-i');
  run('select','#duration','30');run('find','role','button','click','--name','保存偏好');run('wait','--text','已保存到本机数据库');
  assert((await current()).dailyMinutes===30,'Settings form writes duration to SQLite');
  evaluate(`localStorage.removeItem('cs-duration');true`);run('reload');run('wait','--text','本机数据库');
  assert(evaluate(`document.querySelector('#duration').value==='30'`),'Settings restore from server with browser duration cache removed');
  run('find','role','button','click','--name','减少动效');run('wait','--text','已保存到本机数据库');
  assert((await current()).motion==='reduce','Motion preference writes to SQLite');
  run('open',front+'/learn');run('wait','250');
  assert(evaluate(`document.querySelector('.daily').textContent.includes('30')`),'Home reads server-backed daily duration');
  run('open',front+'/settings');run('wait','--text','本机数据库');
  run('network','route',front+'/api/v1/profiles/me/preferences','--abort');
  run('select','#duration','90');run('find','role','button','click','--name','保存偏好');run('wait','--text','未保存到本机数据库');
  assert((await current()).dailyMinutes===30,'Failed network save leaves server value unchanged');
  assert(evaluate(`localStorage.getItem('cs-duration')==='90'`),'Failed network save reports a browser-only fallback');
  run('screenshot',path.join(evidence,'settings-save-offline.png'));
  run('network','unroute',front+'/api/v1/profiles/me/preferences');
  run('find','role','button','click','--name','保存偏好');run('wait','--text','已保存到本机数据库');
  assert((await current()).dailyMinutes===90,'Retry saves successfully after the connection is restored');
  await restore();
  run('reload');run('wait','--text','本机数据库');run('wait','250');
  for(const width of [1440,1024,768,375,320]){
    run('set','viewport',String(width),'1000');run('wait','250');
    const dimensions=evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth})`);
    report.layout.push(dimensions);assert(dimensions.document<=width,`Settings have no horizontal overflow at ${width}px`);
    if(width===1440||width===375)run('screenshot',path.join(evidence,`settings-connected-${width}.png`));
  }
  const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));report.accessibility=audit.data.counts;
  fs.writeFileSync(path.join(evidence,'axe-settings-connected.json'),JSON.stringify(audit,null,2));
  assert(audit.data.counts.violations===0,'Connected settings have zero axe WCAG2A/AA violations');
  report.result='passed';
}catch(error){report.result='failed';report.error=String(error);throw error;}
finally{
  await restore();run('close');fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}

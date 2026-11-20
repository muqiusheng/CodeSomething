import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-r8-finish',out=path.resolve('new-system/docs/acceptance/R8'),report={checks:[],audits:[]};assert(bin);
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(p,name){report.checks.push({pass:!!p,name});assert(p,name)}
try{
 run('open','http://127.0.0.1:5178/portfolio');run('wait','--text','开始独立作品');check((await (await fetch('http://127.0.0.1:5188/api/v1/portfolio')).json()).length===0,'daily instance has no acceptance portfolios');run('set','viewport','320','1000');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'daily portfolio 320px no overflow');
 const id=fs.readFileSync('new-system/runtime/r8-browser-work.txt','utf8').trim();run('open','http://127.0.0.1:5179/portfolio/'+id+'?step=design');run('wait','--text','本机部署与停止');run('find','text','本机部署与停止','click');
 for(const mode of ['light','dark']){
  if(ev('document.documentElement.dataset.theme')!==mode)run('find','role','button','click','--name',mode==='light'?'切换到浅色模式':'切换到深色模式','--exact');
  for(const width of [320,1440]){run('set','viewport',String(width),'1000');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'deployment instructions '+mode+' '+width+' no overflow')}
  const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-deployment-help-'+mode+'.json'),JSON.stringify(audit,null,2));report.audits.push({mode,counts:audit.data.counts});check(audit.data.counts.violations===0,'deployment instructions '+mode+' axe zero violations');run('screenshot',path.join(out,'deployment-help-'+mode+'.png'));
 }
 report.finishedAt=new Date().toISOString();
}finally{fs.writeFileSync(path.join(out,'browser-finish.json'),JSON.stringify(report,null,2));try{run('close')}catch{}}
console.log(report.checks.length+' final browser assertions passed');

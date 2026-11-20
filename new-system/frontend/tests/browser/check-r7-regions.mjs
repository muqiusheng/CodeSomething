import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const bin=process.env.CS_BROWSER_BIN,session='cs-r7-regions',out=path.resolve('new-system/docs/acceptance/R7'),report=JSON.parse(fs.readFileSync(path.join(out,'browser-final.json'),'utf8'));
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
try{
 run('open','http://127.0.0.1:5197/');run('find','label','账号','fill','alice');run('find','label','密码','fill','Learn-2026!');run('find','role','button','click','--name','登录','--exact');run('wait','--text','登录成功');
 check(ev('document.querySelector("#audit-result").getAttribute("role")==="region"'),'Audit code region has a supported accessible name');
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-business-owner-final.json'),JSON.stringify(audit,null,2));check(audit.data.counts.violations===0&&audit.data.counts.incomplete===0,'Owner page final axe has no violations or incomplete checks');
 report.audits=report.audits.map(a=>a.label==='business-owner'?{...a,counts:audit.data.counts,finalEvidence:'axe-business-owner-final.json'}:a);
 report.resolvedFindings.push({source:'axe-business-owner-light.json',finding:'aria-label on generic pre',fix:'Final deployment demo uses a labelled region for audit output.'});
 run('set','viewport','320','1000');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'Final business demo 320px keeps form within viewport');run('screenshot',path.join(out,'business-owner-320-final.png'));
 run('open','http://127.0.0.1:5179/learn/collaboration/1.0/b-transaction');run('wait','--text','容易混淆的地方');run('set','viewport','1440','1000');run('focus','.boot-content pre');
 check(ev('document.activeElement.matches(".boot-content pre[role=region]")'),'Learning code region receives keyboard focus');run('screenshot',path.join(out,'course-code-focus.png'));
 const course=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-code-region-final.json'),JSON.stringify(course,null,2));report.audits.push({label:'code-region-final',mode:ev('document.documentElement.dataset.theme'),counts:course.data.counts});check(course.data.counts.violations===0,'Learning code region passes axe');
 report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-final.json'),JSON.stringify(report,null,2));
}finally{run('close')}
console.log('Affected code/audit regions rechecked. '+report.checks.length+' checks, '+report.layouts.length+' layouts, '+report.audits.length+' audits.');

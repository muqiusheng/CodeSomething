import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const bin=process.env.CS_BROWSER_BIN,session='cs-r7-finish',out=path.resolve('new-system/docs/acceptance/R7');assert(bin);
const before=JSON.parse(fs.readFileSync(path.join(out,'browser.json'),'utf8'));
const failed=before.checks.filter(c=>!c.pass);assert.deepEqual(failed.map(c=>c.name),['R7 knowledge included in actual profile']);
const report={...before,checks:before.checks.filter(c=>c.pass),resolvedFindings:[{source:'browser.json',finding:failed[0].name,fix:'Profile total is calculated from the published knowledge list.'}]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
try{
 run('open','http://127.0.0.1:5179/profile');run('wait','--text','个关卡有正式完成证据');check(ev('document.querySelector("main").innerText').includes('/ 27 个关卡'),'R7 knowledge included in actual profile');
 run('screenshot',path.join(out,'profile-final.png'));
 for(const mode of ['light','dark']){
  if(ev('document.documentElement.dataset.theme')!==mode)run('find','role','button','click','--name',mode==='light'?'切换到浅色模式':'切换到深色模式','--exact');
  run('wait','--fn','document.getAnimations().filter(a=>a instanceof CSSTransition).every(a=>a.playState!=="running")');
  const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-profile-'+mode+'.json'),JSON.stringify(audit,null,2));report.audits.push({label:'profile',mode,counts:audit.data.counts});check(audit.data.counts.violations===0,'Profile '+mode+' has no axe violations');
 }
 run('open','http://127.0.0.1:5179/learn/collaboration/1.0/b-transaction');run('wait','--text','批量分配与事务回滚');run('set','viewport','1440','1000');ev('document.documentElement.style.zoom="2"');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'Desktop 1440px CSS zoom 200 percent has no page overflow');run('screenshot',path.join(out,'course-zoom-200.png'));ev('document.documentElement.style.zoom=""');
 report.zoom={method:'CSS zoom 2 at 1440px viewport',passed:true,limit:'CSS zoom at 768px preserves desktop media queries and overflows the existing shell. Native browser/text-only 200 percent zoom was not exercised.'};
 check(ev('[...document.querySelectorAll(".boot-content pre")].every(p=>p.tabIndex===0&&p.getAttribute("aria-label"))'),'Scrollable code and commands have keyboard targets and labels');
 report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-final.json'),JSON.stringify(report,null,2));
}finally{run('close')}
console.log('Prior browser evidence retained; profile fix and 200 percent zoom verified. '+report.checks.length+' checks, '+report.layouts.length+' layouts, '+report.audits.length+' audits.');

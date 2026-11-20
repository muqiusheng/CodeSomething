import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='codesomething-r32-finish',front='http://127.0.0.1:5179';
const dir=path.resolve('new-system/docs/acceptance/R3.2'),report={checks:[],layout:[],accessibility:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0||r.stdout.trim().startsWith('✗'))throw new Error(r.stdout+r.stderr);return r.stdout.trim()}
function evaluate(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(r.status!==0)throw new Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
function axe(label){const data=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(dir,'axe-final-'+label+'.json'),JSON.stringify(data,null,2));report.accessibility.push({label,...data.data.counts});assert(data.data.counts.violations===0,label+': no axe violations')}
try {
 const sql='SELECT id,title FROM tasks WHERE completed=0 ORDER BY id;';
 const fixture=path.resolve('new-system/runtime/r32-import.sql');fs.writeFileSync(fixture,sql);
 run('open',front+'/learn/sql/1.0/sql-read?tab='+encodeURIComponent('任务'));run('wait','.sql-source');
 run('upload','.sql-upload input',fixture);assert(evaluate(`document.querySelector('.sql-source').value===${JSON.stringify(sql)}`),'SQL file import fills the visible editor');
 run('reload');run('wait','.sql-source');assert(evaluate(`document.querySelector('.sql-source').value===${JSON.stringify(sql)}`),'Imported SQL draft survives reload');
 run('set','viewport','375','1000');assert(evaluate(`getComputedStyle(document.querySelector('.sql-chapter-nav')).display==='none'&&getComputedStyle(document.querySelector('.sql-chapter-select')).display!=='none'`),'Mobile has one compact accessible chapter selector');
 run('wait','--fn','document.querySelector(".sidebar").getBoundingClientRect().right <= 0');run('screenshot',path.join(dir,'task-375.png'));axe('task-375');
 run('select','.sql-chapter-select select','db-connect');run('wait','.sql-teaching');assert(evaluate(`location.pathname.endsWith('/db-connect')`),'Mobile chapter selector navigates to the selected chapter');
 for(const tab of ['教学','任务','检查报告']) {
  run('open',front+'/learn/sql/1.0/sql-read?tab='+encodeURIComponent(tab));run('wait','[role=tablist]');
  for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate('({width:innerWidth,document:document.documentElement.scrollWidth})');report.layout.push({tab,...size});assert(size.document<=width,tab+': no overflow at '+width)}
 }
 run('open',front+'/learn/sql/1.0/sql-read?tab='+encodeURIComponent('任务'));run('wait','.sql-source');run('set','viewport','1440','1000');
 run('click','[role=tab][data-state=active]');run('press','ArrowRight');run('press','Enter');assert(evaluate(`document.querySelector('[role=tab][data-state=active]').textContent==='检查报告'`),'Styled tabs preserve keyboard navigation');
 const progress=await (await fetch(front+'/api/v1/learning/progress/sql-foundations/1.0.0')).json();const completion=progress.completions.find(c=>c.stageId==='sql-read');
 run('open',front+'/learn/sql/1.0/sql-read?attempt='+completion.jobId+'&tab='+encodeURIComponent('检查报告'));run('wait','.snapshot-digest');
 assert(evaluate(`document.querySelector('.sql-report details code').textContent.includes('SELECT')&&document.querySelector('.snapshot-digest code').textContent===${JSON.stringify(completion.snapshotDigest)}`),'Exact completion deep link displays its original SQL snapshot and digest');
 run('screenshot',path.join(dir,'report-1440.png'));axe('report-1440');
 click('返回任务修改SQL');run('wait','.sql-source');run('fill','.sql-source','SELECT * FROM mysql.user;');click('提交正式检查');run('wait','.sql-error');
 assert(evaluate(`document.activeElement===document.querySelector('.sql-error')`),'Rejected SQL moves focus to its visible error');click('关闭提示');
 run('fill','.sql-source',sql);click('重置练习数据');run('wait','[role=dialog]');
 const focus=[];for(let i=0;i<8;i++){run('press','Tab');focus.push(evaluate(`!!document.activeElement.closest('[role=dialog]')`))}assert(focus.every(Boolean),'Reset confirmation keeps keyboard focus inside the dialog');
 report.dialogContrast=evaluate(`(()=>{const bg=getComputedStyle(document.querySelector('[role=dialog]')).backgroundColor;return Array.from(document.querySelectorAll('[role=dialog] h2,[role=dialog] .modal-description')).map(el=>({text:el.textContent,color:getComputedStyle(el).color,background:bg}))})()`);
 function lum(s){return s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
 for(const c of report.dialogContrast){const x=lum(c.color),y=lum(c.background);c.ratio=(Math.max(x,y)+.05)/(Math.min(x,y)+.05);assert(c.ratio>=4.5,'Dialog text contrast passes: '+c.text)}
 run('press','Escape');assert(evaluate(`document.activeElement.textContent.includes('重置练习数据')`),'Dialog Escape returns focus without resetting');
 run('open',front+'/projects/sql-foundations');run('wait','.chapter-catalog-row');run('set','viewport','1440','1000');run('screenshot',path.join(dir,'project-1440.png'));
 report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync(path.join(dir,'finish-checks.json'),JSON.stringify(report,null,2));run('close')}

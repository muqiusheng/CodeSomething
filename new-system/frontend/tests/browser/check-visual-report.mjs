import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-report-validation';
const out=path.resolve('new-system/docs/acceptance/visual-report');fs.mkdirSync(out,{recursive:true});
const results=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(name,work){work();results.push(name);console.log('PASS '+name)}
function open(route,ready){run('open','http://127.0.0.1:5179'+route);run('wait','--text',ready)}
function shot(name){run('screenshot',path.join(out,name+'.png'))}
try{
 for(const theme of ['light','dark']){
  open('/learn','继续学习');ev(`localStorage.setItem('cs-theme',${JSON.stringify(theme)});true`);run('reload');
  for(const [label,route,ready] of [['home','/learn','继续学习'],['path','/path','学习内容'],['projects','/projects','按兴趣选项目'],['http','/learn/http-json/1.1/request?tab='+encodeURIComponent('教学'),'客户端先开口'],['sql','/learn/sql/1.0/db-connect','当前脚本']]){
   open(route,ready);
   for(const [width,height] of [[1280,720],[768,1024],[390,844],[320,740]]){
    run('set','viewport',String(width),String(height));
    check(`${theme}/${label}/${width}: no page overflow`,()=>assert(ev('document.documentElement.scrollWidth<=innerWidth')));
    if(label==='home')check(`${theme}/home/${width}: card inset`,()=>assert(ev(`document.querySelector('.continue-content').getBoundingClientRect().left-document.querySelector('.continue-card').getBoundingClientRect().left>=20`)));
    if(label==='sql'&&width>=960)check(`${theme}/sql: current task and editor share first viewport`,()=>{const r=ev(`(()=>{const a=document.querySelector('.sql-reading-pane').getBoundingClientRect(),b=document.querySelector('.sql-code-pane').getBoundingClientRect();return {top:a.top,code:b.top,right:a.right,left:b.left,bottom:b.bottom}})()`);assert(r.top<210&&Math.abs(r.top-r.code)<2&&r.left>r.right&&r.bottom<=height)});
    if(width===1280||width===390)shot(`${label}-${theme}-${width}`);
   }
   run('set','viewport','1280','720');
   if(label==='path')check(`${theme}/path: details initially collapsed`,()=>assert.equal(ev(`document.querySelectorAll('.phase-surface [data-state="open"]').length`),0));
   if(label==='http')check(`${theme}/http: readable measure`,()=>assert(ev(`document.querySelector('.chapter-teaching').getBoundingClientRect().width<=820`)));
   if(['home','http','sql','projects'].includes(label)){
    const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,`axe-${label}-${theme}.json`),JSON.stringify(audit,null,2));
    results.push({page:label,theme,axe:audit.data.counts});
   }
  }
 }
 open('/projects','按兴趣选项目');run('fill','.search input','不存在的项目');run('focus','.search input');
 check('Project search: one composite focus ring and usable empty state',()=>{const r=ev(`({outer:getComputedStyle(document.querySelector('.search')).outlineStyle,inner:getComputedStyle(document.querySelector('.search input')).outlineStyle,text:document.body.innerText})`);assert.equal(r.outer,'solid');assert.equal(r.inner,'none');assert(r.text.includes('没有'))});shot('search-focus');
 run('click','[aria-label="快捷导航"]');run('fill','[cmdk-input]','复习');
 check('Quick navigation: input autofocus and one ring',()=>assert.equal(ev(`getComputedStyle(document.querySelector('[cmdk-input]')).outlineStyle`),'none'));
 shot('command-focus');run('press','Escape');check('Escape restores trigger focus',()=>assert.equal(ev(`document.activeElement.getAttribute('aria-label')`),'快捷导航'));
 run('click','[aria-label="快捷导航"]');run('fill','[cmdk-input]','复习');run('press','Enter');run('wait','--url','**/reviews');results.push('Quick navigation: Enter opens reviews');
 open('/projects','按兴趣选项目');run('click','[aria-label="卡片布局"]');run('wait','--fn',`document.querySelectorAll('.course-artifact').length===7`);shot('project-artifacts');
 run('wait','--fn',`document.getAnimations().every(a=>a.playState!=='running')`);shot('project-artifacts');
 check('Every course preview describes an artifact and labels the example',()=>assert.equal(ev(`document.querySelectorAll('.artifact-heading').length`),7));
 open('/learn/sql/1.0/db-connect','当前脚本');run('set','viewport','390','844');
 run('find','role','button','click','--name','查看工程','--exact');
 check('SQL mobile: open workspace from the current step',()=>assert.equal(ev(`document.querySelector('.sql-workspace').dataset.pane`),'code'));
 const file=path.resolve('new-system/runtime/report-qa/connection.sql');fs.writeFileSync(file,'SELECT 1 AS connected, DATABASE() AS current_database;');run('upload','input[type=file]',file);run('wait','--text','connection.sql');
 run('click','.sql-code-pane>.text-button');run('wait','--fn',`!!document.querySelector('.sql-code-pane .monaco-editor')`);shot('sql-mobile-editor');
 run('find','role','button','click','--name','放大编辑','--exact');check('SQL mobile: editor expands',()=>assert(ev(`!!document.querySelector('.code-editor-shell[open]')`)));run('press','Escape');
 check('SQL mobile: Escape restores expand button focus',()=>assert.equal(ev(`document.activeElement.innerText`),'放大编辑'));
 run('click','.sql-pane-switch button:first-child');run('find','role','tab','click','--name','教学','--exact');run('find','role','tab','click','--name','任务','--exact');run('click','.sql-pane-switch button:last-child');
 check('SQL tab changes keep imported code and file identity',()=>assert(ev(`document.querySelector('.sql-code-pane').innerText.includes('connection.sql')&&document.querySelector('.sql-code-pane .view-lines').innerText.includes('SELECT')`)));
 // Real SQL execution against the dedicated cs-sql-report-qa environment.
 const start=await fetch('http://127.0.0.1:5189/api/v1/sql/environment/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert(start.ok,await start.text());
 run('find','role','button','click','--name','提交正式检查','--exact');run('wait','--fn',`document.querySelector('.sql-workspace').dataset.pane==='reading'`);
 run('wait','--text','SQL执行通过');shot('sql-check-result');
 check('SQL mobile: submit reveals the actual report',()=>assert(ev(`document.querySelector('[role=tab][data-state=active]').innerText==='检查报告'&&document.querySelector('.sql-report').innerText.includes('SQL执行通过')`)));
 if(ev(`Array.from(document.querySelectorAll('.sql-report button')).some(b=>b.innerText==='完成本关编码')`))run('find','role','button','click','--name','完成本关编码','--exact');run('wait','--text','本关编码已完成');results.push('Real SQL: imported script passes and coding completion saves');
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));
 console.log('TOTAL '+results.length);
}finally{fs.writeFileSync(path.join(out,'browser-partial.json'),JSON.stringify(results,null,2));run('close')}

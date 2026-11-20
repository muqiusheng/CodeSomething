import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const base=process.env.CS_JOURNEY_QA_URL||'http://127.0.0.1:5178';
function run(...args){
 const result=spawnSync(process.env.CS_BROWSER_BIN,['--session','cs-project-journey-entries',...args],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,`${args[0]}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
}
const open=path=>run('open',base+path);
const ev=code=>JSON.parse(run('eval',code));
const directory='[aria-label="本项目课次"]';
const wait=(...args)=>run('wait',...args,'--timeout','12000');

try{
 open('/path');
 wait('--text','后端入门实验室');
 assert.equal(ev(`document.querySelectorAll('.phase-list .phase').length`),7);
 for(const width of [390,1280]){
  run('set','viewport',String(width),'900');
  assert.ok(ev('document.documentElement.scrollWidth<=innerWidth'));
 }
 const phase='[aria-labelledby="phase-1"]';
 run('focus',`${phase} button[aria-expanded]`);
 run('press','Enter');
 wait('--fn',`document.querySelector('${phase} .curriculum').textContent.includes('连接与建模')`);
 run('focus',`${phase} a[href="/learn/journey/15"]`);
 run('press','Enter');
 wait('--fn',"document.querySelector('.journey-article h1')?.textContent === '连接并执行第一条 SQL'");
 open('/path');
 run('find','role','button','click','--name','展开全部','--exact');
 wait('--fn',"document.querySelectorAll('.path-journey-lessons li a').length===90");
 console.log('PASS original path cards and chapter overview remain with all 90 added lessons and keyboard entry');

 open('/projects');
 run('find','role','button','click','--name','基础项目','--exact');
 const inline='#project-lessons-boot-foundations';
 const toggle=`button[aria-controls="${inline.slice(1)}"]`;
 const originalDirectory='.project-foot a[href="/projects/boot-foundations"]';
 wait(toggle);
 assert.ok(ev(`document.querySelector('${toggle}').textContent.includes('展开课次 · 16 节')`));
 run('focus',toggle);
 run('press','Enter');
 wait(`${inline} a[href="/learn/journey/23"]`);
 assert.equal(ev('location.pathname+location.hash'),'/projects');
 assert.equal(ev(`document.querySelectorAll('${inline} li a').length`),16);
 run('set','viewport','390','900');
 assert.ok(ev('document.documentElement.scrollWidth<=innerWidth'));
 run('set','viewport','1280','900');
 if(process.env.CS_PROJECT_JOURNEY_SCREENSHOT) run('screenshot',process.env.CS_PROJECT_JOURNEY_SCREENSHOT);
 run('click',toggle);
 assert.ok(ev(`document.querySelector('${inline}').hidden`));
 run('eval',"document.documentElement.dataset.motion='reduce'");
 run('find','role','button','click','--name','卡片布局','--exact');
 wait(`.project-grid:not(.project-list) ${toggle}`);
 run('focus',toggle);
 run('press','Enter');
 wait(`${inline} a[href="/learn/journey/23"]`);
 run('focus',`${inline} details:nth-child(2) summary`);
 run('press','Enter');
 wait(`${inline} details[open] a[href="/learn/journey/31"]`);
 run('focus',`${inline} a[href="/learn/journey/31"]`);
 run('press','Enter');
 wait('--fn',"document.querySelector('.journey-article h1')?.textContent === '确认练习库与连接信息'");

 open('/projects');
 wait(originalDirectory);
 run('click',originalDirectory);
 wait(directory);
 assert.equal(ev('location.pathname+location.hash'),'/projects/boot-foundations');
 assert.ok(ev(`document.querySelector('[aria-label="分章学习目录"] h2').textContent==='项目开发路线'`));
 assert.ok(ev(`Array.from(document.links).some(a=>a.textContent==='进入学习'&&a.pathname.startsWith('/learn/boot-foundations/1.0/'))`));
 console.log('PASS list and grid reveal project lessons in place, with keyboard, mobile layout and original syllabus');

 const projects=[['backend-foundations',20,'01'],['sql-foundations',8,'15'],['boot-foundations',16,'23'],['task-manager',16,'39'],['collaboration',22,'49'],['independent',8,'65']];
 for(const [project,count,first] of projects){
  open('/projects/'+project);
  wait(directory);
  assert.equal(ev(`document.querySelectorAll('${directory} li a').length`),count,project);
  assert.equal(ev(`document.querySelector('${directory} ol a').pathname`),'/learn/journey/'+first,project);
 }
 console.log('PASS every supported project has its specific lesson groups and start point');
}finally{run('close');}

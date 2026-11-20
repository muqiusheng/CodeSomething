import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const browser = process.env.CS_BROWSER_BIN;
if (!browser) throw new Error('Set CS_BROWSER_BIN to the installed agent-browser executable.');
const evidence = path.resolve('../docs/acceptance/formal-design');
const session = 'cs-formal-design-visible-1111';
const base = 'http://127.0.0.1:5178';
const lesson = '/learn/http-json/1.0/json-response';
const routes = {home:'/learn',path:'/path',projects:'/projects',reviews:'/reviews',portfolio:'/portfolio',profile:'/profile',settings:'/settings',lesson};
const report = {layout:[],interactions:[],accessibility:[],errors:[]};
function run(...args) {
  const result=spawnSync(browser,['--session',session,...args],{encoding:'utf8',timeout:30000,windowsHide:true});
  if (result.status!==0) throw new Error(`${args[0]}: ${result.stdout} ${result.stderr}`);
  if (args[0]==='open') run('wait','250');
  return result.stdout.trim();
}
function evaluate(code) {
  const result=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',timeout:30000,windowsHide:true});
  if(result.status!==0)throw new Error(result.stdout+result.stderr);
  return JSON.parse(result.stdout);
}
function assert(condition,description) {
  if(!condition)throw new Error(description);
  report.interactions.push(description);
}
function screenshot(name){run('screenshot',path.join(evidence,name+'.png'));}
function save(){fs.writeFileSync(path.join(evidence,'browser-checks.json'),JSON.stringify(report,null,2));}

try {
  for(const width of [1440,1024,768,375,320]) {
    run('set','viewport',String(width),'1000');
    run('wait','250');
    for(const [name,route] of Object.entries(routes)) {
      run('open',base+route);
      const dimensions=evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,heading:document.querySelector('h1')?.textContent})`);
      report.layout.push({page:name,width,...dimensions});
      if(dimensions.document>width||dimensions.body>width)throw new Error(`Overflow: ${name} at ${width}`);
      if(width===1440||(width===375&&['home','lesson','projects','path'].includes(name)))screenshot(`${name}-${width}`);
    }
    console.log(`Layout: 8 pages at ${width}px passed`);
    save();
  }
  run('set','viewport','1024','900'); run('open',base+lesson); run('snapshot','-i');
  run('find','role','button','click','--name','学习辅导');
  assert(evaluate(`!!document.querySelector('[role="dialog"]')`),'Tablet tutoring opens as a modal drawer');
  run('find','role','button','click','--name','查看提示');
  assert(evaluate(`document.querySelector('[role="dialog"] .hint-answer').hidden===false`),'Tutor hint expands');
  screenshot('tutor-1024');
  run('press','Escape');
  assert(evaluate(`document.activeElement.textContent==='学习辅导'`),'Escape closes drawer and restores trigger focus');
  run('find','role','tab','click','--name','任务');
  assert(evaluate(`new URL(location.href).searchParams.get('tab')==='任务'`),'Lesson tab updates URL');
  run('reload');
  assert(evaluate(`document.querySelector('[role="tab"][data-state="active"]').textContent.includes('任务')`),'Lesson tab survives refresh');
  run('open',base+lesson);run('find','role','button','click','--name','发送请求');run('wait','--text','200 OK');
  assert(evaluate(`document.querySelector('.demo-output').textContent.startsWith('200 OK')`),'Request example returns 200');
  run('fill','#task-id','2');run('find','role','button','click','--name','发送请求');run('wait','--text','404 Not Found');
  assert(evaluate(`document.querySelector('.demo-output').textContent.startsWith('404 Not Found')`),'Request example returns 404');
  run('open',base+'/path');run('snapshot','-i');run('click','.phase:nth-child(2) .phase-footer button');
  assert(evaluate(`document.querySelector('[role="dialog"]').textContent.includes('开始前提醒')`),'Project entry preserves the simple reminder');
  run('find','role','button','click','--name','取消');
  assert(evaluate(`location.pathname==='/path'`),'Cancelling reminder stays on learning path');
  run('click','.phase:nth-child(2) .phase-footer button');run('find','role','link','click','--name','继续查看');
  assert(evaluate(`location.pathname==='/projects/task-manager'`),'Continuing reminder opens the project');
  run('open',base+'/projects');run('snapshot','-i');run('find','role','textbox','fill','--name','搜索项目','no-matching-project');
  assert(evaluate(`document.querySelector('.empty-panel').textContent.includes('没有匹配项目')`),'Project search exposes a recoverable empty state');
  run('find','role','button','click','--name','查看全部项目');
  assert(evaluate(`document.querySelectorAll('.project-card').length===3`),'Search reset restores all projects');
  run('find','role','button','click','--name','列表布局');
  assert(evaluate(`document.querySelector('.project-list')!==null`),'Project list layout remains available');
  screenshot('projects-list-1024');
  run('open',base+'/settings');run('select','#duration','30');run('find','role','button','click','--name','保存偏好');
  run('open',base+'/learn');
  assert(evaluate(`document.querySelector('.daily').textContent.includes('30')`),'Home reads saved daily duration');
  run('open',base+'/settings');run('select','#duration','60');run('find','role','button','click','--name','保存偏好');
  run('set','viewport','375','900');run('wait','250');run('open',base+lesson);run('snapshot','-i');
  run('find','role','button','click','--name','打开导航');
  assert(evaluate(`document.querySelector('.sidebar').contains(document.activeElement)`),'Mobile navigation receives keyboard focus');
  run('press','Escape');
  assert(evaluate(`document.activeElement.classList.contains('mobile-menu')`),'Mobile navigation restores menu focus');
  run('find','role','button','click','--name','学习辅导');run('wait','250');screenshot('tutor-375');
  const drawerAudit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));
  fs.writeFileSync(path.join(evidence,'axe-tutor-375.json'),JSON.stringify(drawerAudit,null,2));
  report.accessibility.push({page:'tutor',result:drawerAudit});
  run('press','Escape');
  for(const name of ['home','lesson','projects','path','reviews','portfolio','profile','settings']) {
    run('open',base+routes[name]);
    const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));
    fs.writeFileSync(path.join(evidence,`axe-${name}-375.json`),JSON.stringify(audit,null,2));
    report.accessibility.push({page:name,result:audit});
  }
  run('set','viewport','1440','1000');run('open',base+lesson);
  evaluate(`document.documentElement.style.zoom='2';true`);
  report.zoom=evaluate(`({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})`);
  screenshot('lesson-zoom-200');
  evaluate(`document.documentElement.style.zoom='';document.documentElement.dataset.motion='reduce';true`);
  assert(evaluate(`getComputedStyle(document.querySelector('.button')).transitionDuration.split(',').every(value=>parseFloat(value)===0)`),'Reduced motion disables button transitions');
  evaluate(`document.documentElement.dataset.motion='system';true`);
  report.pageErrors=run('errors');
  save();
  console.log('Interaction checks and accessibility scans completed.');
} catch(error) {
  report.errors.push(String(error));save();throw error;
}

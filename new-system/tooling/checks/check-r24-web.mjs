import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const browser=process.env.CS_BROWSER_BIN;if(!browser)throw new Error('Set CS_BROWSER_BIN');
const session=process.env.CS_R24_SESSION||'codesomething-r24-web',front='http://127.0.0.1:5179';
const evidence=path.resolve('new-system/docs/acceptance/R2.4');fs.mkdirSync(evidence,{recursive:true});
const workspace=path.resolve('new-system/runtime/r24-practice');fs.mkdirSync(workspace,{recursive:true});
const file=path.join(workspace,'TaskServer.java'),starter=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8');fs.writeFileSync(file,starter);
const finishing=process.env.CS_R24_RESUME==='transfer';
const report=finishing?JSON.parse(fs.readFileSync(path.join(evidence,'web-checks.json'),'utf8')):{checks:[],layout:[],accessibility:[]};delete report.error;
let fixed=starter.replace('"completed":"false"','"completed":false');const last=fixed.lastIndexOf('status = 200;');fixed=fixed.slice(0,last)+fixed.slice(last).replace('status = 200;','status = 404;');
function run(...args){console.log(args.slice(0,4).join(' '));const result=spawnSync(browser,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:60000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return result.stdout.trim()}
function evaluate(code){const result=spawnSync(browser,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});if(result.status!==0)throw new Error(result.stdout+result.stderr);return JSON.parse(result.stdout)}
function assert(value,message){if(!value)throw new Error(message);report.checks.push(message)}
function wait(text){run('wait','--text',text,'--timeout','55000')}
function click(name){run('find','role','button','click','--name',name)}
function tab(name){run('find','role','tab','click','--name',name)}
function open(stage,which='任务'){run('open',front+'/learn/http-json/1.1/'+stage+'?tab='+encodeURIComponent(which));run('wait',which==='任务'?'#practice-directory':'.formal-verification')}
async function api(route){const r=await fetch(front+'/api/v1'+route);if(!r.ok)throw new Error(await r.text());return r.json()}
function pair(){run('fill','#practice-directory',workspace);click('预览提交范围');wait('确认允许读取的文件');click('确认范围并配对');wait('目录已配对')}
function save(){click('预览最新文件');wait('本次快照预览');click('保存这份快照');wait('快照已保存')}
function answer(values){for(const [name,value] of Object.entries(values))run('check',`.formal-verification input[name="${name}"][value="${value}"]`)}
function layout(label){for(const width of [1440,1024,768,375,320]){run('set','viewport',String(width),'1000');const size=evaluate('({width:innerWidth,document:document.documentElement.scrollWidth})');report.layout.push({label,...size});assert(size.document<=width,`${label}: no page overflow at ${width}`)}}
function axe(label){const result=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(evidence,'axe-'+label+'.json'),JSON.stringify(result,null,2));report.accessibility.push({label,...result.data.counts});assert(result.data.counts.violations===0,label+': zero axe violations')}
try {
 if(!finishing){
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===0,'Acceptance database starts without completion evidence');
 open('run-server');pair();save();click('运行代码检查');wait('功能检查通过');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===0,'Functional pass alone does not complete the chapter');
 click('验证理解');wait('正式理解验证');answer({restart:0,connection:2});click('提交理解验证');wait('再想一想');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===0,'Wrong formal answers do not complete the chapter');
 answer({restart:1,connection:2});click('重新验证理解');wait('本关已达标');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===1,'Correct retry completes the running chapter');
 run('reload');wait('本关已达标');assert(evaluate('document.querySelector("[role=tab][data-state=active]").textContent.includes("理解验证")'),'Refresh restores the formal verification step');
 assert(evaluate('document.querySelector(".formal-verification").textContent.includes("理解验证通过")'),'Refresh restores the persisted understanding attempt');
 run('click','.completion-evidence a');wait('跟着请求走一遍代码');wait('已保存');
 const saved=(await api('/learning/continue')).session;assert(saved.stageId==='trace','Next chapter saves the actual reading position');
 open('transfer','理解验证');wait('预览中');assert((await api('/learning/continue')).session.stageId==='trace','Previewing a later chapter does not move the formal cursor');
 assert(evaluate('document.querySelector(".formal-verification button[type=submit]").disabled'),'Preview cannot submit formal answers without prerequisites and a functional report');
 open('fix-response');pair();save();click('运行代码检查');wait('接口行为未符合约定');
 assert(evaluate('document.querySelector(".check-report").textContent.includes("未通过")'),'Unfixed interface shows a real business failure');
 fs.writeFileSync(file,fixed);
 click('刷新检查状态');wait('代码已变化');save();click('运行代码检查');wait('功能检查通过');click('验证理解');wait('正式理解验证');
 layout('formal-questions');run('screenshot',path.join(evidence,'questions-320.png'));run('set','viewport','1440','1000');axe('formal-questions');
 run('focus','.formal-verification input[name=status][value="0"]');run('press','Space');run('press','Tab');run('press','ArrowRight');run('press','ArrowRight');
 answer({status:0,type:1});click('提交理解验证');wait('本关已达标');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).completedCount===2,'Fixed task plus formal understanding creates the second completion');
 run('screenshot',path.join(evidence,'completed-1440.png'));layout('completed-evidence');run('screenshot',path.join(evidence,'completed-320.png'));axe('completed-evidence');
 fs.writeFileSync(file,fixed+'\n// local edit after completion');tab('任务');click('刷新检查状态');wait('代码已变化');tab('理解验证');
 assert(evaluate('document.querySelector(".formal-verification button[type=submit]").disabled'),'Changed code blocks a new formal attempt');
 assert(evaluate('document.querySelector(".completion-evidence").textContent.includes("本关已达标")'),'Historical completion remains visible with its code digest');
 }
 fs.writeFileSync(file,fixed.replaceAll('/api/tasks/','/api/notes/').replaceAll('completed','archived').replaceAll('学习 HTTP','第一条笔记'));
 open('transfer');pair();save();click('运行代码检查');wait('功能检查通过');click('验证理解');
 click('提交理解验证');assert(evaluate('document.activeElement?.type==="radio"'),'Incomplete answers focus the missing required question');
 answer({route:1,mapping:2});run('reload');run('wait','.formal-verification input[name=route][value="1"]:checked');run('wait','.formal-verification button[type=submit]:not(:disabled)');
 assert(evaluate(`!!document.querySelector('.formal-verification input[name="mapping"][value="2"]:checked')`),'Unsubmitted answer draft survives refresh');
 layout('final-form');run('screenshot',path.join(evidence,'final-questions-320.png'));run('set','viewport','1440','1000');axe('final-form');
 click('提交理解验证');wait('本关已达标');assert(evaluate('document.activeElement?.classList.contains("understanding-result")'),'Formal result receives keyboard focus after submission');
 assert((await api('/learning/progress/http-json-basics/1.1.0')).projectCompleted,'All three code chapters produce project completion');
 run('click','.completion-evidence a');wait('HTTP/JSON项目已达标');layout('project-summary');run('set','viewport','1440','1000');axe('project-summary');run('screenshot',path.join(evidence,'project-summary.png'));
 run('open',front+'/learn');wait('查看项目总结');layout('home-progress');run('set','viewport','1440','1000');axe('home-progress');
 assert(evaluate('document.querySelector(".progress-card").textContent.includes("正式证据")&&!document.querySelector(".progress-card").textContent.includes("演示记录")'),'Home shows genuine completion evidence');
 run('screenshot',path.join(evidence,'home-progress.png'));
 run('open',front+'/profile');wait('3个关卡达标');assert(evaluate('document.querySelector("main").textContent.includes("独立程度与长期保留情况将在后续验证")'),'Profile separates chapter evidence from independence and retention');
 const progress=await api('/learning/progress/http-json-basics/1.1.0');fs.writeFileSync(path.join(evidence,'progress-before-restart.json'),JSON.stringify(progress,null,2));
 report.result='passed';
}catch(error){report.result='failed';report.error=error.stack;try{run('screenshot',path.join(evidence,'failure.png'))}catch{}throw error}
finally{fs.writeFileSync(path.join(evidence,'web-checks.json'),JSON.stringify(report,null,2));run('close')}

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN;assert(bin,'Activate browser runtime');
const session='cs-r8',base='http://127.0.0.1:5179',api='http://127.0.0.1:5189/api/v1/portfolio',out=path.resolve('new-system/docs/acceptance/R8');
const report={checks:[],layouts:[],audits:[],startedAt:new Date().toISOString()};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:45000});assert.equal(r.status,0,args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
const tab=name=>run('find','role','tab','click','--name',name,'--exact');
const wait=text=>run('wait','--text',text);
const text=()=>ev('document.querySelector("main").innerText');
function check(pass,name){report.checks.push({pass:!!pass,name});assert(pass,name)}
function viewport(width){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width} && (${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1)`)}
function layouts(label){for(const mode of ['light','dark']){if(ev('document.documentElement.dataset.theme')!==mode)click(mode==='light'?'切换到浅色模式':'切换到深色模式');for(const width of [320,375,768,1024,1440]){viewport(width);const pass=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({label,mode,width,pass});check(pass,`${label} ${mode} ${width} no page overflow`)}viewport(1440);run('screenshot',path.join(out,label+'-'+mode+'.png'));const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-'+label+'-'+mode+'.json'),JSON.stringify(audit,null,2));report.audits.push({label,mode,counts:audit.data.counts});check(audit.data.counts.violations===0,label+' '+mode+' axe zero violations');viewport(375);run('screenshot',path.join(out,label+'-'+mode+'-375.png'));viewport(1440)}}
let id;async function work(){const response=await fetch(api+'/'+id);assert.equal(response.status,200);return response.json()}
async function terminal(){for(let n=0;n<240;n++){const w=await work();const job=w.checks.at(-1);if(job&&!['queued','running','cancelling'].includes(job.status)){wait(job.status==='passed'?'功能通过':'未通过');return job}await new Promise(r=>setTimeout(r,1000))}throw Error('job did not finish')}
async function submit(phase){tab('工程检查');run('fill','input[name=directory]',path.resolve('new-system/tooling/fixtures/r8-reservation'));if(phase==='transfer')run('select','select',phase);click('预览提交范围');wait('待提交快照');check(text().includes('ReservationService.java'),'explicit file preview includes actual implementation');click('确认提交此快照');wait('快照已提交');return terminal()}
try{
 run('open',base+'/portfolio');wait('开始独立作品');run('snapshot','-i');layouts('portfolio-index');
 run('fill','input[name=theme]','浏览器验收 · 摄影设备预约');click('确定题材与评价边界');wait('需求与评价规则');id=new URL(run('get','url')).pathname.split('/').at(-1);fs.writeFileSync('new-system/runtime/r8-browser-work.txt',id);
 check(text().includes('建议先完成项目B'),'missing prerequisites are visible without replacing course path');check(!text().includes('/api/reservations/batch'),'transfer not disclosed before core pass');
 const design='摄影设备预约：用户、资源与预约分表，通过服务端会话确定身份。库存采用事务内条件更新；取消锁定原预约，批量整体回滚。使用HTTP集成测试和独立MySQL部署。';
 run('fill','textarea',design+'（未保存草稿）');run('reload');wait('业务边界、接口与数据模型');check(ev('document.querySelector("textarea").value').endsWith('（未保存草稿）'),'unsaved browser draft survives reload in StrictMode');
 run('fill','textarea',design);click('保存设计');wait('设计已保存到本机数据库');check((await work()).revision===1,'design persisted with version');click('读取启动文件');wait('Application.java');check(Object.keys(await (await fetch(api+'/starter')).json()).length===3,'starter exposes only configuration, entrypoint and run document');layouts('portfolio-design');
 tab('讲解与迁移');check(ev('[...document.querySelectorAll("button")].find(b=>b.textContent==="领取新要求").disabled'),'transfer locked before valid core check');
 const core=await submit('core');check(core.status==='passed','real core check through browser submission passes');
 tab('讲解与迁移');click('领取新要求');wait('/api/reservations/batch');check((await work()).transfer.includes('2—5'),'novel batch requirement saved after core pass');
 const transfer=await submit('transfer');check(transfer.status==='passed','real migration and core regression pass through browser');layouts('portfolio-report');
 tab('讲解与迁移');for(const [name,value] of Object.entries({flow:'请求经身份验证进入控制器和服务层，由数据库记录预约和资源库存，最后转换为JSON响应。',failure:'条件更新避免库存不足时扣减，批量统一事务回滚；取消预约加行锁，重复取消不会再次恢复库存。',tradeoff:'用户、资源和预约各自建表，用外键维持关联；选择关系数据库事务保证库存与预约保持一致。',deployment:'使用Java21和独立MySQL，通过环境变量连接，JUnit执行真实HTTP测试；本次为工程夹具验收，使用示例帮助。'}))run('fill',`textarea[name=${name}]`,value);
 run('select','select','example');click('保存讲解与帮助记录');wait('讲解已保存，待回访核实');check(text().includes('工程证据齐备'),'archive distinguishes evidence readiness');check((await work()).independence==='待实际回访核实','no fabricated independence verdict');check((await work()).explanations[0].help==='example','assistance declaration is preserved');

 // Two textareas are visible on the archive tab; scope their explicit wrapping labels.
 run('find','label','实际观察与遇到的问题','fill','浏览器工程验收模拟记录：续接到同一作品，检查与讲解均绑定对应快照；本记录不是实际学习者回访。');
 run('find','label','下一步与处理决定','fill','实际学习后核对续学、画像和复习，再讨论共享与桌面化。');click('记录本次回访');wait('实际观察已保存');check((await work()).visits.length===1,'visit saved through real form');check(!(await work()).visits[0].snapshot.delayed,'immediate simulation never labeled delayed learning');layouts('portfolio-archive');
 run('reload');wait('作品档案');check(text().includes('首轮学习回访'),'reload restores archive position');
 run('open',base+'/learn');wait('继续作品');check(text().includes('浏览器验收 · 摄影设备预约'),'home exposes actual portfolio resume');
 run('open',base+'/profile');wait('继续作品');check(text().includes('独立程度待回访核实'),'profile keeps portfolio distinct from course verification');
 run('open',base+'/portfolio/'+id+'?step=archive');wait('首轮学习回访');viewport(1440);ev('document.documentElement.style.zoom="2"');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'archive at CSS zoom 200 percent has no page overflow');run('screenshot',path.join(out,'portfolio-zoom-200.png'));ev('document.documentElement.style.zoom=""');
 report.workId=id;report.finishedAt=new Date().toISOString();
}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));try{run('close')}catch{}}
console.log(`${report.checks.length} browser assertions, ${report.layouts.length} layouts and ${report.audits.length} accessibility scenarios completed.`);

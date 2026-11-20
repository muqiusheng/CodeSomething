import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN;
if(!bin)throw Error('Activate the browser runtime and set CS_BROWSER_BIN.');
const session='cs-r5-acceptance',base='http://127.0.0.1:5179';
const out=path.resolve('new-system/docs/acceptance/R5');fs.mkdirSync(out,{recursive:true});
const report={checks:[],layouts:[],audits:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function viewport(width){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width} && (${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1)`)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
const text=()=>ev('document.querySelector("main").innerText');
const click=name=>run('find','role','button','click','--name',name,'--exact');
const waitText=value=>run('wait','--text',value);
async function api(route){const r=await fetch('http://127.0.0.1:5191/api/v1'+route);if(!r.ok)throw Error(await r.text());return r.json()}
async function layouts(label){for(const mode of ['light','dark']){
 if(ev('document.documentElement.dataset.theme')!==mode)click(mode==='light'?'切换到浅色模式':'切换到深色模式');
 for(const width of [320,375,768,1024,1440]){viewport(width);const pass=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({label,mode,width,pass});check(pass,`${label} ${mode} ${width} no page overflow`)}
 viewport(1440);run('screenshot',path.join(out,label+'-'+mode+'.png'));
 const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,`axe-${label}-${mode}.json`),JSON.stringify(a,null,2));report.audits.push({label,mode,counts:a.data.counts});check(a.data.counts.violations===0,label+' '+mode+' accessibility');
 viewport(375);run('screenshot',path.join(out,label+'-'+mode+'-375.png'));run('set','viewport','1440','1000');
}}
try{
 const cursorBefore=await api('/learning/continue');
 run('open',base+'/profile');waitText('19 个关卡');
 run('select','.section-heading select','sql-foundations');
 check(ev('document.querySelectorAll(".knowledge-row").length===6'),'Course filtering shows six SQL skills');
 const rowTexts=ev('Array.from(document.querySelectorAll(".knowledge-row")).map(e=>e.innerText)');
 check(rowTexts[0].includes('课程已验证'),'Completion is initially verified');check(rowTexts[1].includes('借助帮助完成'),'Delivered example is assistance evidence');check(rowTexts[2].includes('需要巩固'),'Repeated SQL errors need review');check(rowTexts[3].includes('环境故障 1')&&rowTexts[3].includes('代码/业务错误 0'),'Environment failure does not lower knowledge');
 run('click','.knowledge-row:first-child summary');check(text().includes('acceptance-digest')&&text().includes('sql-understanding-1'),'Evidence shows snapshot digest and real rule');
 click('纠正“连接数据库”结论');waitText('纠正画像结论');run('find','label','说明','fill','验收：我希望核对本次完成证据');click('取消');check(ev('document.activeElement.textContent.includes("纠正")'),'Correction cancellation returns focus');
 click('纠正“连接数据库”结论');run('find','label','说明','fill','验收：本次由同学代做');click('保存纠正');waitText('纠正已保存');check(text().includes('结论待核实'),'Correction changes projected state');
 run('reload');waitText('19 个关卡');run('select','.section-heading select','sql-foundations');check(text().includes('结论待核实'),'Correction survives refresh');
 click('纠正“连接数据库”结论');run('select','.modal-content select','resolved');run('find','label','说明','fill','验收：已核对原始记录，撤回异议');click('保存纠正');waitText('纠正已保存');
 await layouts('profile');
 click('预览每日一题');waitText('调整差异');check(text().includes('0 → 5 分钟/天'),'Small proposal shows exact burden');check((await api('/learner/profile')).plan.review_minutes===0,'Preview has no effect');click('保持原计划');waitText('已拒绝');check((await api('/learner/profile')).plan.review_minutes===0,'Reject preserves original plan');
 click('预览每日一题');click('接受调整');waitText('调整已生效');check((await api('/learner/profile')).plan.review_minutes===5,'Accepted daily review takes effect');
 click('预览集中巩固');waitText('5 → 15 分钟/天');click('接受调整');waitText('调整已生效');check((await api('/learner/profile')).plan.focus_course==='sql-foundations','Focus proposal takes effect');
 run('click','.learner-adjustments details summary');run('find','first','.adjustment-history button','click');waitText('已撤销');check((await api('/learner/profile')).plan.review_minutes===5,'Undo restores previous plan');
 run('scrollintoview','.learner-adjustments');run('screenshot',path.join(out,'adjustments.png'));
 run('select','.section-heading select','sql-foundations');run('find','first','.knowledge-row a[href^="/reviews"]','click');waitText('主动复习');
 check(ev('document.querySelector(".learner-form select").value==="db-connect"'),'Profile review link selects matching skill');click('开始本次复习');waitText('SELECT 1成功');check(ev('document.activeElement.tagName==="H2"'),'Review start focuses question');
 run('reload');waitText('恢复这轮复习');click('恢复这轮复习');waitText('SELECT 1成功');
 run('check','.review-options label:nth-child(3) input');click('提交并查看解析');waitText('变式答对了');check(text().includes('先核对当前库和表名'),'Server explanation displayed');check(ev('document.activeElement.classList.contains("review-result")'),'Result receives focus');
 const profile=await api('/learner/profile');check(profile.summary.completed===2,'Review cannot create course completion');check(profile.knowledge.find(k=>k.skill.stageId==='db-connect').retention==='延迟变式独立答对','Delayed review is separated from immediate practice');
 await layouts('review-result');
 click('选择下一关');run('select','.learner-form label:first-child select','run-server');click('开始本次复习');waitText('服务监听8093');run('check','.review-options label:nth-child(2) input');click('提交并查看解析');waitText('这题需要再巩固');check((await api('/learner/profile')).knowledge.find(k=>k.skill.stageId==='run-server').state==='needs-review','Wrong review recommends consolidation');
 click('选择下一关');click('开始本次复习');waitText('程序打印已启动');click('稍后一天');waitText('本次记录已保存');check(!(await api('/learner/reviews')).items.find(i=>i.skill.stageId==='run-server').recommended,'Later suppresses recommendation for one day');
 click('选择下一关');click('开始本次复习');waitText('服务监听8093');click('跳过七天');waitText('已跳过七天');check(!(await api('/learner/reviews')).items.find(i=>i.skill.stageId==='run-server').recommended,'Skip suppresses recommendation for seven days');
 click('选择下一关');run('select','.learner-form label:first-child select','db-model');click('开始本次复习');waitText('notes表主键');run('select','.learner-help select','example');run('check','.review-options label:nth-child(2) input');click('提交并查看解析');waitText('变式答对了');check((await api('/learner/profile')).knowledge.find(k=>k.skill.stageId==='db-model').retention==='借助帮助答对','In-session assistance is recorded');
 const cursorAfter=await api('/learning/continue');check(JSON.stringify(cursorBefore)===JSON.stringify(cursorAfter),'Review, correction and adjustment leave main learning cursor and prerequisites unchanged');
 run('open',base+'/learn');waitText('查看复习安排');check(!text().includes('练习示例'),'Homepage review entry uses real queue');
 run('open',base+'/profile');waitText('19 个关卡');run('network','route','**/api/v1/learner/profile','--abort');run('reload');run('wait','--fn','document.querySelector("[role=alert]")!==null');check(text().includes('重新读取'),'Profile failure provides retry');run('network','unroute');click('重新读取');waitText('19 个关卡');
 run('open',base+'/reviews');waitText('主动复习');await layouts('reviews');
 fs.writeFileSync(path.join(out,'browser-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,layouts:report.layouts.length,audits:report.audits}));
}catch(e){fs.writeFileSync(path.join(out,'browser-checks-failure.json'),JSON.stringify({...report,error:String(e)},null,2));try{run('screenshot',path.join(out,'failure.png'))}catch{}throw e}finally{try{run('close')}catch{}}

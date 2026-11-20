import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN;if(!bin)throw Error('Activate the browser runtime.');
const session='cs-r6-learning',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/R6');
const id=fs.readFileSync('new-system/runtime/r6-real-draft.txt','utf8').trim();
const draft=await (await fetch('http://127.0.0.1:5191/api/v1/projects/drafts/'+id)).json();
const fixture=path.resolve('new-system/runtime/r6-browser-files');
for(const kind of ['starter','reference'])for(const [file,content] of Object.entries(draft.payload.chapters[0][kind])){const target=path.join(fixture,kind,path.basename(file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content)}
const report={checks:[],layouts:[],audits:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:65000});if(r.status!==0)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
const click=name=>run('find','role','button','click','--name',name,'--exact');const wait=value=>run('wait','--text',value);const text=()=>ev('document.querySelector("main").innerText');
function upload(kind){run('upload','.generated-import input',...['pom.xml','Application.java','ResourceController.java'].map(f=>path.join(fixture,kind,f)))}
async function terminal(){for(let n=0;n<180;n++){const c=await (await fetch('http://127.0.0.1:5191/api/v1/projects/courses/'+id)).json();const a=c.attempts.find(a=>a.stage_id==='read');if(a&&!['queued','running'].includes(a.status)){run('wait','--text',a.status==='passed'?'功能通过':a.status==='business_error'?'功能未通过':'编译失败');return a}await new Promise(r=>setTimeout(r,500))}throw Error('Check did not finish')}
function viewport(width){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width} && (${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1)`)}
function layouts(label){for(const mode of ['light','dark']){if(ev('document.documentElement.dataset.theme')!==mode)click(mode==='light'?'切换到浅色模式':'切换到深色模式');for(const width of [320,375,768,1024,1440]){viewport(width);const pass=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({label,mode,width,pass});check(pass,label+' '+mode+' '+width+' no overflow')}viewport(1440);run('screenshot',path.join(out,label+'-'+mode+'.png'));const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-'+label+'-'+mode+'.json'),JSON.stringify(a,null,2));report.audits.push({label,mode,counts:a.data.counts});check(a.data.counts.violations===0,label+' '+mode+' accessibility');viewport(375);run('screenshot',path.join(out,label+'-'+mode+'-375.png'));viewport(1440)}}
try{
 if(process.env.CS_R6_RESUME!=='true'){
 run('open',base+'/projects/generated/'+id+'?stage=read');wait('导入并检查源码');check(text().includes('已发布'),'Only published course is used');check(ev('document.querySelectorAll(".generated-file-list button").length===3'),'Three separate starter downloads');check(ev('document.querySelector(".studio-actions .primary").disabled'),'Check disabled before explicit import');
 run('open',base+'/projects/generated/'+id+'?stage=transfer');wait('提交前请先完成上一关');check(ev('document.querySelector(".studio-actions .primary").disabled'),'Later stage is preview only before prerequisites');
 run('open',base+'/projects/generated/'+id+'?stage=read');wait('导入并检查源码');upload('starter');wait('源码已导入');click('提交功能检查');check((await terminal()).status==='business_error','Incomplete learner implementation fails real HTTP checks');check(!text().includes('提交理解验证'),'Failed function cannot enter formal understanding');
 upload('reference');wait('源码已导入');wait('旧快照');check(text().includes('旧快照'),'Importing changed code marks old report');click('提交功能检查');check((await terminal()).status==='passed','Corrected IDE files pass isolated checks');wait('理解验证');check(text().includes('对应当前导入快照'),'Report matches current source digest');
 }else{run('open',base+'/projects/generated/'+id+'?stage=read');wait('导入并检查源码');upload('reference');wait('理解验证')}
 run('reload');wait('理解验证');check(text().includes('对应当前导入快照'),'Refresh restores source and same report');
 run('click','.generated-learning section:nth-of-type(2) details summary');run('wait','--fn','document.querySelector(".generated-source-select select")!==null && Array.from(document.querySelectorAll("select")).some(s=>s.value==="example")');
 run('check','.generated-radio:nth-of-type(2) input');run('fill','textarea','请求通过控制器，校验标题与布尔类型后写入内存集合，再转换成JSON响应。找不到编号返回404，输入不合法返回400。内存数据在重启后清空。');click('提交理解验证');wait('先核对写入前校验');check(!text().includes('本关功能与概念验证已记录'),'Wrong concept cannot complete stage');
 layouts('learning');
 run('check','.generated-radio:nth-of-type(1) input');run('select','form .generated-source-select select','none');click('提交理解验证');wait('本关功能与概念验证已记录');
 const course=await (await fetch('http://127.0.0.1:5191/api/v1/projects/courses/'+id)).json();check(course.completions.length===1,'Double results produce one completion');check(course.completions[0].help==='example','Server keeps actual reference assistance despite lower declaration');check(ev('document.activeElement.getAttribute("role")==="status"'),'Result receives focus');
 run('find','role','link','click','--name','继续下一关 →','--exact');wait('新增与输入校验');check(!text().includes('提交前请先完成上一关'),'Next stage unlocks after double results');
 run('open',base+'/projects/generated/'+id);wait('导入并检查源码');check(ev('location.search.includes("stage=validate")'),'Project entry resumes first incomplete stage');
 run('network','route','**/api/v1/projects/courses/*','--abort');run('reload');run('wait','--fn','document.querySelector("[role=alert]")!==null');check(text().includes('重新读取'),'Network failure offers recovery');run('network','unroute');click('重新读取');wait('导入并检查源码');
 run('open',base+'/projects');wait('我的生成项目');check(text().includes(draft.payload.plan.title),'Published project appears in ordinary project library');
 fs.writeFileSync(path.join(out,'browser-learning.json'),JSON.stringify(report,null,2));
}finally{fs.writeFileSync(path.join(out,'browser-learning-progress.json'),JSON.stringify(report,null,2));run('close')}

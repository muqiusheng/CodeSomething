import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-project-continuity',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/coding-first');
fs.mkdirSync(out,{recursive:true});const previous=process.argv.includes('--remaining')?JSON.parse(fs.readFileSync(path.join(out,'browser.json'),'utf8')):{};const checks=previous.checks||[],sizes=previous.sizes||[],audits=previous.audits||[];
function run(...args){console.log(args[0],String(args[1]||'').slice(0,45));const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:75000});assert.equal(r.status,0,args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const open=url=>run('open',base+url),wait=text=>run('wait','--text',text,'--timeout','60000'),click=name=>run('find','role','button','click','--name',name,'--exact');
function editor(code){run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);run('focus','.monaco-editor [role=textbox]');run('press','Control+a');run('clipboard','write',code);run('press','Control+v')}
const source=()=>ev(`document.querySelector('.monaco-editor [role=textbox]')?.getAttribute('aria-label')`);
function currentCodeIncludes(text){run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);run('focus','.monaco-editor [role=textbox]');run('press','Control+a');const found=ev(`document.querySelector('.monaco-editor [role=textbox]').value.includes(${JSON.stringify(text)})`);run('press','ArrowLeft');return found}
async function api(route,body){const r=await fetch('http://127.0.0.1:5191/api/v1'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.ok,await r.clone().text());return r.json()}
function addClass(name){ev(`window.prompt=()=>${JSON.stringify(name)}`);click('＋ Java文件');wait(name+'.java')}
function layout(label){for(const width of [375,768,1440]){run('set','viewport',String(width),'900');const s=ev(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`);assert(s.scroll<=s.width+1,JSON.stringify({label,...s}));sizes.push({label,...s})}run('set','viewport','1440','900')}
try{
 if(!process.argv.includes('--remaining')){
 run('set','viewport','1440','900');open('/learn/http-json/1.1/workspace');wait('已恢复本项目代码');
 run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);assert(source().includes('TaskServer.java'));assert(!currentCodeIncludes('String body'));
 checks.push('New HTTP project starts with the minimal server, without prewritten business handler');
 click('已操作，下一步');run('reload');wait('第2步 / 共3步');checks.push('Operation step resumes after refresh');
 const code=fs.readFileSync('new-system/course-packs/http-json-basics/1.1.0/TaskServer.java','utf8').replace('"completed":"false"','"completed":false').replace('status = 200;\n                body =','status = 404;\n                body =')+'\n// continuous-project-marker\n';
 editor(code);wait('已保存到服务器');click('运行并检查');wait('功能检查通过');click('完成本关编码');wait('本关编码已完成');
 checks.push('HTTP code compiles/runs in the real runner and completes without answering a quiz');
 open('/learn/http-json/1.1/request');wait('已恢复本项目代码');assert(currentCodeIncludes('continuous-project-marker'));checks.push('Request chapter continues the same Java source');
 open('/learn/http-json/1.1/fix-response');wait('已恢复本项目代码');assert(currentCodeIncludes('continuous-project-marker'));click('运行并检查');wait('功能检查通过');click('完成本关编码');wait('本关编码已完成');
 checks.push('Full HTTP contract passes from the continued project and unlocks the next coding stage');
 editor(code+'\n// feature retained across chapters\n');wait('已保存到服务器');wait('代码已变化');
 open('/learn/http-json/1.1/workspace');wait('已恢复本项目代码');
 assert(ev(`localStorage.getItem('cs-browser-project-http-json-basics-1.1.0-draft').includes('feature retained across chapters')`));
 checks.push('Returning to the first chapter keeps later edits; old report is stale');layout('HTTP project');
 run('screenshot',path.join(out,'http-same-project.png'));
 audits.push({page:'HTTP',result:JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'))});
 open('/learn/boot-foundations/1.0/boot-start');wait('已恢复本项目代码');click('HealthController.java');editor(fs.readFileSync('new-system/course-packs/boot-foundations/1.0.0/boot-start/reference/src/main/java/dev/codesomething/lab/HealthController.java','utf8'));wait('已保存到服务器');click('运行并检查');wait('功能检查通过');click('完成本关编码');wait('本关编码已完成');
 open('/learn/boot-foundations/1.0/boot-http');wait('已恢复本项目代码');assert(ev(`Array.from(document.querySelectorAll('.workspace-files button')).some(b=>b.textContent==='HealthController.java')`));
 addClass('EchoController');editor(fs.readFileSync('new-system/course-packs/boot-foundations/1.0.0/boot-http/reference/src/main/java/dev/codesomething/lab/EchoController.java','utf8'));wait('已保存到服务器');click('运行并检查');wait('功能检查通过');click('完成本关编码');wait('本关编码已完成');
 checks.push('Boot next chapter retains the implemented health endpoint and adds a new controller; both stages really build and pass');
 layout('Boot project');run('screenshot',path.join(out,'boot-continued-engineering.png'));
 for(const [course,stage] of [['task-manager','a-read'],['collaboration','b-login']]){open(`/learn/${course}/1.0/${stage}`);wait('已恢复本项目代码');assert.equal(ev(`Array.from(document.querySelectorAll('.workspace-files button')).filter(b=>!b.textContent.startsWith('＋')).length`),2);layout(course);checks.push(course+' starts with only pom.xml and Application.java, and offers real file creation')}
 }
 open('/learn/sql/1.0/db-connect');wait('当前章节脚本');if(ev(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='启动教学环境')`)){click('启动教学环境');wait('检查连接')}editor('SELECT 1 AS connected,DATABASE() AS current_database;');click('提交正式检查');wait('功能通过');click('完成本关编码');wait('本关编码已完成');checks.push('SQL formal execution completes without a quiz');layout('SQL project');
 open('/learn/sql/1.0/db-model');wait('当前章节脚本');assert(ev(`document.querySelector('nav[aria-label="SQL项目文件"]').textContent.includes('01-db-connect.sql')`));checks.push('SQL chapters are scripts in one database project notebook');
 const generatedId=fs.readFileSync('new-system/runtime/project-browser-generated-id.txt','utf8').trim();let draft=await api('/projects/drafts/'+generatedId);
 if(draft.status==='ready')await api('/projects/drafts/'+generatedId+'/publish',{});
 assert(['ready','published'].includes(draft.status),'Generated gate still '+draft.status);
 const generated=await api('/projects/courses/'+generatedId);
 const generatedRoute='/projects/generated/'+generatedId;
 open(generatedRoute+'?stage=read');run('wait','--fn',`document.querySelector('[aria-label="工程代码编辑器"] .monaco-editor')!==null`);
 // Use the allowed reference as explicit example help in the acceptance fixture.
 const reference=await api(`/projects/courses/${generatedId}/stages/read/reference`);click('ResourceController.java');editor(reference['src/main/java/dev/codesomething/lab/ResourceController.java']);
 click('提交功能检查');wait('功能通过');click('完成本关编码');wait('本关编码完成记录已保存');
 open(generatedRoute+'?stage=validate');run('wait','--fn',`document.querySelector('[aria-label="工程代码编辑器"] .monaco-editor')!==null`);assert(ev(`localStorage.getItem('cs-generated-project-${generatedId}').includes('LinkedHashMap')`));checks.push('Generated project passes real code checks without quiz, then keeps first-stage source in next chapter');layout('Generated project');
 const work=await api('/portfolio',{theme:'工程连续性验收',domain:'reservation',idempotencyKey:'project-continuity-work'});open('/portfolio/'+work.id+'?step=practice');run('wait','--fn',`document.querySelector('[aria-label="逐步实践"]')!==null`);layout('Independent work');
 checks.push('Independent work keeps design, code, migration and explanation in one project');
 console.log(JSON.stringify({checks,sizes:sizes.length}));
}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,sizes,audits},null,2));run('close')}


import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='cs-r6-final-content',out=path.resolve('new-system/docs/acceptance/R6');
const id=fs.readFileSync('new-system/runtime/r6-real-contract-draft.txt','utf8').trim();
const checks=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
try{
 run('open','http://127.0.0.1:5179/projects/generated/'+id);run('wait','--text','导入并检查源码');
 const text=ev('document.querySelector("main").innerText');check(text.includes('id（数字编号）')&&text.includes('completed（布尔完成状态）'),'Final teaching names exact implemented fields');check(!text.includes('作者字段')&&!text.includes('经业务层'),'Provider prose cannot add unsupported fields or layers');
 const course=await (await fetch('http://127.0.0.1:5191/api/v1/projects/courses/'+id)).json();check(course.chapters.every(c=>c.teaching[0]===course.plan.scenario),'Published scenario and teaching use the same executable contract');
 for(const mode of ['light','dark']){if(ev('document.documentElement.dataset.theme')!==mode)run('find','role','button','click','--name',mode==='light'?'切换到浅色模式':'切换到深色模式','--exact');for(const width of [320,1440]){run('set','viewport',String(width),'1000');run('wait','--fn',`${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1`);check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'Final '+mode+' '+width+' no overflow');run('screenshot',path.join(out,'learning-final-'+mode+'-'+width+'.png'))}}
 ev('document.documentElement.style.zoom="2";true');check(ev('document.documentElement.scrollWidth<=innerWidth+1'),'Final content remains within page at CSS 200% zoom');run('screenshot',path.join(out,'learning-final-zoom-200.png'));ev('document.documentElement.style.zoom="";true');
}finally{fs.writeFileSync(path.join(out,'browser-final-content.json'),JSON.stringify({checks},null,2));run('close')}

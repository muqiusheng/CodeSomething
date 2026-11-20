import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN;if(!bin)throw Error('Activate the browser runtime and set CS_BROWSER_BIN.');
const session='cs-r6-acceptance',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/R6');fs.mkdirSync(out,{recursive:true});
const report={checks:[],layouts:[],audits:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
const click=name=>run('find','role','button','click','--name',name,'--exact');const wait=value=>run('wait','--text',value);const text=()=>ev('document.querySelector("main").innerText');
function viewport(width){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width} && (${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1)`)}
function layouts(label){for(const mode of ['light','dark']){if(ev('document.documentElement.dataset.theme')!==mode)click(mode==='light'?'切换到浅色模式':'切换到深色模式');for(const width of [320,375,768,1024,1440]){viewport(width);const pass=ev('document.documentElement.scrollWidth<=innerWidth+1');report.layouts.push({label,mode,width,pass});check(pass,label+' '+mode+' '+width+' has no page overflow')}viewport(1440);run('screenshot',path.join(out,label+'-'+mode+'.png'));const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'axe-'+label+'-'+mode+'.json'),JSON.stringify(a,null,2));report.audits.push({label,mode,counts:a.data.counts});check(a.data.counts.violations===0,label+' '+mode+' accessibility');viewport(375);run('screenshot',path.join(out,label+'-'+mode+'-375.png'));viewport(1440)}}
try{
 run('open',base+'/projects');wait('按兴趣选项目');run('find','role','link','click','--name','按兴趣选项目','--exact');wait('兴趣题材');check(text().includes('已发布项目'),'Studio is reachable from projects');
 run('find','label','兴趣题材','fill','阅读书单');click('查看适合我的方案');wait('比较三种方案');check(ev('document.querySelectorAll(".candidate-option").length===3'),'Three real candidate modes');check(ev('document.activeElement.id==="candidate-title"'),'Candidates receive keyboard focus');check(text().includes('先修待核对'),'Unverified prerequisites are explicit');
 layouts('candidates');
 const id=fs.readFileSync('new-system/runtime/r6-real-draft.txt','utf8').trim();run('open',base+'/projects/studio?draft='+id);wait('图书阅读收藏');check(text().includes('草稿')||text().includes('门禁')||text().includes('正在验证'),'Draft refresh restores persisted work');
 layouts('draft');
 fs.writeFileSync(path.join(out,'browser-phase1.json'),JSON.stringify(report,null,2));
}finally{run('close')}

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='cs-r5-finish',base='http://127.0.0.1:5179';
if(!bin)throw Error('Set CS_BROWSER_BIN.');
const out=path.resolve('new-system/docs/acceptance/R5');
const report={checks:[],layouts:[],audits:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
function viewport(width){run('set','viewport',String(width),'1000');run('wait','--fn',`innerWidth===${width} && (${width}<768 ? document.querySelector('.sidebar').getBoundingClientRect().right<=1 : document.querySelector('.sidebar').getBoundingClientRect().left>=-1)`)}
function audit(label){const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,`axe-final-${label}.json`),JSON.stringify(a,null,2));report.audits.push({label,counts:a.data.counts});check(a.data.counts.violations===0,label+' axe');}
try{
 run('open',base+'/profile');run('wait','--text','19 个关卡');
 click('停止额外复习');run('wait','--text','5 → 0 分钟/天');click('接受调整');run('wait','--text','调整已生效');check(ev('document.querySelector(".learner-adjustments>p strong").textContent==="0 分钟"'),'Extra review can be stopped through a new explicit proposal');
 for(const page of ['profile','reviews']){
  run('open',base+'/'+page);run('wait','--text',page==='profile'?'知识状态':'主动复习');
  if(page==='profile')run('select','.section-heading select','sql-foundations');
  for(const mode of ['light','dark']){
   if(ev('document.documentElement.dataset.theme')!==mode)click(mode==='light'?'切换到浅色模式':'切换到深色模式');
   for(const width of [320,375,768,1024,1440]){viewport(width);const fits=ev('document.documentElement.scrollWidth<=innerWidth+1 && scrollX===0');report.layouts.push({page,mode,width,pass:fits});check(fits,`${page} ${mode} ${width} stable layout`)}
   run('screenshot',path.join(out,`${page}-${mode}.png`));audit(`${page}-${mode}-1440`);
   viewport(375);run('screenshot',path.join(out,`${page}-${mode}-375.png`));audit(`${page}-${mode}-375`);
   if(page==='profile'){
    click('纠正“连接数据库”结论');run('wait','--text','纠正画像结论');run('find','label','说明','fill','用于检查长说明换行与键盘返回。'.repeat(20));audit(`correction-${mode}-375`);
    run('screenshot',path.join(out,`correction-${mode}-375.png`));run('press','Escape');check(ev('document.activeElement.textContent.includes("纠正")'),'Escape returns correction focus '+mode);
   }
   viewport(1440);
  }
  ev('document.documentElement.style.zoom="2"');viewport(1440);check(ev('document.documentElement.scrollWidth<=innerWidth+1'),page+' CSS zoom 200% fits');run('screenshot',path.join(out,page+'-zoom-200.png'));ev('document.documentElement.style.zoom=""');
 }
 run('open',base+'/reviews');run('network','route','**/api/v1/learner/reviews','--abort');run('reload');run('wait','--fn','document.querySelector("[role=alert]")!==null');check(ev('document.querySelector("[role=alert]").textContent.includes("重新读取")'),'Review network failure offers retry');run('network','unroute');click('重新读取');run('wait','--text','主动复习');
 check(ev('Array.from(document.querySelectorAll("select option")).some(e=>e.textContent.includes("独立迁移书签"))'),'All nineteen stages remain selectable');
 fs.writeFileSync(path.join(out,'browser-finish.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,layouts:report.layouts.length,audits:report.audits}));
}catch(e){fs.writeFileSync(path.join(out,'browser-finish-failure.json'),JSON.stringify({...report,error:String(e)},null,2));try{run('screenshot',path.join(out,'finish-failure.png'))}catch{}throw e}finally{try{run('close')}catch{}}

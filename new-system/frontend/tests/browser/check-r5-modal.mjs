import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const bin=process.env.CS_BROWSER_BIN,session='cs-r5-modal',out=path.resolve('new-system/docs/acceptance/R5');
const report={checks:[],audits:[],contrast:[]};
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});if(r.status!==0)throw Error(r.stdout+r.stderr);return JSON.parse(r.stdout)}
function check(pass,name){report.checks.push({pass:!!pass,name});if(!pass)throw Error(name)}
try{
 run('open','http://127.0.0.1:5179/profile');run('wait','--text','知识状态');run('select','.section-heading select','sql-foundations');run('set','viewport','375','1000');run('wait','--fn','document.querySelector(".sidebar").getBoundingClientRect().right<=1');
 for(const mode of ['light','dark']){
  if(ev('document.documentElement.dataset.theme')!==mode)run('find','role','button','click','--name',mode==='light'?'切换到浅色模式':'切换到深色模式','--exact');
  run('find','role','button','click','--name','纠正“连接数据库”结论','--exact');run('wait','--text','纠正画像结论');run('find','label','说明','fill','用于核对长内容、触控高度和焦点约束。'.repeat(20));
  run('wait','--fn','document.querySelector(".modal-content select").getBoundingClientRect().height>=43.99');
  check(ev('document.querySelector(".modal-content select").getBoundingClientRect().height>=43.99 && document.querySelector(".modal-content textarea").getBoundingClientRect().height>=100'),'Modal form controls have usable heights '+mode);
  const ratios=ev(`(()=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');function lum(color){x.clearRect(0,0,1,1);x.fillStyle=color;x.fillRect(0,0,1,1);const a=Array.from(x.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2]}const bg=getComputedStyle(document.querySelector('.modal-content')).backgroundColor;return Array.from(document.querySelectorAll('.modal-content label,.modal-content select,.modal-content textarea')).map(e=>{const s=getComputedStyle(e),background=s.backgroundColor==='rgba(0, 0, 0, 0)'?bg:s.backgroundColor;const a=lum(s.color),b=lum(background);return {tag:e.tagName,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})})()`);
  report.contrast.push({mode,ratios});check(ratios.every(r=>r.ratio>=4.5),'Modal text contrast '+mode);
  for(let i=0;i<16;i++){run('press',i<8?'Tab':'Shift+Tab');check(ev('document.querySelector("[role=dialog]").contains(document.activeElement)'),'Modal traps keyboard focus '+mode+' '+i)}
  run('screenshot',path.join(out,`correction-${mode}-375.png`));const a=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,`axe-final-correction-${mode}-375.json`),JSON.stringify(a,null,2));report.audits.push({mode,counts:a.data.counts});check(a.data.counts.violations===0,'Modal axe '+mode);
  run('press','Escape');check(ev('document.activeElement.textContent.includes("纠正")'),'Escape restores focus '+mode);
 }
 fs.writeFileSync(path.join(out,'modal-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{try{run('close')}catch{}}

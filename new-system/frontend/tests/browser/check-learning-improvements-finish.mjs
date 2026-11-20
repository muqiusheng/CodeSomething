import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-improvement-finish',out=path.resolve('new-system/docs/acceptance/learning-improvements');
const selected=process.env.CS_FINISH_PAGES?.split(',');
const results=selected?JSON.parse(fs.readFileSync(path.join(out,'finish.json'),'utf8')).filter(r=>!selected.includes(r.page)):[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const pages=[['home','/learn','继续学习'],['jdbc','/learn/boot-foundations/1.0/boot-jdbc?tab='+encodeURIComponent('教学'),'跟着一个编号'],['http-primer','/learn/http-json/1.1/workspace','先看懂一次请求'],['sql','/learn/sql/1.0/db-connect','当前脚本']];
try{
 for(const theme of ['light','dark']){
  run('open','http://127.0.0.1:5179/learn');ev(`localStorage.setItem('cs-theme',${JSON.stringify(theme)});true`);
  for(const [label,route,ready] of pages.filter(p=>!selected||selected.includes(p[0]))){
   run('open','http://127.0.0.1:5179'+route);run('wait','--text',ready);run('set','viewport','1440','1000');
   if(label==='home')run('focus','.skip');
   if(label==='jdbc')ev(`document.querySelector('[aria-label="JDBC完整数据流讲解"] details').open=true;true`);
   const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));
   fs.writeFileSync(path.join(out,`axe-${label}-${theme}.json`),JSON.stringify(audit,null,2));
   results.push({page:label,theme,counts:audit.data.counts});
   if(label==='home'){
    run('press','Enter');assert.equal(ev('document.activeElement.id'),'main');
    run('set','viewport','390','844');
    // Wait for the existing side-panel transition before making visual evidence.
    run('wait','--fn',`getComputedStyle(document.querySelector('.sidebar')).transform==='matrix(1, 0, 0, 1, -224, 0)'||document.querySelector('.sidebar').getBoundingClientRect().right<=0`);
    const v=ev(`({reviewTop:document.querySelector('.improved-home>.review-entry').getBoundingClientRect().top,height:innerHeight,direction:getComputedStyle(document.querySelector('.lesson-steps')).flexDirection,width:document.documentElement.scrollWidth})`);
    assert(v.reviewTop<v.height,JSON.stringify(v));assert.equal(v.direction,'row');assert(v.width<=390);results.push({page:'mobile-home',theme,...v});
    ev('window.scrollTo(0,0);true');run('screenshot',path.join(out,`home-mobile-${theme}-final.png`));
   }else run('screenshot',path.join(out,`${label}-${theme}-final.png`));
  }
 }
 fs.writeFileSync(path.join(out,'finish.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{run('close')}

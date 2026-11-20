import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-report-finish',out=path.resolve('new-system/docs/acceptance/visual-report');const results=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:90000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
try{for(const theme of ['light','dark']){
 run('open','http://127.0.0.1:5179/projects');ev(`localStorage.setItem('cs-theme',${JSON.stringify(theme)});true`);run('reload');run('wait','--text','按兴趣选项目');run('set','viewport','1280','720');
 run('click','[aria-label="卡片布局"]');run('wait','--fn',`document.querySelectorAll('.course-artifact').length===7&&document.getAnimations().every(a=>a.playState!=='running')`);
 run('screenshot',path.join(out,`project-artifacts-${theme}-final.png`));
 const layout=ev(`Array.from(document.querySelectorAll('.project-card')).slice(0,3).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width}})`);assert(layout.every(r=>r.width<400));assert(Math.abs(layout[0].top-layout[1].top)<2);assert(layout[0].right<layout[1].left);results.push({theme,layout});
 run('focus','.search input');const focus=ev(`(()=>{const outer=getComputedStyle(document.querySelector('.search')),inner=getComputedStyle(document.querySelector('.search input'));return {outline:outer.outlineColor,border:outer.borderColor,offset:outer.outlineOffset,inner:inner.outlineStyle}})()`);assert.equal(focus.outline,focus.border);assert.equal(focus.offset,'0px');assert.equal(focus.inner,'none');results.push({theme,focus});
 run('click','[aria-label="快捷导航"]');run('fill','[cmdk-input]','复习');run('screenshot',path.join(out,`command-${theme}-final.png`));
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,`axe-command-${theme}.json`),JSON.stringify(audit,null,2));results.push({theme,axe:audit.data.counts});
 run('press','Escape');assert.equal(ev(`document.activeElement.getAttribute('aria-label')`),'快捷导航');
 for(const [label,route,ready] of [['home','/learn','继续学习'],['path','/path','学习内容'],['sql','/learn/sql/1.0/db-connect','连接与识别数据库']]){run('open','http://127.0.0.1:5179'+route);run('wait','--text',ready);run('set','viewport','390','844');run('wait','--fn',`document.getAnimations().every(a=>a.playState!=='running')`);run('screenshot',path.join(out,`${label}-${theme}-mobile-final.png`));}

}fs.writeFileSync(path.join(out,'finish.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))}finally{run('close')}

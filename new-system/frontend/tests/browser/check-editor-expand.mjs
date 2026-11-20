import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-editor-expand-audit',base='http://127.0.0.1:5179';
const out=path.resolve('new-system/docs/acceptance/editor-expand');fs.mkdirSync(out,{recursive:true});
const checks=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const click=name=>run('find','role','button','click','--name',name,'--exact');
try{
 for(const [label,route] of [['HTTP','/learn/http-json/1.1/workspace'],['Boot','/learn/boot-foundations/1.0/boot-start'],['A','/learn/task-manager/1.0/a-read'],['B','/learn/collaboration/1.0/b-login'],['SQL','/learn/sql/1.0/db-connect']]){
  run('open',base+route);run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);
  ev(`window.originalEditor=document.querySelector('.monaco-editor');true`);
  for(const width of [375,768,1440]){
   run('set','viewport',String(width),'900');click('放大编辑');
   const size=ev(`(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,same:window.originalEditor===document.querySelector('.monaco-editor'),modal:d.matches(':modal')}})()`);
   assert(size.modal&&size.same&&!size.overflow);assert(size.width>=width-34&&size.height>=865);checks.push({label,width,...size});
   if(label==='HTTP'&&width===1440)run('screenshot',path.join(out,'desktop.png'));
   if(label==='Boot'&&width===375)run('screenshot',path.join(out,'mobile.png'));
   run('press','Escape');assert(ev(`!document.querySelector('dialog[open]')&&document.activeElement.textContent.includes('放大编辑')`));
  }
  click('放大编辑');click('还原编辑器');assert(ev(`window.originalEditor===document.querySelector('.monaco-editor')`));
 }
 run('open',base+'/learn/http-json/1.1/workspace');run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);
 click('放大编辑');run('focus','.monaco-editor [role=textbox]');run('press','Control+End');run('type','.monaco-editor [role=textbox]','\n// expanded-editor-marker');click('还原编辑器');run('wait','--text','已保存到服务器');
 run('reload');run('wait','--fn',`document.querySelector('.monaco-editor [role=textbox]')!==null`);run('focus','.monaco-editor [role=textbox]');run('press','Control+a');assert(ev(`document.querySelector('.monaco-editor [role=textbox]').value.includes('expanded-editor-marker')`));run('press','ArrowLeft');
 checks.push('Code entered while expanded saves and restores after reload in the isolated database');
 const resizing=ev(`(()=>{const area=document.querySelector('.code-editor-area');area.style.height='620px';return getComputedStyle(area).resize==='vertical'&&area.getBoundingClientRect().height===620})()`);assert(resizing);checks.push('Normal editor supports vertical resizing');
}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks},null,2));run('close')}
console.log('Passed:',checks.length);

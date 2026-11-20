import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-local-first-extra',base='http://127.0.0.1:5179',out=path.resolve('new-system/docs/acceptance/local-first');
const checks=[];
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:65000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(code){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input:code,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const wait=text=>run('wait','--text',text,'--timeout','60000');
async function api(route,body){const r=await fetch('http://127.0.0.1:5189/api/v1'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.ok,await r.clone().text());return r.json()}
try {
 const work=await api('/portfolio',{theme:'本地文件读取验收',domain:'reservation',idempotencyKey:'local-reader-browser'});
 const starter=await api('/portfolio/starter'),folder=path.resolve('new-system/runtime/local-first-acceptance/portfolio');
 for(const [name,source] of Object.entries(starter)){const file=path.join(folder,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source+'\n// portfolio-local-marker\n')}
 fs.writeFileSync(path.join(folder,'private.txt'),'This file must not be imported');
 run('open',base+work.route);wait('工程检查');run('find','role','tab','click','--name','工程检查','--exact');wait('读取本地工程');
 run('upload','input[webkitdirectory]',folder);wait('读取于');assert(ev('document.body.textContent.includes("portfolio-local-marker")'));assert(!ev('document.body.textContent.includes("This file must not be imported")'));checks.push('Portfolio imports a real directory into the read-only source viewer and excludes unrelated files');
 run('find','role','button','click','--name','网页编辑（辅助）','--exact');wait('返回只读查看');checks.push('Shared project file viewer can explicitly enable auxiliary editing');
 run('set','viewport','375','900');assert(ev('document.documentElement.scrollWidth<=innerWidth+1'));run('set','viewport','1440','900');run('screenshot',path.join(out,'portfolio-local-reader.png'));
 run('open',base+'/learn/tlias/start');wait('读取本地Tlias工程');const tlias=path.resolve('new-system/runtime/local-first-acceptance/tlias');fs.mkdirSync(path.join(tlias,'src/main/java/dev/codesomething/tlias'),{recursive:true});fs.writeFileSync(path.join(tlias,'src/main/java/dev/codesomething/tlias/LocalMarker.java'),'package dev.codesomething.tlias;\n// tlias-local-marker\npublic class LocalMarker {}');
 run('upload','input[webkitdirectory]',tlias);wait('LocalMarker.java');run('find','role','button','click','--name','LocalMarker.java','--exact');wait('tlias-local-marker');checks.push('Tlias imports real local Java source without reporting automatic success');
 run('find','role','button','click','--name','切换到深色模式','--exact');run('set','viewport','375','900');assert(ev('document.documentElement.scrollWidth<=innerWidth+1'));run('screenshot',path.join(out,'tlias-mobile-dark.png'));
 const audit=JSON.parse(run('a11y','--tags','wcag2a,wcag2aa','--json'));fs.writeFileSync(path.join(out,'readers.json'),JSON.stringify({checks,audit},null,2));console.log(checks);
}finally{run('close')}

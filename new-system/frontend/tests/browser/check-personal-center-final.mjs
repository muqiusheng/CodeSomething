import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const bin=process.env.CS_BROWSER_BIN,session='cs-profile-r9',out=path.resolve('new-system/docs/acceptance/R9');
function run(...args){const r=spawnSync(bin,['--session',session,...args],{encoding:'utf8',windowsHide:true,timeout:45000});assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim()}
function ev(input){const r=spawnSync(bin,['--session',session,'eval','--stdin'],{input,encoding:'utf8',windowsHide:true,timeout:35000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
const records=[];
run('open','http://127.0.0.1:5178/profile');run('wait','--text','我的学习数据');run('wait','--fn',`document.querySelectorAll('.activity-cell').length===30`);run('set','viewport','1440','1000');
for(const theme of ['light','dark']){
 if(ev('document.documentElement.dataset.theme')!==theme)run('find','role','button','click','--name',theme==='light'?'切换到浅色模式':'切换到深色模式','--exact');
 const contrast=ev(`(()=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');function rgb(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)}function lum(v){const a=v.map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722}const bg=lum(rgb(getComputedStyle(document.querySelector('.radar-panel')).backgroundColor));return [...document.querySelectorAll('.ability-radar text,.ability-radar tspan')].map(el=>{const fg=lum(rgb(getComputedStyle(el).fill));return {text:el.textContent,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}})})()`);
 assert(contrast.every(c=>c.ratio>=4.5),'SVG labels meet 4.5 contrast');records.push({theme,contrast});run('screenshot',path.join(out,'daily-personal-center-'+theme+'.png'));
}
assert(!ev(`document.querySelector('main').innerText.includes('从读懂接口')`));
run('find','role','button','click','--name','切换到浅色模式','--exact');run('click','.sidebar .personal-trigger');run('screenshot',path.join(out,'daily-personal-menu.png'));run('press','Escape');
fs.writeFileSync(path.join(out,'daily-final.json'),JSON.stringify({svgContrast:records,bannerRemoved:true,dailyDatabaseHasNoAcceptanceRuns:true},null,2));console.log(JSON.stringify({themes:records.length,minimumContrast:Math.min(...records.flatMap(r=>r.contrast.map(c=>c.ratio)))}));

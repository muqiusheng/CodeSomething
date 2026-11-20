import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const base = process.env.CS_JOURNEY_QA_URL ?? 'http://127.0.0.1:5208';
const screenshots = process.env.CS_MOTION_SCREENSHOTS;
const uri = '/learn/http-json/1.1/workspace?tab=任务&journey=02';
const source = readFileSync('new-system/frontend/src/features/learning/journey/foundations.ts', 'utf8')
 .split('export const firstResponse = `')[1].split('`;')[0].trimEnd();
const sourceWithLines = source + '\n' + Array.from({length: 110}, (_,i)=>`// line ${i}`).join('\n') + '\n';
const notes = Array.from({length: 7}, (_,i)=>`AdditionalProjectFileWithLongName${i}.java`);
const editor = '.monaco-editor [role="textbox"]';

function command(args, input) {
 const result = spawnSync(process.env.CS_BROWSER_BIN, ['--session','cs-workspace-motion', ...args.map(String)], {
  encoding:'utf8', input, timeout:45000, windowsHide:true
 });
 assert.equal(result.status, 0, args.join(' ') + ': ' + result.stdout + result.stderr);
 return result.stdout.trim();
}
const run = (...args) => command(args);
const ev = code => JSON.parse(command(['eval','--stdin'], code));
const wait = (code,timeout='12000') => run('wait','--fn',code,'--timeout',timeout);
const click = name => run('find','role','button','click','--name',name,'--exact');
const rect = selector => ev(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
const scoped = selector => `document.querySelector(${JSON.stringify(selector)})`;
function capture(name) {
 if(!screenshots)return;
 mkdirSync(screenshots,{recursive:true});
 run('screenshot',join(screenshots,name+'.png'));
}
function tab(path) {
 run('click', `.project-open-tab > button[title="${path}"]`);
 wait(`document.querySelector('.code-editor-shell')?.getAttribute('aria-label') === ${JSON.stringify('编辑 '+path)}`);
}
function visibleText() {
 return ev(`Array.from(document.querySelectorAll('.monaco-editor .view-line')).map(node=>node.textContent.replaceAll(String.fromCharCode(160),' ')).join('\\n')`);
}
function mouseTo(x,y) {run('mouse','move',Math.round(x),Math.round(y))}
async function wheelAt(x,y,deltaY) {
 // The generic mouse-wheel command emits at (0, 0). Address the tab strip
 // explicitly through the same Chrome input pipeline as a physical wheel.
 const endpoint=new URL(run('get','cdp-url'));
 endpoint.protocol='http:';
 endpoint.pathname='/json/list';
 const pages=await (await fetch(endpoint,{signal:AbortSignal.timeout(5000)})).json();
 const target=pages.find(page=>page.type==='page'&&page.url.startsWith(base));
 assert.ok(target?.webSocketDebuggerUrl,'The test tab must expose its CDP connection');
 await new Promise((resolve,reject)=>{
  const socket=new WebSocket(target.webSocketDebuggerUrl);
  const timer=setTimeout(()=>{socket.close();reject(new Error('Wheel input timed out'))},5000);
  socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Input.dispatchMouseEvent',
   params:{type:'mouseWheel',x,y,deltaX:0,deltaY}})));
  socket.addEventListener('message',event=>{
   const response=JSON.parse(event.data);
   if(response.id!==1)return;
   clearTimeout(timer);socket.close();
   if(response.error)reject(new Error(response.error.message));
   else resolve();
  });
 });
}
const track='.project-open-files';
const tabStrip='.project-tab-strip';
const toolbar='.folder-workspace-toolbar';
const dock='.workspace-dock-results';

try {
 run('set','viewport',1366,768);
 run('open',base+uri);
 run('wait','--text','工程工作区');
 ev(`(async()=>{
  const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('motion-http',{create:true});
  const files=${JSON.stringify(Object.fromEntries([['TaskServer.java',sourceWithLines],...notes.map((path,index)=>[path,`// Extra file ${index}\n`])]))};
  for(const [name,contents] of Object.entries(files)){
   const file=await root.getFileHandle(name,{create:true});
   const stream=await file.createWritable();await stream.write(contents);await stream.close();
  }
  window.motionRoot=root;window.showDirectoryPicker=async()=>root;
  return true;
 })()`);
 run('click','.folder-project-options > summary');
 click('浏览器授权连接（备用）');
 wait('Boolean(document.querySelector(".project-tree-trigger"))');
 const aligned=()=>assert.ok(Math.abs(rect('.project-tab-toolbar').x-rect('.folder-editor-content').x)<1);
 aligned();
 click('项目文件');
 wait(`${scoped('.project-file-drawer')}.getAttribute('data-open') === 'true'`);
 click('TaskServer.java');
 wait('Boolean(document.querySelector(".monaco-editor"))');
 assert.equal(ev('document.querySelectorAll(".project-close-tab").length'),0);
 assert.ok(ev('!document.querySelector(".lesson-header-bar").innerText.includes("从逐课练习进入")'));
 aligned();

 // The modeless drawer gives a click on the editor straight to the editor.
 click('项目文件');
 const area=rect('.monaco-editor');
 mouseTo(area.right-50,area.y+28);
 run('mouse','down','left');run('mouse','up','left');
 assert.equal(ev(`${scoped('.project-file-drawer')}.dataset.open`),'false');
 assert.equal(ev('document.activeElement.closest(".monaco-editor") !== null'),true);

 // Select a word on line 20, make an edit, then revisit the previous file.
 run('focus',editor);
 run('press','Control+Home');
 for(let i=0;i<19;i++)run('press','ArrowDown');
 run('press','End');
 run('keyboard','inserttext',' edit-on-20');
 assert.ok(visibleText().includes('edit-on-20'));
 assert.ok(ev('!!document.querySelector(".project-single-dirty")'));
 click('项目文件');click(notes[0]);
 run('focus',editor);run('press','Control+End');
 run('keyboard','inserttext','// other-model');
 tab('TaskServer.java');
 assert.ok(visibleText().includes('edit-on-20'));
 run('focus',editor);
 run('keyboard','inserttext',' plus-caret');
 const resumed=visibleText();
 assert.ok(resumed.includes('edit-on-20 plus-caret'), resumed.split('\n').filter(line=>line.includes('caret')||line.includes('edit-on-20')).join('\n'));
 run('press','Control+z');
 assert.ok(!visibleText().includes('plus-caret'));
 if(visibleText().includes('edit-on-20'))run('press','Control+z');
 assert.ok(!visibleText().includes('edit-on-20'));
 tab(notes[0]);
 assert.ok(visibleText().includes('other-model'));
 run('focus',editor);run('press','Control+z');
 assert.ok(!visibleText().includes('other-model'));
 tab('TaskServer.java');
 assert.ok(!visibleText().includes('edit-on-20'));

 const topsBefore=[rect(toolbar).height,rect('.code-editor-area').y];
 assert.equal(topsBefore[0],40);
 assert.ok(rect('.monaco-editor').height>=402,'at least 80px above the measured 322px baseline');
 run('focus',editor);run('keyboard','inserttext',' // saved-from-browser');
 assert.ok(visibleText().includes('saved-from-browser'));
 wait('Boolean(document.querySelector(".project-save:not(:disabled)"))');
 assert.ok(ev('!!document.querySelector(".project-open-tab[data-active=true] .tab-dirty")'));
 run('click','.project-save');
 wait(`(async()=> (await (await (await window.motionRoot.getFileHandle('TaskServer.java')).getFile()).text()).split(String.fromCharCode(10))[19].includes('saved-from-browser'))()`);
 assert.equal(ev('!!document.querySelector(".project-open-tab[data-active=true] .tab-dirty")'),false);
 assert.deepEqual([rect(toolbar).height,rect('.code-editor-area').y],topsBefore);
 click('运行并检查');
 wait('Boolean(document.querySelector(\'[aria-label="实际 HTTP 响应正文"] pre\')?.textContent.trim())','35000');
 assert.deepEqual([rect(toolbar).height,rect('.code-editor-area').y],topsBefore);
 capture('http-motion-1366');
 console.log('PASS file models retain caret and independent undo; real save and HTTP check keep toolbar at 40px');

 const divider='.dock-divider';
 const point=rect(divider);
 mouseTo(point.x+point.width/2,point.y+point.height/2);
 wait('Math.abs(document.querySelector(".dock-divider span").getBoundingClientRect().width - 56) < 1');
 assert.equal(rect('.dock-divider span').height,3);
 run('mouse','down','left');
 mouseTo(point.x+point.width/2,point.y+180);
 wait(`Math.abs(${scoped(dock)}.getBoundingClientRect().height-152) < 1`);
 mouseTo(point.x+point.width/2,point.y+173);
 wait(`${scoped(dock)}.getBoundingClientRect().height > 156`);
 run('mouse','up','left');
 assert.equal(ev('document.body.hasAttribute("data-workspace-resize")'),false);
 const beforeFold=rect('.folder-project-workspace').width;
 click('收起任务与教学');
 wait(`${scoped('.folder-project-workspace')}.getBoundingClientRect().width > ${beforeFold+300}`);
 assert.equal(ev('document.querySelector(".workspace-task-content").getClientRects().length'),0);
 click('展开任务与教学');
 wait(`${scoped('.folder-project-workspace')}.getBoundingClientRect().width < ${beforeFold+2}`);
 console.log('PASS 56×3px dock handle, instant edge reversal and full-width desktop task collapse');

 run('set','viewport',1600,900);
 wait(`${scoped('.project-file-drawer')}.dataset.wide === 'true'`);
 click('项目文件');
 for(const path of notes.slice(1))click(path);
 wait(`${scoped(track)}.scrollLeft > 0`);
 ev(`${scoped(track)}.scrollTo({left:0,behavior:'instant'}); true`);
 wait(`getComputedStyle(${scoped(tabStrip)}, '::after').opacity === '1'`);
 run('focus','.project-open-tab:first-child button');
 assert.equal(ev(`getComputedStyle(${scoped(tabStrip)}, '::after').opacity`),'1');
 const rail=rect(track);
 await wheelAt(rail.x+rail.width*.55,rail.y+rail.height/2,300);
 wait(`${scoped(track)}.scrollLeft > 50`);
 aligned();
 const tabActive=ev(`(() => {
  const tab = document.querySelector('.project-open-tab[data-active=true]');
  const close = tab.querySelector('.project-close-tab svg');
  return {border:getComputedStyle(tab).borderTopWidth,button:getComputedStyle(tab.querySelector('button')).borderTopWidth,translate:getComputedStyle(close).translate};
 })()`);
 assert.deepEqual(tabActive,{border:'1px',button:'0px',translate:'none'});
 capture('wide-tabs');
 click('项目文件');
 wait(`${scoped('.project-file-drawer')}.getBoundingClientRect().width < 1`);
 aligned();
 console.log('PASS aligned animated drawer and active tab, vertical wheel scroll, stationary icons and persistent fade');

 for(const width of [320,390,641,768,930,1024,1366]){
  run('set','viewport',width,844);
  if(width<640){
   click('代码编写');
   assert.ok(rect(toolbar).height>40);
  }else assert.equal(rect(toolbar).height,40);
  assert.ok(ev('document.documentElement.scrollWidth<=innerWidth+1'));
  if(width===390){
   click('代码编写');
   assert.equal(ev('document.querySelector(".workspace-task-content").getClientRects().length'),0);
   click('项目文件');
   assert.equal(ev('document.querySelector(".project-tree-trigger").ariaExpanded'),'true');
   assert.ok(ev('document.querySelector(".project-file-drawer").getBoundingClientRect().top >= document.querySelector(".project-tree-trigger").getBoundingClientRect().bottom'));
   assert.equal(ev('document.querySelectorAll(".project-tree-heading button").length'),0);
   click('项目文件');
   assert.equal(ev('document.querySelector(".project-tree-trigger").ariaExpanded'),'false');
   click('项目文件');
   run('focus','.folder-file-directory');
   run('press','Escape');
   assert.equal(ev('document.activeElement.getAttribute("aria-label")'),'项目文件');
   capture('mobile-collapsed');
   click('任务要求');
  }
 }
 run('set','viewport',1366,844);
 ev(`sessionStorage.setItem('cs-folder-project-http-json-basics-1.1.0-unsaved',JSON.stringify({'TaskServer.java':{base:${JSON.stringify(sourceWithLines)},value:${JSON.stringify(sourceWithLines+'// recovered-draft')}}}));true`);
 run('reload');
 wait('!!document.querySelector(".project-editor-empty button")');
 click('重新打开 TaskServer.java');
 wait('!!document.querySelector(".monaco-editor")');
 run('focus',editor);
 run('press','Control+End');
 assert.ok(visibleText().includes('recovered-draft'));
 assert.equal(ev('document.querySelectorAll(".project-close-tab").length'),0);
 console.log('PASS a restored draft can reopen from the empty editor and the last tab stays open');
 ev("document.documentElement.dataset.motion='reduce';true");
 assert.equal(ev("getComputedStyle(document.querySelector('.project-file-drawer')).transitionDuration"),'0s');
 console.log('PASS seven viewport widths, mobile fold and directory focus, and reduced motion');
} finally {try{run('close')}catch(error){console.warn(error.message)}}

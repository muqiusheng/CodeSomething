import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const base = process.env.CS_JOURNEY_QA_URL ?? 'http://127.0.0.1:5208';
const screenshots = process.env.CS_LAYOUT_SCREENSHOTS;
const session = 'cs-layout-checklist';
const http = '/learn/http-json/1.1/workspace?tab=任务&journey=02';
const runtimeSource = readFileSync('new-system/frontend/src/features/learning/journey/foundations.ts', 'utf8')
 .split('export const firstResponse = `')[1].split('`;')[0];
const bootReference = 'new-system/course-packs/boot-foundations/1.0.0/boot-start/reference';
const bootFiles = Object.fromEntries(['pom.xml', 'src/main/java/dev/codesomething/lab/Application.java',
 'src/main/java/dev/codesomething/lab/HealthController.java']
 .map(path => [path, readFileSync(join(bootReference, path), 'utf8')]));
for (const part of ['Api', 'Configuration', 'Domain', 'Implementation', 'Storage', 'Utilities']) {
 bootFiles[`NotesForThe${part}Layer.md`] = part;
}

function command(args, input) {
 const result = spawnSync(process.env.CS_BROWSER_BIN, ['--session', session, ...args], {
  input, encoding: 'utf8', windowsHide: true, timeout: 45000
 });
 assert.equal(result.status, 0, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
}
const run = (...args) => command(args);
const ev = code => JSON.parse(command(['eval', '--stdin'], code));
const open = path => run('open', base + path);
const wait = (code, timeout = '18000') => run('wait', '--fn', code, '--timeout', timeout);
const click = name => run('find', 'role', 'button', 'click', '--name', name, '--exact');
const viewport = (width, height = 768) => run('set', 'viewport', String(width), String(height));

function screenshot(name) {
 if (!screenshots) return;
 mkdirSync(screenshots, {recursive: true});
 run('screenshot', join(screenshots, name + '.png'));
}

function connect(name, files) {
 ev(`(async () => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(${JSON.stringify(name)}, {create:true});
  for (const [path, contents] of Object.entries(${JSON.stringify(files)})) {
   const parts = path.split('/');
   let dir = root;
   for (const part of parts.slice(0,-1)) dir = await dir.getDirectoryHandle(part,{create:true});
   const writer = await (await dir.getFileHandle(parts.at(-1),{create:true})).createWritable();
   await writer.write(contents); await writer.close();
  }
  window.showDirectoryPicker = async () => root;
  return true;
 })()`);
 run('click','.folder-project-options > summary');
 click('浏览器授权连接（备用）');
 wait('!!document.querySelector(".project-tree-trigger")');
}

function fits(label, widths) {
 for (const width of widths) {
  viewport(width);
  const actual = ev(`({
   viewport: innerWidth, document: document.documentElement.scrollWidth,
   topbar: document.querySelector('.topbar').getBoundingClientRect().right
  })`);
  assert.ok(actual.document <= width + 1 && actual.topbar <= width + 1, `${label} ${JSON.stringify(actual)}`);
 }
}

try {
 viewport(1366);
 open(http);
 run('wait', '--text', '工程工作区');
 connect('layout-http', {'TaskServer.java': runtimeSource});
 click('项目文件');
 click('TaskServer.java');
 wait('Boolean(document.querySelector(".monaco-editor"))');
 const editorWidth = ev('document.querySelector(".monaco-editor").clientWidth');
 const side='.sidebar';
 // Sample both moving edges, including intermediate animation frames.
 ev(`window.navFrames=[];window.navProbe=true;
 const sample=()=>{if(!window.navProbe)return;const sidebar=document.querySelector('.sidebar').getBoundingClientRect();
 const main=document.querySelector('#main').getBoundingClientRect();
 window.navFrames.push({edge:sidebar.right,main:main.left});requestAnimationFrame(sample)};sample();true`);
 run('mouse','move','20','110');
 wait('Math.abs(document.querySelector(".sidebar").offsetWidth-224)<1');
 assert.ok(ev('document.querySelector("#main").getBoundingClientRect().left>=224'));
 run('mouse','move','810','610');
 wait('document.querySelector(".sidebar").offsetWidth===56');
 const frames=ev('window.navProbe=false;window.navFrames');
 assert.ok(frames.some(frame=>frame.edge>60&&frame.edge<220));
 assert.ok(frames.every(frame=>frame.edge<=frame.main+.5),'sidebar overlaps article during resize');
 run('focus',side+' .brand');
 run('press','Tab');
 wait('document.querySelector(".sidebar").offsetWidth===224');
 run('focus','.project-tree-trigger');
 wait('document.querySelector(".sidebar").offsetWidth===56');
 assert.ok(editorWidth >= 680, `Editor width ${editorWidth}`);
 assert.equal(ev('document.querySelector(".project-tree-trigger").getAttribute("aria-expanded")'), 'false');
 click('运行并检查');
 wait('Boolean(document.querySelector(\'[aria-label="实际 HTTP 响应正文"] pre\')?.textContent.trim())');
 assert.equal(ev(`(() => {
  const response = document.querySelector('[aria-label="实际 HTTP 响应正文"] pre');
  const panel = response.closest('.workspace-output');
  return response.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom && scrollY === 0;
 })()`), true);
 assert.equal(ev('Boolean(document.querySelector(\'.workspace-output a[href="/learn/journey/03"]\'))'), true);
 screenshot('http-1366');
 click('切换到深色模式');
 wait('getComputedStyle(document.querySelector(".monaco-editor-background")).backgroundColor==="rgb(22, 13, 46)"');
 screenshot('http-dark-1366');
 click('切换到浅色模式');
 const before = ev('document.querySelector(".workspace-dock-results").clientHeight');
 run('focus', '.dock-divider');
 run('press', 'ArrowUp');
 assert.ok(ev('document.querySelector(".workspace-dock-results").clientHeight') > before);
 click('放大编辑');
 assert.ok(ev('document.querySelector(".code-editor-shell[open] .monaco-editor").clientWidth') >= 900);
 run('press', 'Escape');
 assert.equal(ev('document.activeElement.getAttribute("aria-label")'), '放大编辑');
 console.log(`PASS HTTP through real Java, editor ${editorWidth}px, response above fold, next lesson, keyboard resize and fullscreen`);

 fits('HTTP task', [320, 390, 640, 641, 768, 769, 930, 960, 1024, 1025, 1366]);
 viewport(930);
 screenshot('http-930');
 click('项目文件');
 click('学习辅导');
 assert.equal(ev(`(() => {
  const modal = document.querySelector('.modal-content');
  const {x,y,width,height} = modal.getBoundingClientRect();
  return modal.contains(document.elementFromPoint(x+width/2,y+height/2));
 })()`), true);
 run('press', 'Escape');
 wait('!document.querySelector(".modal-content")');
 assert.equal(ev('document.querySelector(".project-file-drawer").dataset.open'), 'false');
 assert.equal(ev('document.activeElement.textContent'), '学习辅导');
 viewport(641);
 click('收起任务与教学');
 assert.equal(ev('getComputedStyle(document.querySelector(".workspace-task-content")).display'), 'none');
 click('展开任务与教学');

 viewport(390, 844);
 click('打开导航');
 wait('document.querySelector(".mobile-nav-slot").offsetHeight>150');
 assert.ok(ev('document.querySelector("#main").getBoundingClientRect().top>=document.querySelector(".mobile-nav-slot").getBoundingClientRect().bottom-.5'));
 run('press','Escape');
 wait('document.querySelector(".mobile-nav-slot").offsetHeight===0');
 click('代码编写');
 click('项目文件');
 assert.equal(ev('document.querySelector(".project-tree-trigger").ariaExpanded'),'true');
 assert.ok(ev('document.querySelector(".project-file-drawer").getBoundingClientRect().top >= document.querySelector(".project-tree-trigger").getBoundingClientRect().bottom'));
 screenshot('directory-390');
 run('focus','.folder-file-directory');
 run('press', 'Escape');
 assert.equal(ev('document.activeElement.getAttribute("aria-label")'), '项目文件');
 run('eval', 'window.scrollTo(0, 0)');
 screenshot('http-390');
 viewport(1366);
 run('mouse','move','800','120');
 wait('document.querySelector(".sidebar").offsetWidth===56');
 run('find', 'role', 'tab', 'click', '--name', '教学');
 assert.equal(ev(`(() => {
  const footer = document.querySelector('.article-bottom-actions');
  return footer.getBoundingClientRect().bottom <= innerHeight &&
    footer.querySelector('[aria-label="前后章节"] a').getClientRects().length > 0;
 })()`), true);
 console.log('PASS 11 HTTP viewport widths, modal above file drawer, tablet task fold and mobile focus restore, desktop article actions');

 viewport(1600, 900);
 open('/learn/boot-foundations/1.0/boot-start?tab=任务');
 run('wait', '--text', '工程工作区');
 assert.ok(ev('document.querySelector(".project-start-card").innerText.includes("选择本地工程文件夹")'));
 click('学习辅导');
 viewport(390);viewport(1366);
 assert.ok(ev('!!document.querySelector(".modal-content textarea")'));
 run('press','Escape');
 viewport(1600,900);
 assert.ok(ev('!document.querySelector(".journey-workspace-entry")'));
 const currentStep=ev('document.querySelector(".practice-current h2").textContent');
 click('下一步操作');
 assert.notEqual(ev('document.querySelector(".practice-current h2").textContent'),currentStep);
 assert.equal(ev('document.querySelectorAll(".workspace-output .completion-card[data-state=passed]").length'),0);
 connect('layout-boot', bootFiles);
 wait('document.querySelector(".project-tree-trigger").getAttribute("aria-expanded") === "true"');
 for (const path of Object.keys(bootFiles).filter(path => path.endsWith('.md'))) click(path);
 assert.ok(ev('document.querySelector(".project-open-files").scrollLeft > 0'));
 ev('document.querySelector(".project-open-files").scrollLeft = 0');
 wait('document.querySelector(".project-tab-strip").dataset.more === "true"');
 run('focus', '.project-open-tab:first-child button');
 assert.equal(ev('document.querySelector(".project-tab-strip").dataset.more'), 'true');
 click('提交验证');
 wait('Boolean(document.querySelector(".workspace-dock-results .check-pass"))', '35000');
 assert.ok(ev('document.querySelector(".workspace-dock-results").getBoundingClientRect().bottom <= innerHeight'));
 screenshot('boot-1600');
 fits('Boot', [390, 641, 768, 930, 960, 1366]);
 console.log('PASS Boot directory at wide viewport, real Boot check, long file tabs and focus, six workbench widths');

 for (const [path, selector] of [
  ['/learn', '.learning-home'],
  ['/path', '.path-page'],
  ['/projects', '.project-library'],
  ['/learn/sql/1.0/db-connect', '.coding-chapters'],
  ['/learn/journey/02', '.journey-article'],
  ['/reviews', 'main h1'],
  ['/profile', 'main h1'],
  ['/portfolio', 'main h1'],
  ['/settings', 'main h1']
 ]) {
  open(path);
  wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  fits(path, [320, 640, 768, 930, 1024, 1366]);
 }
 open('/projects');
 wait('Boolean(document.querySelector(".tech-tag-track .tech-tag"))');
 assert.equal(ev(`Array.from(document.querySelectorAll('.tech-tag-track')).every(list =>
  getComputedStyle(list).flexWrap === 'wrap' && Array.from(list.children).every(tag => getComputedStyle(tag).transform === 'none'))`), true);
 screenshot('project-list');
 const audit = JSON.parse(run('a11y', '--selector', '#main', '--json'));
 assert.equal(audit.violations?.length ?? audit.data?.violations?.length, 0);
 console.log('PASS 54 route/viewport combinations and wrapping project tags');
} finally {
 run('close');
}

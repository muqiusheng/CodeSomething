import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {promisify} from 'node:util';

const browserBin = process.env.CS_BROWSER_BIN;
assert.ok(browserBin, 'Set CS_BROWSER_BIN to the agent-browser executable.');
const app = process.env.CS_LOADING_APP_URL || 'http://127.0.0.1:5378';
const backend = process.env.CS_LOADING_BACKEND_URL || 'http://127.0.0.1:5188';
const output = process.env.CS_LOADING_OUTPUT || join(tmpdir(), 'cs-loading-stability-refined');
mkdirSync(output, {recursive:true});
const session = 'cs-loading-stability-' + process.pid;
const run = promisify(execFile);
const browser = async (...args) => (await run(browserBin, ['--session', session, ...args], {windowsHide:true,timeout:30000})).stdout.trim();
const evaluate = async script => JSON.parse(await browser('eval',script));
const wait = selector => browser('wait',selector,'--timeout','8000');
const until = script => browser('wait','--fn',script,'--timeout','8000');
const capture = file => browser('screenshot',join(output,file));
const counts = new Map();
const count = path => counts.get(path) || 0;
const gates = new Map();
const matched = path => [...gates.keys()].find(key => typeof key === 'string' ? key === path : key.test(path));
function hold(key) {
 let release;
 gates.set(key,new Promise(resolve => {release = resolve;}));
 return () => {release();gates.delete(key);};
}
const resumePath = '/api/v1/learning/continue';
const reviewPath = '/api/v1/learner/reviews';
const prefsPath = '/api/v1/profiles/me/preferences';
const usersPath = '/api/v1/admin/users';
const coursePath = '/api/v1/courses/http-json-basics/versions/1.1.0';
const editorAsset = /^\/assets\/editor\.api-.*\.js$/;
let role = null;
let resume = {
 session:{courseId:'sql-foundations',courseVersion:'1.0.0',stageId:'db-model',step:'task',revision:1},
 nextAction:'resume',checksAvailable:true,nextStageId:'db-model',
 progress:{courseId:'sql-foundations',courseVersion:'1.0.0',completions:[],completedCount:0,totalCodeStages:6,projectCompleted:false,nextCodeStage:'db-model'},
};
let preferences = {dailyMinutes:60,motion:'system',revision:1,updatedAt:'2026-11-23T00:00:00Z'};
let resumeFails = false;
let reviewFails = false;
let adminFails = false;
let studentName = 'learner-fixture';
const json = (res,value,status = 200) => {
 res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(value));
};
const server = createServer(async (req,res) => {
 const {pathname,searchParams} = new URL(req.url,app);
 counts.set(pathname,count(pathname)+1);
 const gate = matched(pathname);
 if (gate !== undefined) await gates.get(gate);
 try {
  if (pathname === '/api/v1/auth/config') return json(res,{enabled:!!role,inviteRequired:true});
  if (pathname === '/api/v1/auth/refresh' && role) return json(res,{userId:role,username:role,role,token:'fixture',passwordChangeRequired:false});
  if (pathname === resumePath) return resumeFails ? json(res,{message:'offline'},503) : json(res,resume);
  if (pathname === prefsPath) {
   if (req.method === 'PATCH') {
    const chunks=[];
    for await (const chunk of req) chunks.push(chunk);
    preferences={...preferences,...JSON.parse(Buffer.concat(chunks).toString()),revision:preferences.revision+1};
   }
   return json(res,preferences);
  }
  if (pathname === reviewPath) return reviewFails ? json(res,{message:'offline'},503) : json(res,{items:[],history:[],plan:{revision:0,review_minutes:0,focus_course:''},dailyLimit:5});
  if (pathname === usersPath) return adminFails ? json(res,{message:'offline'},503) : json(res,{
   items:[{id:'fixture-student',username:studentName,email:null,role:'ROLE_STUDENT',status:'active',completed:0}],
   page:Number(searchParams.get('page') || 1),size:10,total:20,
  });
  if (pathname === '/api/v1/admin/jobs') return json(res,{items:[],page:1,size:10,total:0});
  if (pathname.startsWith('/api/') && req.method !== 'GET') return json(res,{},405);
  const upstream = await fetch((pathname.startsWith('/api/') ? backend : app) + req.url);
  res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type') || 'application/octet-stream','cache-control':'no-store'});
  res.end(Buffer.from(await upstream.arrayBuffer()));
 } catch {
  json(res,{message:'Fixture upstream unavailable.'},502);
 }
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const open = path => browser('open',base + path);
const viewport = width => browser('set','viewport',String(width),'900');
const top = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top`);
const noOverflow = async () => assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false);
const adminTable = '[aria-label="用户列表"] table';
const homeTrail = '.home-trail';
const forgetSnapshots = () => evaluate('sessionStorage.clear(); true');
async function go(path, selector) {
 await evaluate(`history.pushState(history.state,'',${JSON.stringify(path)});window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));true`);
 await wait(selector);
}
async function show(selector, targetWidth, theme, filename, scrollTarget) {
 await viewport(targetWidth);
 await evaluate(`document.documentElement.dataset.theme='${theme}';true`);
 await noOverflow();
 await until(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity === '1'`);
 await evaluate(scrollTarget
  ? `document.querySelector(${JSON.stringify(scrollTarget)}).scrollIntoView({block:'center',behavior:'instant'});true`
  : "window.scrollTo({top:0,behavior:'instant'});true");
 await capture(filename);
}

try {
 const shifts = [];
 for (const [width,mode] of [[1440,'light'],[390,'dark'],[320,'light']]) {
  if(shifts.length)await forgetSnapshots();
  await viewport(width);
  const auth = hold('/api/v1/auth/config');
  const continuation = hold(resumePath);
  const reviews = hold(reviewPath);
  const before = count(resumePath);
  await open('/learn');
  await wait('.loading-splash [role=status]');
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(mode)}`);
  await noOverflow();
  const splash = await evaluate(`(() => {
   const card = document.querySelector('.loading-splash').getBoundingClientRect();
   return [card.x+card.width/2-innerWidth/2,card.y+card.height/2-innerHeight/2];
  })()`);
  assert.ok(splash.every(value => Math.abs(value) <= 1),JSON.stringify(splash));
  const contrast = await evaluate(`(() => {
   function luminance(color) {
    const ctx = document.createElement('canvas').getContext('2d',{willReadFrequently:true});
    ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
    return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(value=>value/255)
     .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
     .reduce((sum,value,index)=>sum+[.2126,.7152,.0722][index]*value,0);
   }
   const text=luminance(getComputedStyle(document.querySelector('.loading-splash p')).color);
   const surface=luminance(getComputedStyle(document.querySelector('.access-startup')).backgroundColor);
   return (Math.max(text,surface)+.05)/(Math.min(text,surface)+.05);
  })()`);
  assert.ok(contrast >= 4.5,JSON.stringify({width,mode,contrast}));
  await until("getComputedStyle(document.querySelector('.loading-splash')).opacity === '1'");
  assert.equal(await evaluate("document.querySelector('.loading-splash').matches('.access-panel')"),false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.loading-brand-orbit')).strokeWidth"),'1.5px');
  await capture(`splash-${width}-${mode}.png`);
  auth();
  await wait('.home-hero-loading');
  await noOverflow();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-hero-loading')).animationDelay"),'0.22s');
  await until("getComputedStyle(document.querySelector('.home-hero-loading')).opacity === '1'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-hero-loading .loading-line')).animationName"),'loading-breathe');
  await capture(`home-loading-${width}-${mode}.png`);
  await evaluate("document.documentElement.dataset.motion = 'reduce'");
  assert.equal(await evaluate("document.querySelector('.home-hero-loading').getAnimations({subtree:true}).length"),0);
  const beforeTop = await top(homeTrail);
  continuation();
  reviews();
  await wait('#resume-title');
  assert.equal(await evaluate("document.querySelector('.home-hero pre').textContent.trim().split('\\n').length"),5);
  await wait('.review-entry .home-review-counts strong');
  const shift = (await top(homeTrail)) - beforeTop;
  console.log(`Home cold start ${width}px ${mode}, trail shift ${shift.toFixed(2)}px, splash contrast ${contrast.toFixed(2)}:1`);
  shifts.push({width,shift});
  assert.equal(count(resumePath)-before,1);
 }
 assert.ok(shifts.every(({shift}) => Math.abs(shift) <= 1),JSON.stringify(shifts));

 await viewport(1440);
 const initialTop = await top(homeTrail);
 const beforeFocus = count(resumePath);
 await evaluate(`(() => {
  window.formerHero=document.querySelector('.home-hero');
  for (let i=0;i<8;i++) {window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));}
 })()`);
 assert.equal(await top(homeTrail),initialTop);
 assert.equal(count(resumePath),beforeFocus);
 assert.equal(await evaluate("window.formerHero === document.querySelector('.home-hero')"),true);
 const refreshedResume = hold(resumePath);
 const refreshedReviews = hold(reviewPath);
 const beforeReload=count(resumePath);
 await open('/learn');
 await wait('#resume-title');
 assert.equal(await evaluate("!!document.querySelector('.home-hero-loading')"),false);
 assert.equal(await top(homeTrail),initialTop);
 assert.equal(await evaluate("!!document.querySelector('.review-entry .home-review-counts strong')"),true);
 refreshedResume();
 refreshedReviews();
 assert.equal(count(resumePath),beforeReload+1);
 const chart = '/api/v1/learner/stats';
 const profile = '/api/v1/learner/profile';
 const school = '/api/school/courses';
 const warmRoutes=[['/projects','.project-library'],['/reviews','.review-recommendations'],['/profile','.activity-calendar'],['/school','.school-lab-list a']];
 const geometry=new Map();
 for(const [route,selector] of warmRoutes){
  await go(route,selector);
  geometry.set(route,await top(selector));
 }
 const readPaths=[resumePath,reviewPath,profile,chart,school,prefsPath,'/api/v1/projects/courses',...[...counts.keys()].filter(path=>path.startsWith('/api/v1/learning/progress/'))];
 const beforeNavigation=readPaths.map(count);
 for (const [route,selector] of [['/learn','#resume-title'],...warmRoutes,['/learn','#resume-title']]) {
  await go(route,selector);
  assert.equal(await evaluate("!!document.querySelector('#main .loading-state, #main .home-hero-loading')"),false,route);
  if(geometry.has(route))assert.equal(await top(selector),geometry.get(route),route);
 }
 assert.equal(await top(homeTrail),initialTop);
 assert.deepEqual(readPaths.map(count),beforeNavigation);
 await go('/settings','select[name=duration]');
 await browser('select','select[name=duration]','90');
 await browser('click','#learning button[type=submit]');
 await until("document.querySelector('.header-daily').textContent.includes('90')");
 await go('/learn','#resume-title');
 assert.equal(await evaluate("document.querySelector('.home-daily').textContent.includes('90')"),true);
 assert.equal(count(prefsPath),beforeNavigation[readPaths.indexOf(prefsPath)]+1);
 const revalidation = hold(resumePath);
 resume = {session:null,progress:{completedCount:0,passedPractices:['workspace']}};
 await evaluate("window.formerHero=document.querySelector('.home-hero');window.dispatchEvent(new Event('learning-progress'))");
 assert.equal(await evaluate("window.formerHero === document.querySelector('.home-hero')"),true);
 revalidation();
 await until("document.querySelector('.learning-home-actions a.primary').getAttribute('href') === '/learn/journey/02'");
 assert.equal(await evaluate("window.formerHero === document.querySelector('.home-hero')"),true);
 await go('/projects','.project-library');
 const beforeCompletion=count(resumePath);
 resume={session:null,progress:{completedCount:0,passedPractices:['workspace','workspace-http-text']}};
 await evaluate("window.dispatchEvent(new CustomEvent('learning-progress',{detail:'http-json-basics'}));true");
 await until(`Object.keys(sessionStorage).filter(key=>key.endsWith(':cs-read-snapshots-v1')).some(key=>
  JSON.parse(sessionStorage.getItem(key)).some(([path,value])=>path==='/learning/continue'&&value.progress.passedPractices.includes('workspace-http-text')))`);
 assert.equal(count(resumePath),beforeCompletion+1);
 await go('/learn','#resume-title');
 assert.equal(await evaluate("document.querySelector('.learning-home-actions a.primary').getAttribute('href')"),'/learn/journey/03');
 assert.equal(count(resumePath),beforeCompletion+1);
 for(const [route,selector,paths] of [
  ['/reviews','.review-recommendations',[reviewPath]],
  ['/profile','.activity-calendar',[profile,chart]],
  ['/school','.school-lab-list a',[school]],
 ]){
  const releases=paths.map(hold);
  await open(route);
  await wait(selector);
  assert.equal(await evaluate("!!document.querySelector('#main .loading-state')"),false,route);
  releases.forEach(release=>release());
 }
 await forgetSnapshots();
 resumeFails = reviewFails = true;
 await open('/learn');
 await wait('#resume-error');
 await wait('.review-entry button');
 resumeFails = reviewFails = false;
 await browser('click','#resume-error + .learning-home-actions button');
 await browser('click','.review-entry button');
 await wait('#resume-title');
 await wait('.review-entry .home-review-counts strong');

 const course = hold(coursePath);
 await open('/learn/http-json/1.1/workspace');
 await wait('.loading-state--course');
 await until("getComputedStyle(document.querySelector('.loading-state--course .loading-shapes')).opacity === '1'");
 await show('.loading-state--course .loading-shapes',1440,'light','course-loading-1440-light.png');
 await show('.loading-state--course .loading-shapes',390,'dark','course-loading-390-dark.png');
 await viewport(1440);
 course();
 await wait('.foundation-lesson');
 await open('/school');
 await wait('.school-lab-list a');
 const lab = await evaluate("document.querySelector('.school-lab-list a').getAttribute('href')");
 const editor = hold(editorAsset);
 await open(lab);
 await wait('.editor-loading-overlay');
 await until("getComputedStyle(document.querySelector('.editor-loading-overlay .loading-state')).opacity === '1'");
 assert.equal(await evaluate("document.querySelectorAll('.editor-loading-overlay .loading-line').length"),5);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-loading-overlay .loading-line')).height"),'6px');
 await show('.editor-loading-overlay .loading-state',390,'dark','editor-loading-390-dark.png','.code-editor-area');
 await show('.editor-loading-overlay .loading-state',1440,'light','editor-loading-1440-light.png');
 const editorTop = await top('.code-editor-area');
 const editorHeight = await evaluate("document.querySelector('.code-editor-area').getBoundingClientRect().height");
 await capture('editor-loading.png');
 editor();
 await wait('.monaco-editor');
 await until("!document.querySelector('.editor-loading-overlay')");
 assert.equal(await top('.code-editor-area'),editorTop);
 assert.equal(await evaluate("document.querySelector('.code-editor-area').getBoundingClientRect().height"),editorHeight);

 role = 'ROLE_ADMIN';
 const authRefresh = hold('/api/v1/auth/refresh');
 const admin = hold(usersPath);
 await open('/admin/users?page=2&status=active');
 await wait('.loading-splash');
 await browser('set','media','light','reduced-motion');
 assert.equal(await evaluate("document.querySelector('.loading-splash').getAnimations({subtree:true}).length"),0);
 authRefresh();
 await wait('.admin-main .loading-state--table');
 await capture('admin-table-loading.png');
 await viewport(390);
 await evaluate("document.documentElement.dataset.theme = 'dark'");
 await noOverflow();
 await capture('admin-table-loading-390-dark.png');
 await viewport(320);
 await noOverflow();
 await viewport(1440);
 await evaluate("document.documentElement.dataset.theme = 'light'");
 admin();
 await wait(adminTable);
 const adminTop = await top(adminTable);
 await evaluate(`window.formerRow=document.querySelector('${adminTable} tbody tr'); true`);
 const beforePoll = count(usersPath);
 await evaluate("window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'))");
 assert.equal(await top(adminTable),adminTop);
 assert.equal(count(usersPath),beforePoll);
 adminFails = true;
 await pause(15600);
 assert.ok(count(usersPath)>beforePoll,'Expected the 15-second users poll');
 assert.equal(await evaluate(`window.formerRow === document.querySelector('${adminTable} tbody tr')`),true);
 assert.equal(await top(adminTable),adminTop);
 await evaluate("document.querySelector('.admin-nav a[href=\"/admin/submissions\"]').click()");
 await until("location.pathname === '/admin/submissions'");
 const adminRevalidation = hold(usersPath);
 adminFails = false;
 studentName = 'updated-fixture';
 await evaluate("history.back()");
 await wait(adminTable);
 assert.equal(await top(adminTable),adminTop);
 assert.equal(await evaluate("location.search"),'?page=2&status=active');
 assert.match(await evaluate(`document.querySelector('${adminTable} tbody').textContent`),/learner-fixture/);
 adminRevalidation();
 await browser('wait','--fn',"document.querySelector('.admin-data-table tbody').textContent.includes('updated-fixture')",'--timeout','20000');
 console.log('PASS persisted reload, warm navigation request counts, preferences sync, mounted and background completion refresh, retry, course and Monaco, admin filtered return and polling failure');
} finally {
 gates.clear();
 server.closeAllConnections();
 server.close();
 await browser('close');
}

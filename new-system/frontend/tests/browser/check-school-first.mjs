import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';

const {CS_BROWSER_BIN:bin,CS_SCHOOL_EXAM_APP:app,CS_SCHOOL_EXAM_OUTPUT:output}=process.env;
assert.ok(bin && app && output,'Use an isolated, unauthenticated local instance and specify browser, URL, and output.');
mkdirSync(output,{recursive:true});
const run=promisify(execFile);
const session='school-first-'+process.pid;
const browser=async (...args)=>(await run(bin,['--session',session,...args],{timeout:45000,windowsHide:true})).stdout.trim();
const evaluate=async script=>JSON.parse(await browser('eval',script));
const wait=script=>browser('wait','--fn',script,'--timeout','25000');
const text=label=>wait('document.querySelector("#main")?.innerText.includes('+JSON.stringify(label)+')');
const byRole=(role,name)=>browser('find','role',role,'click','--name',name,'--exact');
const click=selector=>browser('click',selector);
const open=route=>browser('open',app+route);
const shot=name=>browser('screenshot',join(output,name+'.png'));
const workbench='/school/database-systems/lab-06-procedures';
const api='/api/school/courses/database-systems/labs/lab-06-procedures';
const lastQuestion='q07-drop-female';
const solution='.workbench-results-body .exam-feedback > details.school-solution';
const menu='.school-practice-workspace .exam-debug-more summary';
const styles=['左右双礼炮','星光几何彩带','清新绿金','经典多彩纸屑'];
const editor='.sql-practice-editor .monaco-editor [role="textbox"]';
const canvases='window.celebrations';
const ready='!document.querySelector(".sql-practice-run").disabled';
const triggered='document.querySelector(".lab-celebration")!==null';

async function setCode(sql) {
  await browser('wait',editor);
  await browser('focus',editor);
  await browser('press','Control+a');
  await browser('keyboard','inserttext',sql);
  await wait(ready);
}

async function trackCelebrations() {
  await evaluate(`(() => {
    window.celebrations = 0;
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node instanceof HTMLCanvasElement && node.matches('.lab-celebration')) window.celebrations++;
    }))).observe(document.body,{childList:true});
    return true;
  })()`);
}

async function openCelebrations(name) {
  await click(menu);
  await byRole('button','通关彩带 · '+name);
}

async function prepareLab() {
  const get=async (path, body)=>{
    const response=await fetch(app+path,body ? {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    } : undefined);
    assert.equal(response.ok,true,await response.clone().text());
    return response.json();
  };
  const details=await get(api);
  const required=details.lab.questions.filter(question=>!question.optional);
  const drafts={...details.work.drafts};
  let work=details.work;
  assert.notEqual(work.executions[lastQuestion]?.grade?.status,'correct','Start with an unfinished test lab.');
  for(const {id} of required.filter(question=>question.id!==lastQuestion)) {
    if(work.executions[id]?.grade?.status==='correct') continue;
    drafts[id]=(await get(api+'/questions/'+id+'/solution')).referenceSql;
    ({work}=await get(api+'/grade',{revision:work.revision,drafts,questionId:id}));
    assert.equal(work.executions[id]?.grade?.status,'correct',id);
  }
}

try {
  await browser('set','viewport','1440','900');
  await open('/learn');
  await text('课内课程与实验进度');
  assert.equal(await evaluate('document.querySelectorAll(".home-lab-trail li").length'),7);
  assert.equal(await evaluate('document.querySelector(".home-lab-trail [aria-current=step]") !== null'),true);
  assert.equal(await evaluate('document.querySelectorAll(".learning-home-directory .home-directory-icon").length'),3);
  await byRole('button','WHERE 筛选');
  assert.equal(await evaluate('document.querySelectorAll(".sandbox-sql-results tbody tr").length'),2);
  assert.match(await evaluate('document.querySelector(".sandbox-sql [data-active=true]").textContent'),/WHERE Grade/);
  await byRole('button','GROUP BY 分组');
  assert.equal(await evaluate('document.querySelector(".sandbox-sql-results tbody td:last-child").textContent'),'2');
  await byRole('button','ORDER BY 排序');
  assert.equal(await evaluate('document.querySelector(".sandbox-sql-results tbody td:last-child").textContent'),'91');
  await shot('home-desktop');

  assert.equal(await evaluate('document.querySelector("#site-sidebar").dataset.expanded'),'true');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#site-sidebar nav[aria-label=主导航] a")].map(a=>a.innerText)'),['首页','课内实验','复习','我的收藏']);
  await byRole('button','收起侧边栏');
  await browser('reload');
  await wait('document.querySelector("#site-sidebar")?.dataset.expanded==="false"');
  await byRole('button','展开侧边栏');
  await open('/profile');
  await text('累计学习汇总');
  assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").innerText'),'总览');
  await shot('profile-overview');
  await byRole('tab','课内必学');
  await text('课内实验进度');
  await wait('performance.getEntriesByName(location.origin+"/api/v1/learner/profile").length>0');
  const profileRequests=await evaluate('performance.getEntriesByName(location.origin+"/api/v1/learner/profile").length');
  await byRole('tab','课外拓展');
  await text('课外项目关卡');
  assert.equal(await evaluate('performance.getEntriesByName(location.origin+"/api/v1/learner/profile").length'),profileRequests);
  await open('/projects/backend-foundations');
  await wait('!!document.querySelector("#main h1")');
  await open('/projects/sql-foundations');
  await wait('!!document.querySelector("#main h1")');
  await open('/path');
  await text('课外拓展路线');
  await open('/');
  await text('做好考前复习');
  assert.equal(await evaluate('document.querySelector("meta[property^=og][property$=title]").content'), '码起步 · 课内实验与考前复习');
  assert.equal(await evaluate('!!document.querySelector(".landing-hero .landing-lab-preview") && !document.querySelector(".landing-hero #sandbox-title")'),true);
  assert.equal(await evaluate('document.querySelector(".landing-project-details").open'),false);
  await click('.landing-project-details summary');
  assert.equal(await evaluate('document.querySelector(".landing-project-details").open'),true);
  await click('.landing-project-details summary');
  await browser('set','viewport','390','844');
  await shot('landing-mobile');
  await open('/learn');
  await text('课内课程与实验进度');
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth'),true);
  await byRole('button','打开导航');
  await wait('document.querySelector(".mobile-nav-slot").dataset.open==="true"');
  await shot('home-mobile');
  await browser('set','viewport','1440','900');
  await wait('document.querySelector("#site-sidebar").dataset.expanded==="true"');
  console.log('Home, meta, sidebar, optional routes, profile tabs and mobile navigation verified.');

  await open('/school/database-systems/lab-03-single-query?question=q01');
  await browser('wait','.school-lab-data .school-table-disclosure');
  assert.equal(await evaluate('document.querySelectorAll(".workbench-results-body .school-solution").length'),0);
  const heights=await evaluate(`[...document.querySelectorAll('.school-practice-prompt .school-reference-row')].map(node=>Math.round(node.getBoundingClientRect().height))`);
  assert.ok(heights.length >= 3 && Math.max(...heights)-Math.min(...heights)<=1,JSON.stringify(heights));
  await shot('lab-disclosures');
  await trackCelebrations();
  await byRole('button','查看参考答案');
  await byRole('button','填入编辑器试运行');
  await byRole('button','运行并判分');
  await text('正确 · 10/10 分');
  assert.equal(await evaluate(canvases),0);
  await text('查询结果与预期一致');

  await prepareLab();
  await open(workbench);
  await text('必做 14/15');
  await trackCelebrations();
  assert.equal(await evaluate('document.querySelectorAll(".workbench-results-body .school-solution").length'),0);
  await setCode('SELECT 1;');
  await byRole('button','试运行');
  await wait('!!document.querySelector(".exam-debug-result")');
  assert.equal(await evaluate(canvases),0);
  await byRole('button','运行并判分');
  await wait('!!document.querySelector(".exam-feedback")');
  assert.equal(await evaluate(canvases),0);
  await open('/reviews');
  await text('1 道待复习');
  await click('a[href$='+lastQuestion+']');
  await wait('location.search.includes("'+lastQuestion+'")');
  await wait('!!document.querySelector(".exam-feedback")');
  await trackCelebrations();

  assert.equal(await evaluate('document.querySelectorAll(".workbench-results-body .school-solution").length'),1);
  await click(solution+' > summary');
  await browser('wait',solution+' pre');
  await byRole('button','放大查看');
  await byRole('button','填入编辑器试运行');
  await browser('wait','.modal-content');
  assert.equal(await evaluate('!!document.querySelector("dialog[open] .modal-content")'),true);
  await byRole('button','保留当前代码');
  await byRole('button','还原结果区');
  await byRole('button','复制参考 SQL');
  await text('参考 SQL 已复制');
  await byRole('button','查看参考答案');
  await browser('wait','.school-practice-prompt .school-solution-sql');
  await wait(`document.querySelector('.school-practice-prompt .school-solution-sql').innerText === document.querySelector('${solution} .school-solution-sql').innerText`);
  await byRole('button','收起参考答案');
  await byRole('button','填入编辑器试运行');
  await byRole('button','确认填入');
  await shot('lab-reference-answer');

  await openCelebrations('经典多彩纸屑');
  for (const style of styles) {
    const count=await evaluate(canvases);
    await byRole('button',style);
    assert.equal(await evaluate('document.querySelector(".lab-celebration-option[aria-pressed=true]").innerText.trim()'),style);
    await wait(canvases+'==='+String(count+1));
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".lab-celebration")).pointerEvents'),'none');
  }
  await byRole('button','关闭彩带');
  await shot('lab-celebration-styles');
  await wait('!document.querySelector(".lab-celebration")');
  await browser('set','media','light','reduced-motion');
  const previews=await evaluate(canvases);
  await byRole('button','清新绿金');
  assert.equal(await evaluate(canvases),previews);
  await browser('set','media','light');
  await byRole('button','关闭弹窗');
  await click(menu);
  await byRole('button','保存（有未保存修改）');
  await text('草稿已保存');
  await browser('reload');
  await text('必做 14/15');
  await trackCelebrations();
  await openCelebrations('清新绿金');
  assert.equal(await evaluate('document.querySelector(".lab-celebration-option[aria-pressed=true]").innerText.trim()'),'清新绿金');
  await byRole('button','关闭弹窗');
  await byRole('button','运行并判分');
  await wait(triggered);
  await shot('lab-completion-celebration');
  await text('已完成全部必做题（15/15）');
  assert.equal(await evaluate(canvases),1);
  await wait('!document.querySelector(".lab-celebration")');
  await byRole('button','运行并判分');
  await text('已完成全部必做题（15/15）');
  await wait(ready);
  assert.equal(await evaluate(canvases),1);
  await open(workbench+'?question='+lastQuestion);
  await text('已完成全部必做题（15/15）');
  assert.equal(await evaluate(triggered),false);
  await open('/reviews');
  await text('0 道待复习');
  console.log('Reference disclosures, copy/fill, lab mistakes, four previews, off and reduced motion, and formal last-question completion verified.');
} finally {
  await browser('close').catch(()=>{});
}

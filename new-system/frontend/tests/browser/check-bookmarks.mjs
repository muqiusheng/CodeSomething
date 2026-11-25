import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';

const {CS_BROWSER_BIN:bin,CS_BOOKMARK_APP:app,CS_BOOKMARK_OUTPUT:output}=process.env;
assert.ok(bin && app && output,'Use an isolated local instance and specify browser, URL and output.');
mkdirSync(output,{recursive:true});
const run=promisify(execFile);
const session='learner-bookmarks-'+process.pid;
const browser=async (...args)=>(await run(bin,['--session',session,...args],{timeout:45000,windowsHide:true})).stdout.trim();
const evaluate=async script=>JSON.parse(await browser('eval',script));
const wait=script=>browser('wait','--fn',script,'--timeout','20000');
const visible=selector=>browser('wait',selector,'--timeout','20000');
const heading=title=>wait('document.querySelector("#main h1")?.textContent.includes('+JSON.stringify(title)+')');
const byRole=(role,name)=>browser('find','role',role,'click','--name',name,'--exact');
const click=selector=>browser('click',selector);
const open=route=>browser('open',app+route);
const shot=name=>browser('screenshot',join(output,name+'.png'));
const sidebar=expanded=>wait('document.querySelector("#site-sidebar")?.dataset.expanded==="'+expanded+'"');
const course='/school/database-systems';
const lab=course+'/lab-03-single-query?question=q02';
const chapter='/learn/sql/1.0/db-connect';
const exam=course+'/exams/exam-lab-01';
const examApi=exam.replace('/school/','/school/courses/');
const shortcut='.learning-home-directory a[href$=bookmarks]';
const nav='.sidebar a[href$=bookmarks]';
const counts=count=>wait('document.querySelectorAll(".bookmark-record").length==='+count);
const loadedBookmark='.bookmark-button:not(:disabled)';
const recordedBookmark='.bookmark-button[aria-pressed=true]:not([aria-busy=true])';

async function post(path,body) {
  const res=await fetch(app+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(res.ok,true,await res.clone().text());
  return res.json();
}
async function saveBookmark(selector=loadedBookmark) {
  await visible(selector);
  await click(selector);
  await visible(recordedBookmark);
}
async function getBookmarks() {
  const result=await fetch(app+'/api/v1/bookmarks');
  assert.equal(result.ok,true);
  return result.json();
}

try {
  for (const item of await getBookmarks()) {
    if (item.href===lab || item.href===chapter || item.href.startsWith(exam+'?draft=') || item.href.startsWith(course+'/exams/mistakes?question=')) {
      const removed=await fetch(app+'/api/v1/bookmarks/'+item.id,{method:'DELETE'});
      assert.equal(removed.status,204);
    }
  }
  await browser('set','viewport','1440','900');
  await open('/learn');
  await heading('继续学习');
  await visible('.home-explore-steps a');
  assert.equal(await evaluate('document.querySelectorAll(".home-explore-steps li").length'),5);
  assert.equal(await evaluate('document.querySelectorAll(".home-explore-featured a").length'),3);
  assert.equal(await evaluate('document.querySelector(".home-explore").tagName'),'SECTION');
  await visible(shortcut);
  await browser('screenshot',join(output,'home-desktop.png'),'--full');

  await browser('set','viewport','1180','900');
  await sidebar(true);
  await open(lab);
  await sidebar(false);
  await visible('#school-question');
  await byRole('button','展开侧边栏');
  await sidebar(true);
  await saveBookmark('#main '+loadedBookmark);
  assert.equal((await getBookmarks()).find(item=>item.href===lab)?.category,'school');
  await shot('lab-bookmark');
  await click(nav);
  await heading('我的收藏');
  await sidebar(true);
  await counts(1);
  await byRole('link','打开原位置');
  await wait('location.search.includes("q02")');
  await visible('#school-question');
  assert.match(await evaluate('document.getElementById("school-question").textContent'),/修改列标题/);
  await sidebar(false);

  await open(chapter);
  await saveBookmark('#main '+loadedBookmark);
  assert.equal((await getBookmarks()).find(item=>item.href===chapter)?.category,'outside');
  await open('/bookmarks');
  await heading('我的收藏');
  await counts(2);
  await browser('reload');
  await counts(2);
  await byRole('tab','课内必学');
  await counts(1);
  assert.equal(await evaluate('document.querySelector(".bookmark-meta .badge").dataset.category'),'school');
  await byRole('tab','课外拓展');
  await counts(1);
  assert.equal(await evaluate('document.querySelector(".bookmark-meta .badge").dataset.category'),'outside');
  await byRole('link','打开原位置');
  await wait('location.pathname==="'+chapter+'"');
  await visible(recordedBookmark);
  await browser('press','Control+k');
  await byRole('option','我的收藏');
  await heading('我的收藏');
  await counts(2);
  await shot('bookmarks');
  await byRole('tab','课外拓展');
  await counts(1);
  await click('.bookmark-actions button');
  await counts(0);
  await wait('document.querySelector(".bookmark-empty")!==null');
  console.log('Home stages, compact navigation, bookmarks from lab and chapter, categories, persistence, routing and deletion passed.');

  const initial=await post(examApi+'/start',{mode:'practice',shuffle:false,minutes:0});
  const draft=initial.draft.id;
  const question=initial.questions[1].id;
  const draftHref=exam+'?draft='+draft+'&question='+question;
  await open(draftHref);
  await sidebar(false);
  await visible('.exam-question-prompt');
  await saveBookmark('.exam-work-question '+loadedBookmark);
  assert.ok((await getBookmarks()).some(item=>item.href===draftHref));
  await post(examApi+'/drafts/'+draft+'/submit',{revision:0,answers:{},stars:[]});
  await open('/bookmarks');
  await visible('.bookmark-list');
  await click('.bookmark-list a[href$='+question+']');
  await wait('location.pathname.includes("/attempts/")');
  await wait('document.querySelectorAll(".exam-item[open]").length>=2');
  await visible('.exam-bookmark-entry '+recordedBookmark);

  await open(course+'/exams/mistakes?question='+question);
  await visible('.exam-bookmark-entry');
  const openMistake='.exam-bookmark-entry:has(.exam-item[open])';
  await saveBookmark(openMistake+' '+loadedBookmark);
  assert.ok((await getBookmarks()).some(item=>item.href.endsWith('/mistakes?question='+question)));
  await shot('exam-mistake');
  await browser('set','viewport','390','844');
  await open('/bookmarks');
  await heading('我的收藏');
  await visible('.bookmark-record');
  assert.equal(await evaluate('document.documentElement.scrollWidth===innerWidth'),true);
  await shot('bookmarks-mobile');
  console.log('Exam bookmark returned to the exact post-submission report question; mistake bookmarks and mobile layout passed.');
} finally {
  await browser('close').catch(()=>{});
}

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const base=process.env.CS_JOURNEY_QA_URL||'http://127.0.0.1:5208';
const screenshots=process.env.CS_REBUILD_SCREENSHOTS;
const continuation='**/api/v1/learning/continue';
const reviews='**/api/v1/learner/reviews';
const run=(...args)=>{
 const result=spawnSync(process.env.CS_BROWSER_BIN,['--session','cs-learning-rebuild',...args],{encoding:'utf8',windowsHide:true,timeout:35000});
 assert.equal(result.status,0,`${args[0]}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
};
const open=path=>run('open',base+path);
const wait=text=>run('wait','--text',text,'--timeout','12000');
const click=(role,name)=>run('find','role',role,'click','--name',name,'--exact');
const evaluate=code=>JSON.parse(run('eval',code));
const capture=name=>{if(screenshots)run('screenshot',join(screenshots,name));};
const actionHref=()=>evaluate("document.querySelector('.learning-home-actions .primary').getAttribute('href')");

try{
 open('/learn');
 // The previous real runtime test may have added practice passes to the isolated database.
 // Stub this read to exercise the same homepage explicitly for a new learner.
 run('network','route',continuation,'--body',JSON.stringify({session:null,progress:{completedCount:0,passedPractices:[]}}));
 run('reload');
 wait('开始第 1 节');
 assert.equal(actionHref(),'/learn/journey/01');
 assert.equal(evaluate("document.querySelectorAll('#main a.primary').length"),1);
 for(const size of [320,390,768,1024,1440]){
  run('set','viewport',String(size),'960');
  assert.equal(evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  if(size===390)capture('home-mobile.png');
  if(size===1440)capture('home-desktop.png');
 }
 run('focus','.home-example-preview button');
 run('press','Enter');
 assert.equal(evaluate("JSON.parse(document.querySelector('.home-example-response pre').textContent).completed"),true);
 assert.equal(evaluate("document.querySelector('.home-example-task').dataset.completed"),'true');
 click('button','切换到深色模式');
 capture('home-dark.png');
 console.log(run('a11y','--selector','#main'));

 click('link','开始第 1 节');
 wait('让 Java 打印一句话');
 click('link','打开本节工程工作区');
 wait('回到全流程课程');
 open('/learn/journey/17');
 wait('向任务表插入自己的数据');
 open('/learn/journey/web-3?from=41');
 wait('用 fetch 读取你自己的 GET');
 click('link','打开本节工程工作区');
 wait('回到全流程课程');
 open('/learn');
 wait('继续本节实操');
 let target=new URL(actionHref(),base);
 assert.equal(target.pathname,'/learn/http-json/1.1/workspace');
 assert.equal(target.searchParams.get('journey'),'01');
 run('reload');
 wait('继续本节实操');
 assert.equal(new URL(actionHref(),base).searchParams.get('journey'),'01');
 run('network','unroute',continuation);

 // Exercise the actual review route after a browser-level network failure.
 run('network','route',reviews,'--abort');
 evaluate('sessionStorage.clear(); true');
 run('reload');
 wait('复习暂未加载');
 run('network','unroute',reviews);
 click('button','重新加载复习');
 wait('查看复习安排');
 assert.ok(evaluate("!document.querySelector('[aria-labelledby=home-review-title]').textContent.includes('复习暂未加载')"));
 capture('home-resume.png');
 console.log('PASS first action, JSON demo, responsive homepage, preview-safe workspace recovery, and review retry');
}finally{
 run('close');
}

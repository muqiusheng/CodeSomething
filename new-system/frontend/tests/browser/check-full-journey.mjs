import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const base=process.env.CS_JOURNEY_QA_URL||'http://127.0.0.1:5179';
function run(...args){
 const result=spawnSync(process.env.CS_BROWSER_BIN,['--session','cs-full-journey',...args],{encoding:'utf8',windowsHide:true,timeout:35000});
 assert.equal(result.status,0,`${args[0]}: ${result.stdout}${result.stderr}`);
 return result.stdout.trim();
}
const wait=text=>run('wait','--text',text,'--timeout','12000');
const link=name=>run('find','role','link','click','--name',name,'--exact');
const open=path=>run('open',base+path);
const evaluate=code=>JSON.parse(run('eval',code));

try{
 open('/learn');
 wait('查看全部课次');
 link('查看全部课次');
 wait('Java 后端全流程课程');
 assert.equal(evaluate("document.querySelectorAll('.journey-directory a').length"),90);
 link('开始第 1 节');
 wait('让 Java 打印一句话');
 run('find','role','link','click','--name','下一节 · 让浏览器显示你写的文字','--exact');
 wait('展开第一个可运行的 HTTP 示例');
 assert.ok(evaluate(`document.querySelector('.journey-task pre').textContent.includes('public static void main')`));
 link('打开本节工程工作区');
 wait('回到全流程课程');
 assert.ok(evaluate(`document.querySelector('[aria-label="当前全流程课次"]').textContent.includes('TaskServer.java')`));
 link('回到全流程课程');
 wait('让浏览器显示你写的文字');
 open('/learn/journey');
 wait('继续第 2 节');

 open('/learn/journey/web-3?from=41');
 wait('用 fetch 读取你自己的 GET');
 link('打开本节工程工作区');
 wait('回到全流程课程');
 link('回到全流程课程');
 wait('返回主线第 41 节');
 link('返回主线第 41 节');
 wait('补单条 404 和任务列表');
 console.log('PASS home entry, next lesson, exact workspace round trip, resume and elective return');

 const handoffs=[['15','连接并执行第一条 SQL'],['24','用 Boot 做一个熟悉的 GET'],['33','让请求编号成为 SQL 参数'],['51','让会话可以验证、注销和过期'],['62','用 Compose 启动应用和数据库']];
 for(const [id,title] of handoffs){
  open('/learn/journey/'+id);
  wait(title);
  link('打开本节工程工作区');
  wait('回到全流程课程');
  assert.ok(evaluate(`document.querySelector('[aria-label="当前全流程课次"]').textContent.includes(${JSON.stringify(title)})`));
 }
 open('/learn/journey/71');
 wait('在自己的作品里实现陌生改动');
 link('打开作品工作台');
 wait('返回第 71 节');
 console.log('PASS SQL, Boot, JDBC, collaboration, deployment and portfolio handoffs');

 open('/learn/journey');
 wait('Java 后端全流程课程');
 const loaded=evaluate(`(async()=>{
  const base=[...document.querySelectorAll('.journey-directory a')].map(a=>a.pathname);
  const failures=[];
  for(const path of base){
   history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));
   for(let attempt=0;attempt<20;attempt++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const content=document.querySelector('.journey-article .journey-lesson-content');
    const url=content?.querySelector('.journey-actions a')?.href;
    if(url&&new URL(url).searchParams.get('journey')===path.split('/').at(-1))break;
   }
   const page=document.querySelector('.journey-article');
   const url=page?.querySelector('.journey-actions a')?.href;
   if(!page?.querySelector('h1')?.textContent||!page?.querySelector('.journey-file')?.textContent||!page?.querySelector('[aria-label="运行和核对"]')||!page?.querySelector('.journey-result p')?.textContent||!url||new URL(url).searchParams.get('journey')!==path.split('/').at(-1))failures.push(path);
  }
  return {count:base.length,failures};
 })()`);
 assert.deepEqual(loaded,{count:90,failures:[]});
 console.log('PASS all 90 lesson routes render file, instructions, runtime, expected result and exact workspace link');

 open('/learn/journey/02');
 wait('让浏览器显示你写的文字');
 for(const width of [360,768,1280]){
  run('set','viewport',String(width),'900');
  assert.ok(evaluate('document.documentElement.scrollWidth<=innerWidth'),`overflow at ${width}`);
 }
 if(process.env.CS_JOURNEY_SCREENSHOT)run('screenshot',process.env.CS_JOURNEY_SCREENSHOT);
 console.log('PASS lesson layout at 360, 768 and 1280 pixels');
}finally{run('close');}

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const base = process.env.CS_LANDING_URL || 'http://127.0.0.1:5378';
const dev = process.env.CS_LANDING_DEV_URL;
const local = process.env.CS_LANDING_LOCAL_URL;
const bin = process.env.CS_BROWSER_BIN;
const output = process.env.CS_LANDING_OUTPUT;
assert.ok(bin && output, 'Set CS_BROWSER_BIN and CS_LANDING_OUTPUT.');
mkdirSync(output, {recursive: true});
const session = 'cs-public-landing-' + process.pid;
const report = {layouts: [], checks: []};

function browser(...args) {
  const result = spawnSync(bin, ['--session', session, ...args], {encoding: 'utf8', windowsHide: true, timeout: 45000});
  assert.equal(result.status, 0, [args[0], result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}
const evaluate = script => JSON.parse(browser('eval', script));
function go(path, selector) {
  browser('open', base + path);
  browser('wait', selector);
}
function checked(description) { report.checks.push(description); }
const sizes = [[1440,900],[1024,768],[768,1024],[390,844],[320,720]];
const headings = ['为什么这样学','从零到独立作品','编码工作台闭环','常见问题'];

try {
  const response = await fetch(base + '/');
  assert.equal(response.status, 200);
  const raw = await response.text();
  for (const heading of headings) assert.ok(raw.includes(heading), heading);
  assert.match(raw, /<meta name="robots" content="index, follow">/);
  assert.match(raw, /<link rel="canonical" href="https:\/\/try\.maqibu\.online\/">/);
  for (const prop of ['type','title','description','url','locale']) assert.ok(raw.includes('property="og:' + prop + '"'));
  const data = JSON.parse(raw.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data['@graph'].map(entry => entry['@type']), ['WebSite','SoftwareApplication','FAQPage']);
  assert.equal(data['@graph'][2].mainEntity.length, 4);
  for (const script of raw.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!script[1].includes('application/ld+json')) assert.equal(script[2].trim(), '', 'Executable scripts must be external');
  }
  assert.doesNotMatch(raw, /<div id="root"|正在读取登录状态/);
  assert.match(await (await fetch(base + '/app.html')).text(), /noindex, nofollow, noarchive/);
  assert.deepEqual((await (await fetch(base + '/robots.txt')).text()).trim().split(/\r?\n/), [
    'User-agent: *','Allow: /$','Allow: /assets/','Allow: /theme-init.js','Allow: /favicon.svg','Allow: /sitemap.xml','Disallow: /','Sitemap: https://try.maqibu.online/sitemap.xml',
  ]);
  assert.deepEqual((await (await fetch(base + '/sitemap.xml')).text()).match(/<loc>(.*?)<\/loc>/g), ['<loc>https://try.maqibu.online/</loc>']);
  if (dev) {
    assert.match(await (await fetch(dev + '/')).text(), /接口数据沙盒/);
    for (const path of ['/learn','/path','/projects','/school','/reviews','/portfolio','/profile','/settings','/login','/register','/change-password','/admin/overview']) {
      const app = await fetch(dev + path);
      assert.equal(app.status, 200);
      assert.match(await app.text(), /<div id="root"><\/div>/);
    }
  }
  checked('Production HTML, schema, canonical, robots and sitemap; dev SPA routes');

  go('/', '#intro-title');
  const endpoint = new URL(browser('get', 'cdp-url'));
  endpoint.protocol = 'http:';
  endpoint.pathname = '/json/list';
  const targets = await (await fetch(endpoint)).json();
  const target = targets.find(entry => entry.type === 'page' && entry.url === base + '/');
  assert.ok(target, 'Browser CDP target available');
  const cdp = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    cdp.addEventListener('open', resolve, {once: true});
    cdp.addEventListener('error', reject, {once: true});
  });
  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    const onMessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== current) return;
      cdp.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    cdp.addEventListener('message', onMessage);
    cdp.send(JSON.stringify({id: current, method, params}));
  });
  await send('Emulation.setScriptExecutionDisabled', {value: true});
  go('/', '#intro-title');
  browser('click', '#faq summary');
  const disabled = evaluate("(" + (() => ({
    loaded: typeof window.csAppearance,
    heading: document.querySelector('h1').textContent,
    route: document.querySelectorAll('#route li').length,
    faq: document.querySelectorAll('#faq details').length,
    answerVisible: document.querySelector('#faq details').open,
    sandboxDisabled: document.querySelector('[data-status]').disabled,
    exhibits: document.querySelectorAll('.landing-exhibit').length,
    outputs: document.querySelectorAll('.landing-route-output article:not([hidden])').length,
    runDisabled: document.querySelector('#landing-run').disabled,
    resultVisible: getComputedStyle(document.querySelector('.landing-run-result')).visibility,
    assertions: document.querySelectorAll('.landing-assertions li').length,
  })) + ")()");
  assert.deepEqual(disabled, {
    loaded:'undefined',heading:'从零做出可运行的 Java 后端作品',route:5,faq:4,answerVisible:true,sandboxDisabled:true,
    exhibits:4,outputs:5,runDisabled:true,resultVisible:'visible',assertions:3,
  });
  browser('screenshot', '--full', join(output, 'javascript-disabled.png'));
  await send('Emulation.setScriptExecutionDisabled', {value: false});
  cdp.close();
  checked('JavaScript disabled in Chromium, original HTML and native FAQ work');

  go('/', '#intro-title');
  browser('wait', '[data-status="200"]:enabled');
  browser('set','viewport','1440','900');
  browser('click','.landing-theme-toggle');
  assert.equal(evaluate('document.documentElement.dataset.theme'),'dark');
  browser('click', '.landing-appearance summary');
  assert.equal(evaluate('document.querySelector("#landing-palette").options.length'), 9);
  browser('select', '#landing-mode', 'system');
  browser('set', 'media', 'dark');
  assert.equal(evaluate('document.documentElement.dataset.theme'), 'dark');
  browser('press', 'Escape');
  assert.equal(evaluate('document.activeElement.tagName'), 'SUMMARY');
  checked('Independent theme toggle, nine palettes, system mode and keyboard menu dismissal');

  const palettes = evaluate('window.csAppearance.paletteIds');
  const originalMotion = evaluate('document.documentElement.dataset.motion');
  evaluate('document.documentElement.dataset.motion = "reduce"; true');
  report.paletteContrast = [];
  for (const palette of palettes) for (const mode of ['light','dark']) {
    const ratios = evaluate('(' + ((palette, mode) => {
      window.csAppearance.setPalette(palette);
      window.csAppearance.setTheme(mode);
      const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently:true});
      function luminance(color) {
        ctx.clearRect(0,0,1,1);
        ctx.fillStyle = color;
        ctx.fillRect(0,0,1,1);
        return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(n => n / 255)
          .map(n => n <= .04045 ? n / 12.92 : ((n+.055)/1.055)**2.4)
          .reduce((sum,n,i) => sum + n * [.2126,.7152,.0722][i],0);
      }
      const style = selector => getComputedStyle(document.querySelector(selector));
      const pairs = [
        [style('.landing-header .landing-primary').color,style('.landing-header .landing-primary').backgroundColor],
        [style('.landing-close .landing-primary').color,style('.landing-close .landing-primary').backgroundColor],
        [style('.landing-run-status').color,style('.landing-run-console').backgroundColor],
        [style('.landing-editor-code').color,style('.landing-editor-code').backgroundColor],
        [style('.landing-theater .landing-token-string').color,style('.landing-editor-code').backgroundColor],
        [style('.landing-lead').color,style('.landing-intro').backgroundColor],
        [style('#response-body').color,style('.landing-code').backgroundColor],
      ];
      return pairs.map(([fg,bg]) => {
        const [high,low] = [luminance(fg),luminance(bg)].sort((a,b)=>b-a);
        return Number(((high+.05)/(low+.05)).toFixed(2));
      });
    }).toString() + ')(' + JSON.stringify(palette) + ',' + JSON.stringify(mode) + ')');
    const minimum = palette === 'cupcake-synthwave' && mode === 'light' ? 5 : 4.5;
    assert.ok(ratios.every(ratio => ratio >= minimum), JSON.stringify({palette,mode,ratios}));
    report.paletteContrast.push({palette,mode,ratios});
  }
  checked('Contrast across all 18 palette and appearance combinations');

  for (const [palette, mode] of [['emerald','light'],['emerald','dark'],['cupcake-synthwave','dark']]) {
    evaluate("window.csAppearance.setPalette(" + JSON.stringify(palette) + ");window.csAppearance.setTheme(" + JSON.stringify(mode) + ");true");
    for (const [w,h] of sizes) {
      browser('set','viewport',String(w),String(h));
      const layout = evaluate("(" + (() => {
        const colors = (fg,bg) => {
          const ctx = document.createElement('canvas').getContext('2d');
          const rgb = color => {
            ctx.clearRect(0,0,1,1);
            ctx.fillStyle = color;
            ctx.fillRect(0,0,1,1);
            return [...ctx.getImageData(0,0,1,1).data].slice(0,3);
          };
          const luminance = color => rgb(color).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
            .reduce((sum,c,i) => sum + c * [.2126,.7152,.0722][i], 0);
          const order = [luminance(fg),luminance(bg)].sort((a,b) => b-a);
          return Number(((order[0]+.05)/(order[1]+.05)).toFixed(2));
        };
        const css = sel => getComputedStyle(document.querySelector(sel));
        const box = sel => document.querySelector(sel).getBoundingClientRect();
        return {
          width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          header:box('.landing-header').height,touch:box('.landing-header .landing-button').height,
          statusTouch:box('[data-status]').height,
          contrast:[
            colors(css('.landing-header .landing-primary').color,css('.landing-header .landing-primary').backgroundColor),
            colors(css('.landing-lead').color,css('.landing-intro').backgroundColor),
            colors(css('#response-body').color,css('.landing-code').backgroundColor),
            colors(css('.landing-token-string').color,css('.landing-code').backgroundColor),
          ],
        };
      }) + ")()");
      assert.equal(layout.width,w);
      assert.equal(layout.height,h);
      assert.ok(layout.scrollWidth <= w && layout.header <= 60 && layout.touch >= 44, JSON.stringify(layout));
      if (w <= 760) assert.ok(layout.statusTouch >= 44);
      assert.ok(layout.contrast.every(value => value >= 4.5), JSON.stringify(layout));
      const name = palette+'-'+mode+'-'+w;
      report.layouts.push({name,...layout});
      browser('screenshot',join(output,name+'.png'));
      if (name === 'emerald-light-1440' || name === 'cupcake-synthwave-dark-390') {
        browser('screenshot','--full',join(output,name+'-full.png'));
      }
    }
  }

  evaluate('document.documentElement.dataset.motion = ' + JSON.stringify(originalMotion) + '; true');
  browser('set','viewport','390','844');
  browser('click','.landing-appearance summary');
  browser('press','Escape');
  assert.equal(evaluate('document.activeElement.matches(".landing-appearance summary:focus-visible") && getComputedStyle(document.activeElement).outlineOffset === "-3px"'),true);
  evaluate(`document.querySelector('[data-stage="4"]').focus(); true`);
  browser('press','Enter');
  assert.equal(evaluate('document.querySelector(".landing-route").dataset.preview'),'4');
  assert.equal(evaluate('document.querySelector("#stage-output-4").hidden'),false);
  assert.equal(evaluate('document.querySelector("#stage-output-1").hidden'),true);
  assert.equal(evaluate(`(() => {
    const theater=document.querySelector('.landing-theater'), run=document.querySelector('#landing-run');
    run.click();
    return theater.dataset.runState === 'running'
      && theater.querySelector('.landing-run-pipeline li').dataset.phase === 'current'
      && getComputedStyle(theater.querySelector('.landing-run-result')).visibility === 'hidden';
  })()`),true);
  browser('wait','[data-run-state="done"]');
  assert.equal(evaluate('document.querySelector(".landing-run-progress").value'),5);
  assert.equal(evaluate(`document.querySelectorAll('.landing-run-pipeline [data-phase="passed"]').length`),5);
  assert.match(evaluate('document.querySelector(".landing-run-response pre").textContent'),/"completed": false/);
  assert.equal(evaluate(`(() => {
    const signal=document.querySelector('.landing-signal span');
    document.querySelector('[data-status="404"]').click();
    const first=signal.getAnimations()[0];
    document.querySelector('[data-status="500"]').click();
    const second=signal.getAnimations()[0];
    document.querySelector('[data-status="200"]').click();
    return first?.playState === 'idle' && second?.playState === 'idle' && signal.getAnimations().length === 1;
  })()`),true);
  browser('set','media','reduced-motion');
  assert.equal(evaluate('document.querySelector("#landing-run").click();document.querySelector(".landing-theater").dataset.runState'),'done');
  checked('Keyboard stage preview, five-phase run, proof and immediate reduced-motion rerun');
  assert.equal(evaluate('getComputedStyle(document.querySelector(".landing-primary")).transitionDuration'),'0s');
  evaluate(`document.querySelector('[data-status="404"]').scrollIntoView({block:"center"}); true`);
  browser('click','[data-status="404"]');
  assert.equal(evaluate('document.querySelector("#response-status").textContent'),'404 Not Found');
  assert.equal(evaluate('document.querySelector(".landing-signal span").getAnimations().length'),0);
  assert.equal(evaluate('document.querySelector("#task-toggle").hidden'),true);
  browser('click','[data-status="500"]');
  assert.match(evaluate('document.querySelector("#response-body").textContent'),/服务暂时无法读取任务/);
  browser('click','[data-status="200"]');
  evaluate('document.querySelector("#task-toggle").scrollIntoView({block:"center"}); true');
  browser('click','#task-toggle');
  assert.match(evaluate('document.querySelector("#response-body").textContent'),/"completed": true/);
  assert.equal(evaluate('document.querySelector("#task-state").textContent'),'已完成');
  evaluate('document.querySelector("#task-toggle").focus(); true');
  browser('press','Tab');
  assert.equal(evaluate(`(() => {
    const focused = document.activeElement;
    const ring = focused.matches('[data-stage]') ? focused.closest('li') : focused;
    return focused.matches(':focus-visible') && parseFloat(getComputedStyle(ring).outlineWidth) >= 2;
  })()`),true);
  assert.deepEqual(evaluate('performance.getEntriesByType("resource").map(entry=>new URL(entry.name).pathname).filter(path=>path.startsWith("/api/"))'),['/api/v1/auth/session']);
  checked('404/500 simulated error, completion state, visible keyboard focus, reduced motion and session-only API traffic');

  browser('cookies','clear');
  for (const page of ['/learn','/projects','/school','/admin/overview']) {
    go(page, '.access-panel');
    const url = new URL(browser('get', 'url'));
    assert.equal(url.pathname, '/login');
    assert.equal(url.searchParams.get('redirect'),page);
  }
  assert.equal((await fetch(base+'/api/v1/profiles/me/preferences')).status,401);
  go('/register#invite=TEST', '[name=inviteCode]');
  assert.equal(browser('get','value','[name=inviteCode]'),'TEST');
  browser('click','.access-wordmark');
  browser('wait','#intro-title');
  assert.equal(new URL(browser('get','url')).pathname,'/');
  checked('Protected pages and business API, invite fragment autofill and account brand link');

  const password = process.env.CS_LANDING_TEST_ADMIN_PASSWORD;
  if (password) {
    assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname), 'Use disposable accounts on a local backend.');
    const api = async (path, body, token) => {
      const headers = {'Content-Type':'application/json'};
      if (token) headers.Authorization = 'Bearer ' + token;
      const result = await fetch(base + '/api/v1/' + path, {method:'POST',headers,body:JSON.stringify(body)});
      assert.equal(result.status,200,path);
      return result.json();
    };
    const admin = await api('auth/login',{username:'admin',password});
    const {code} = await api('admin/invitations',{maxUses:1,hours:1},admin.token);
    const username = 'landing_qa_' + Date.now();
    const studentPassword = 'Landing-Isolated-Student-92';
    await api('auth/register',{username,email:username+'@example.test',inviteCode:code,password:studentPassword});
    function login(redirect, name, secret, destination, selector, landingTarget) {
      browser('cookies','clear');
      go('/login?redirect='+encodeURIComponent(redirect),'.access-panel');
      browser('fill','[name=username]',name);
      browser('fill','[name=password]',secret);
      browser('click','form button[type=submit]');
      browser('wait',selector);
      assert.equal(new URL(browser('get','url')).pathname,destination);
      go('/', '.landing-header [data-register][href="'+landingTarget+'"]');
      assert.equal(new URL(browser('get','url')).pathname,'/');
    }
    login('/projects',username,studentPassword,'/projects','.topbar','/learn');
    login('/',username,studentPassword,'/learn','.home-hero','/learn');
    login('/','admin',password,'/admin/overview','.admin-header','/admin/overview');
    checked('Real isolated accounts, login redirect to project and role defaults, member CTAs on public page');
  }
  if (local) {
    browser('open',local+'/');
    browser('wait','.landing-header [data-register][href="/learn"]');
    assert.equal(new URL(browser('get','url')).pathname,'/');
    assert.deepEqual(await (await fetch(local+'/api/v1/auth/session')).json(), {enabled:false});
    checked('Local no-login mode links to the workspace while keeping the public page open');
  }
} finally {
  writeFileSync(join(output,'browser-results.json'),JSON.stringify(report,null,2)+'\n');
  browser('close');
}

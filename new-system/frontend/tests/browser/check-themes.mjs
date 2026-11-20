import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const bin = process.env.CS_BROWSER_BIN;
if (!bin) throw new Error('Set CS_BROWSER_BIN to agent-browser executable.');
const session = 'cs-themes-qa-1112';
const base = 'http://127.0.0.1:5178';
const out = path.resolve('../docs/acceptance/palette-refresh');
fs.mkdirSync(out, {recursive: true});
const report = {layout: [], accessibility: [], interactions: [], errors: []};
function run(...args) {
  const result = spawnSync(bin, ['--session', session, ...args], {encoding: 'utf8', windowsHide: true, timeout: 30000});
  if (result.status !== 0) throw new Error(`${args.join(' ')}: ${result.stdout} ${result.stderr}`);
  return result.stdout.trim();
}
function evaluate(code) {
  const result = spawnSync(bin, ['--session', session, 'eval', '--stdin'], {input: code, encoding: 'utf8', windowsHide: true, timeout: 30000});
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
function assert(pass, description) {
  report.interactions.push({description, pass: !!pass});
  if (!pass) report.errors.push(description);
}
function open(route) {run('open', base + route); run('wait', '200');}
function screenshot(name) {run('screenshot', path.join(out, name + '.png'));}
function theme(value) {
  const current = evaluate('document.documentElement.dataset.theme');
  if (current !== value) run('find', 'role', 'button', 'click', '--name', value === 'dark' ? '切换到深色模式' : '切换到浅色模式');
  run('wait', '200');
}
function audit(name) {
  const result = JSON.parse(run('a11y', '--tags', 'wcag2a,wcag2aa', '--json'));
  fs.writeFileSync(path.join(out, `axe-${name}.json`), JSON.stringify(result, null, 2));
  report.accessibility.push({name, counts: result.data?.counts, violations: result.data?.violations, incomplete: result.data?.incomplete});
  if (!result.success || result.data.counts.violations) report.errors.push(`Accessibility: ${name}`);
}
try {
  run('set', 'viewport', '1440', '1000');
  open('/learn');
  // These checks use real read APIs. Automatic position writes are intercepted;
  // no check, answer, AI request or database preference is submitted.
  run('network', 'route', '**/api/v1/learning/sessions/local', '--body', '{"id":"appearance-preview","revision":0}');
  const courses = {};
  for (const name of ['boot-foundations', 'task-manager']) {
    const response = await fetch(`${base}/api/v1/courses/${name}/versions/1.0.0`);
    courses[name] = (await response.json()).chapters[0].stageId;
  }
  const pages = {
    home: '/learn', projects: '/projects', path: '/path', reviews: '/reviews', portfolio: '/portfolio', profile: '/profile', settings: '/settings',
    foundation: '/projects/backend-foundations', sqlProject: '/projects/sql-foundations', bootProject: '/projects/boot-foundations', taskProject: '/projects/task-manager',
    lesson: '/learn/http-json/1.1/json', task: '/learn/http-json/1.1/run-server?tab=' + encodeURIComponent('任务'),
    sql: '/learn/sql/1.0/db-connect', boot: '/learn/boot-foundations/1.0/' + courses['boot-foundations'], projectTask: '/learn/task-manager/1.0/' + courses['task-manager'],
  };
  for (const mode of ['light', 'dark']) {
    open('/learn'); theme(mode);
    for (const [name, route] of Object.entries(pages)) {
      open(route);
      const title = evaluate('document.querySelector("main h1")?.textContent');
      assert(!!title && !/不存在|尚未发布/.test(title), `${mode}: ${name} renders real content`);
      for (const width of [320, 375, 768, 1024, 1440]) {
        run('set', 'viewport', String(width), '1000');
        const layout = evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme})`);
        const pass = layout.scrollWidth <= layout.width + 1 && layout.theme === mode;
        report.layout.push({mode, name, ...layout, pass});
        if (!pass) report.errors.push(`Layout: ${mode} ${name} ${width}`);
      }
      if (['home','projects','lesson','settings'].includes(name)) screenshot(`${mode === 'light' ? 'cupcake' : 'synthwave'}-${name}`);
      if (['home','projects','lesson','task','settings','sql','boot'].includes(name)) audit(`${mode}-${name}`);
    }
    open('/learn');
    run('find', 'role', 'button', 'click', '--name', '切换示例任务的完成状态');
    assert(evaluate('document.querySelector(".home-code-toggle").getAttribute("aria-pressed")==="true"'), `${mode}: example interaction works`);
    run('find', 'role', 'button', 'click', '--name', '快捷导航');
    assert(evaluate('!!document.querySelector("[role=dialog]")'), `${mode}: command modal opens`);
    audit(`${mode}-dialog`);
    run('press', 'Escape');
    assert(evaluate('document.activeElement?.classList.contains("quick-trigger")'), `${mode}: modal restores focus`);
    run('set', 'viewport', '375', '1000');
    screenshot(`${mode === 'light' ? 'cupcake' : 'synthwave'}-home-mobile`);
    run('find', 'role', 'button', 'click', '--name', '打开导航');
    assert(evaluate('document.querySelector(".sidebar").contains(document.activeElement)'), `${mode}: mobile navigation receives focus`);
    run('press', 'Escape');
    assert(evaluate('document.activeElement.classList.contains("mobile-menu")'), `${mode}: mobile navigation restores focus`);
    open('/settings'); screenshot(`${mode === 'light' ? 'cupcake' : 'synthwave'}-settings-mobile`);
    run('set', 'viewport', '1440', '1000');
  }
  open('/settings');
  run('check', '.theme-option input[value=light]');
  assert(evaluate('document.documentElement.dataset.theme==="light" && localStorage.getItem("cs-theme")==="light"'), 'Settings light preference applies and persists');
  run('press', 'ArrowRight');
  assert(evaluate('document.documentElement.dataset.theme==="dark" && document.querySelector("input[value=dark]").checked'), 'Native radio keyboard switches theme');
  run('reload'); run('wait', '200');
  assert(evaluate('document.documentElement.dataset.theme==="dark"'), 'Dark preference survives refresh');
  run('check', '.theme-option input[value=system]');
  run('set', 'media', 'light');
  assert(evaluate('document.documentElement.dataset.theme==="light"'), 'Follow system responds to light');
  run('set', 'media', 'dark');
  assert(evaluate('document.documentElement.dataset.theme==="dark"'), 'Follow system responds to dark');
  run('check', '.theme-option input[value=light]');
  run('set', 'media', 'dark');
  assert(evaluate('document.documentElement.dataset.theme==="light"'), 'Explicit preference ignores OS appearance');
  evaluate(`Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')}; true`);
  run('find', 'role', 'button', 'click', '--name', '切换到深色模式');
  assert(evaluate('document.documentElement.dataset.theme==="dark"'), 'Theme remains usable with storage blocked');
  open('/learn');
  assert(evaluate('document.documentElement.dataset.theme==="light"'), 'Blocked storage did not overwrite saved preference');
  console.log(JSON.stringify({layouts:report.layout.length,audits:report.accessibility.length,interactions:report.interactions.length,errors:report.errors},null,2));
} catch(error) {report.errors.push(String(error)); console.error(error);} finally {
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));
  run('close');
}
if(report.errors.length) process.exitCode=1;

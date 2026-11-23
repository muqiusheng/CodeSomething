import {paletteDetails, type PaletteId} from '../../theme/palettes';

const appearance = window.csAppearance;
const menu = document.querySelector<HTMLDetailsElement>('.landing-appearance')!;
const menuTrigger = menu.querySelector('summary')!;
const themeToggle = document.querySelector<HTMLButtonElement>('.landing-theme-toggle')!;
const mode = document.querySelector<HTMLSelectElement>('#landing-mode')!;
const palette = document.querySelector<HTMLSelectElement>('#landing-palette')!;
const compact = matchMedia('(max-width:940px)');
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
const reduceMotion = () => motionMedia.matches || document.documentElement.dataset.motion === 'reduce';
for (const id of appearance.paletteIds) {
  palette.add(new Option(paletteDetails[id].name, id));
}
function syncAppearance() {
  const snapshot = appearance.getSnapshot();
  mode.value = snapshot.preference;
  palette.value = snapshot.palette;
  themeToggle.setAttribute('aria-label', snapshot.resolved === 'dark' ? '切换到浅色显示' : '切换到深色显示');
}
function syncMenuLabel() {
  const label = compact.matches ? '页面菜单与外观' : '选择配色与显示模式';
  menuTrigger.setAttribute('aria-label', label);
  menuTrigger.title = label;
}
function syncMotion() {
  try { document.documentElement.dataset.motion = localStorage.getItem('cs-motion') || 'system'; }
  catch { /* The system media query remains available. */ }
}
syncAppearance();
syncMotion();
syncMenuLabel();
compact.addEventListener('change', syncMenuLabel);
appearance.subscribe(syncAppearance);
themeToggle.addEventListener('click', () => appearance.setTheme(appearance.getSnapshot().resolved === 'dark' ? 'light' : 'dark'));
themeToggle.hidden = false;
mode.addEventListener('change', () => appearance.setTheme(mode.value as 'light' | 'dark' | 'system'));
palette.addEventListener('change', () => appearance.setPalette(palette.value as PaletteId));
menu.querySelector('nav')?.addEventListener('click', event => {
  if (event.target instanceof HTMLAnchorElement) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary')?.focus();
  }
});
document.addEventListener('click', event => {
  if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
});
menu.querySelector<HTMLElement>('[data-appearance]')!.hidden = false;

const statusButtons = document.querySelectorAll<HTMLButtonElement>('[data-status]');
const responseStatus = document.querySelector<HTMLElement>('#response-status')!;
const responseBody = document.querySelector<HTMLElement>('#response-body')!;
const task = document.querySelector<HTMLElement>('.landing-task')!;
const taskTitle = document.querySelector<HTMLElement>('#task-title')!;
const taskState = document.querySelector<HTMLElement>('#task-state')!;
const taskIcon = document.querySelector<HTMLElement>('#task-icon')!;
const toggle = document.querySelector<HTMLButtonElement>('#task-toggle')!;
const signal = document.querySelector<HTMLElement>('.landing-signal span')!;
const responsePanel = responseBody.closest('.landing-code')!;
const taskPanel = task.closest('.landing-task-preview')!;
const taskName = '学习制作任务接口';
const errors = {
  '404': {label: '404 Not Found', message: '未找到这条任务'},
  '500': {label: '500 Internal Server Error', message: '服务暂时无法读取任务'},
};

let status = '200';
let completed = false;
let feedback: Animation[] = [];
function pulseSandbox() {
  feedback.forEach(animation => animation.cancel());
  if (reduceMotion()) return;
  const timing = {duration: 260, easing: 'ease-out'};
  feedback = [
    signal.animate([{translate: '-100% 0', opacity: .15}, {opacity: 1, offset: .4}, {translate: '335% 0', opacity: 0}], timing),
    ...[responsePanel, taskPanel].map(panel => panel.animate([
      {outline: '2px solid transparent', outlineOffset: '-2px'},
      {outlineColor: 'var(--landing-pulse)', offset: .35},
      {outline: '2px solid transparent', outlineOffset: '-2px'},
    ], timing)),
  ];
}
function renderSandbox() {
  const error = errors[status as keyof typeof errors];
  const body = error ? {error: error.message} : {id: 1, title: taskName, completed};
  const rows = Object.entries(body);
  statusButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.status === status));
  });
  responseStatus.textContent = error?.label || '200 OK';
  responseBody.replaceChildren('{\n');
  rows.forEach(([key, value], index) => {
    const token = document.createElement('span');
    token.className = typeof value === 'string' ? 'landing-token-string' : 'landing-token-value';
    token.textContent = JSON.stringify(value);
    responseBody.append('  ' + JSON.stringify(key) + ': ', token, index === rows.length - 1 ? '\n' : ',\n');
  });
  responseBody.append('}');
  task.dataset.completed = String(!error && completed);
  task.dataset.error = String(Boolean(error));
  taskIcon.textContent = error ? '!' : completed ? '✓' : '';
  taskTitle.textContent = error?.message || taskName;
  taskState.textContent = error ? responseStatus.textContent : completed ? '已完成' : '待完成';
  toggle.hidden = Boolean(error);
  toggle.setAttribute('aria-pressed', String(completed));
  pulseSandbox();
}
statusButtons.forEach(button => {
  button.disabled = false;
  button.addEventListener('click', () => {
    status = button.dataset.status!;
    renderSandbox();
  });
});
toggle.disabled = false;
toggle.addEventListener('click', () => {
  completed = !completed;
  renderSandbox();
});

const route = document.querySelector<HTMLOListElement>('.landing-route')!;
const stageButtons = [...route.querySelectorAll<HTMLButtonElement>('[data-stage]')];
const stageOutputs = [...document.querySelectorAll<HTMLElement>('.landing-route-output article')];
function previewStage(selected: HTMLButtonElement) {
  route.dataset.preview = selected.dataset.stage;
  stageButtons.forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
  stageOutputs.forEach(output => {
    output.hidden = output.id !== selected.getAttribute('aria-controls');
  });
}
previewStage(stageButtons[0]);
stageButtons.forEach(button => {
  button.disabled = false;
  button.addEventListener('click', () => previewStage(button));
});

const theater = document.querySelector<HTMLElement>('.landing-theater')!;
const run = document.querySelector<HTMLButtonElement>('#landing-run')!;
const runLabel = run.querySelector('span')!;
const phases = [...theater.querySelectorAll<HTMLElement>('.landing-run-pipeline li')];
const runStatus = theater.querySelector<HTMLElement>('.landing-run-status')!;
const runProgress = theater.querySelector<HTMLProgressElement>('.landing-run-progress')!;
const assertions = [...theater.querySelectorAll<HTMLElement>('.landing-assertions li')];
const runResponse = theater.querySelector<HTMLElement>('.landing-run-response')!;
let runTimer: number | undefined;
let runAnimation: Animation[] = [];
function finishRun() {
  clearTimeout(runTimer);
  phases.forEach(phase => { phase.dataset.phase = 'passed'; });
  runProgress.value = phases.length;
  theater.dataset.runState = 'done';
  runLabel.textContent = '运行并检查';
  runStatus.textContent = '检查全部通过';
  if (reduceMotion()) return;
  runAnimation = [...assertions, runResponse].map((element, index) => element.animate(
    [{opacity: .35, transform: 'translateY(3px)'}, {opacity: 1, transform: 'none'}],
    {duration: 125, delay: index * 45, fill: 'backwards', easing: 'ease-out'},
  ));
}
function runPhase(index: number) {
  if (index === phases.length || reduceMotion()) {
    finishRun();
    return;
  }
  phases.forEach((phase, position) => {
    phase.dataset.phase = position < index ? 'passed' : position === index ? 'current' : 'queued';
  });
  runProgress.value = index;
  runTimer = window.setTimeout(() => runPhase(index + 1), 220);
}
run.disabled = false;
run.addEventListener('click', () => {
  clearTimeout(runTimer);
  runAnimation.forEach(animation => animation.cancel());
  theater.dataset.runState = 'running';
  runLabel.textContent = '重新运行';
  runStatus.textContent = '正在演示检查流程…';
  runPhase(0);
});

const entranceAnimations: Animation[] = [];
if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      reveal.unobserve(entry.target);
      if (reduceMotion()) continue;
      entranceAnimations.push(entry.target.animate(
        [{opacity: .86, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}],
        {duration: 260, easing: 'ease-out'},
      ));
    }
  });
  document.querySelectorAll('.landing-hero,.landing-section,.landing-close').forEach(section => reveal.observe(section));
}
function applyMotionPreference() {
  if (!reduceMotion()) return;
  [...feedback, ...runAnimation, ...entranceAnimations].forEach(animation => animation.cancel());
  if (theater.dataset.runState === 'running') finishRun();
}
motionMedia.addEventListener('change', applyMotionPreference);

async function updateAccessLinks() {
  try {
    const response = await fetch('/api/v1/auth/session', {cache: 'no-store', signal: AbortSignal.timeout(4000)});
    if (!response.ok) return;
    const {enabled, role} = await response.json();
    const admin = enabled === true && role === 'ROLE_ADMIN';
    const learner = enabled === false || (enabled === true && role === 'ROLE_STUDENT');
    document.querySelectorAll<HTMLElement>('[data-access-actions]').forEach(group => {
      const primary = group.querySelector<HTMLAnchorElement>('[data-register]')!;
      const secondary = group.querySelector<HTMLAnchorElement>('[data-login]')!;
      const member = admin || learner;
      primary.href = admin ? '/admin/overview' : learner ? '/learn' : '/register';
      primary.textContent = admin ? '进入管理控制台' : learner ? '进入学习工作台' : '凭邀请码注册';
      if (member && document.activeElement === secondary) primary.focus({preventScroll: true});
      secondary.hidden = member;
    });
    document.querySelector<HTMLElement>('.landing-access-note')!.hidden = admin || learner;
  } catch { /* Visitors can still use the login and registration links. */ }
}
void updateAccessLinks();
window.addEventListener('pageshow', event => {
  if (event.persisted) void updateAccessLinks();
});
window.addEventListener('storage', event => {
  if (event.key === 'codesomething-auth-session') void updateAccessLinks();
  if (event.key === 'cs-motion' || event.key === null) {
    syncMotion();
    applyMotionPreference();
  }
});

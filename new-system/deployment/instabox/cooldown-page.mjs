import {serviceHoursMessage} from './service-hours.mjs';

const brand = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#076f54"/><path fill="white" d="M26 15 11 30l12 12 5.5-5.5L22 30l9.5-9.5Z"/><path fill="#a7f3d0" d="M38 49 53 34 41 22l-5.5 5.5L42 34l-9.5 9.5Z"/></svg>';
const scenes = {
    lunch: ['午间小憩', '机房午休中', 'sun'],
    dinner: ['傍晚充能', '服务器正在吃晚饭', 'cup'],
    night: ['深夜休眠', 'JVM 和 MySQL 都睡着了', 'moon'],
};
const icons = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a8.8 8.8 0 1 0 11 11Z"/>',
    cup: '<path d="M4 9h13v5a6.5 6.5 0 0 1-13 0Zm13 1h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2M3 21h17"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 0-2-5M4 16h8a3 3 0 1 1-3 3"/>',
    plug: '<path d="M7 3v5m8-5v5M5 8h12v2a6 6 0 0 1-12 0Zm6 8v2a3 3 0 0 0 3 3h5"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    down: '<path d="M12 4v15m-6-6 6 6 6-6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    book: '<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1Zm9 1v14"/>',
    chip: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3m-6 14v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
    bulb: '<path d="M9 17c0-3-4-4-4-8a7 7 0 0 1 14 0c0 4-4 5-4 8Zm1 4h4"/>',
};
function icon(name) {
    return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#i-${name}"/></svg>`;
}
const iconSheet = Object.entries(icons).map(([name, paths]) => `<g id="i-${name}">${paths}</g>`).join('');

// A little isometric server with a CRT face, a side vent and a coffee mug.
const machine = `<svg class="machine" role="img" aria-label="薄荷绿色的小机箱眯着眼睛，旁边放着一杯咖啡" viewBox="0 0 340 190">
<g stroke-linejoin="round" stroke-linecap="round">
<ellipse cx="169" cy="166" rx="105" ry="12" fill="#082f2b" opacity=".5"/>
<g stroke="#153e38" stroke-width="3">
<path d="m89 142 106 13 39-21-107-13Z" fill="#d1edbb"/><path d="m89 142 106 13v14L89 156Z" fill="#94c79d"/><path d="m195 155 39-21v14l-39 21Z" fill="#5d9584"/>
<path d="m97 57 106 12 32-18-105-11Z" fill="#def3c7"/><path d="m97 57 106 12v79l-106-13Z" fill="#a6d4aa"/><path d="m203 69 32-18v78l-32 19Z" fill="#699e8b"/>
<path d="m105 68 89 10v52l-89-10Z" fill="#689584"/><path d="m110 72 79 9v43l-79-9Z" fill="#183e39"/>
<path d="m120 55 62 7m-50-10 61 7m-49-10 61 7" stroke-width="2" stroke="#85b598"/>
<path d="m213 84 13-7m-13 13 13-7m-13 13 13-7m-13 13 13-7" stroke-width="2"/>
<path d="m111 128 21 2m4 1 7 1"/><path d="m174 137 10 1" stroke="#e0ed81" stroke-width="4"/>
</g>
<g stroke="#abeabd" stroke-width="3.5" fill="none"><path d="m122 92 7 4 7-3m24 3 7 4 7-3m-33 9q5 7 12 1"/></g>
<path d="m118 103 7 1m48 4 7 1" stroke="#72b89c" stroke-width="3"/>
<g stroke="#153e38" stroke-width="2.5"><path d="m240 135 21 3 10-5-21-3Z" fill="#f9e6ab"/><path d="m240 135 21 3v17l-21-3Z" fill="#dfc480"/><path d="m261 138 10-5v17l-10 5Z" fill="#a69264"/><path d="m271 137 5-2v7l-5 3" fill="none"/></g>
<path d="M250 126q-7-5-2-10m8 7q-4-4-1-8" fill="none" stroke="#a2cabc" stroke-width="2"/>
<g fill="none" stroke="#9dd9ae" opacity=".85" stroke-width="2"><path d="m69 81 5-1m-1-10 5 3m-1 17 4-3M247 55l4-5m1 12 6-2"/></g>
</g></svg>`;

const tips = [
    'WHERE 先筛行，HAVING 再筛分组。', 'COUNT(*) 会数行，COUNT(列) 会跳过 NULL。',
    '判断空值要写 IS NULL。', 'LEFT JOIN 会保留左表里没有匹配的行。',
    '没有 ORDER BY，结果行的顺序没有保证。', 'Java 字符串比内容，用 equals()。',
    '数组的第一个下标是 0，最后一个是 length − 1。', '事务的原子性要求一组操作要么全做，要么全撤。',
    'SQL 中 AND 比 OR 先算，拿不准就加括号。', 'SELECT DISTINCT 会去掉结果中重复的行。',
    'HTTP 404 是没找到资源，503 是服务暂不可用。', '普通索引能帮助查找，也会增加写入维护成本。',
    '写完 GROUP BY，记得检查 SELECT 里的非聚合列。', '今天的慢查询说：我只是想把全表看一遍。',
    '程序员的午觉也有断点，名字叫闹钟。', '连接池今天去游泳了，回来记得归还连接。',
    'Java 的 int 做整数除法，5 / 2 得到 2。', '数据库里的 NULL 表示未知，两个未知也不能直接画等号。',
];

// Prompt, four options, zero-based answer, explanation.
const questions = [
    ['分组前筛掉成绩低于 60 的记录，用哪个子句？', ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], 0, 'WHERE 在分组前逐行筛选。'],
    ['只保留平均分大于 80 的班级，用哪个子句？', ['DISTINCT', 'HAVING', 'WHERE', 'LIMIT'], 1, 'HAVING 可以按 AVG 等聚合结果筛选分组。'],
    ['学生 LEFT JOIN 成绩，没成绩的学生会怎样？', ['被删除', '分数自动为 0', '保留，成绩列为 NULL', '查询报错'], 2, '左连接保留左表行，右表没有匹配时填 NULL。'],
    ['三行分数分别为 60、NULL、90，COUNT(分数) 是多少？', ['0', '1', '3', '2'], 3, 'COUNT(列) 只计入该列非 NULL 的行。'],
    ['转账的扣款和入账要么都成功，要么都撤销，体现什么？', ['隔离性', '原子性', '持久性', '唯一性'], 1, '原子性把事务中的操作视作一个整体。'],
    ['事务提交后，即使重启也能保留结果，体现什么？', ['持久性', '隔离性', '原子性', '排序性'], 0, '持久性要求已提交的结果能在故障恢复后保留。'],
    ['给经常查询的列建普通索引，通常有什么代价？', ['查询必定变慢', '数据无法更新', '每列必须唯一', '写入时要维护索引'], 3, '修改相关数据时，数据库还要更新索引结构。'],
    ['只有学号是候选键，学号 → 系号 → 系名，违反哪一范式？', ['第一范式', '第二范式', '第三范式', '没有违反'], 2, '非主属性系名通过系号传递依赖于学号，违反第三范式。'],
    ['以下哪组符合 SQL 的逻辑处理顺序？', ['SELECT → FROM → WHERE', 'FROM → WHERE → GROUP BY', 'HAVING → WHERE → FROM', 'ORDER BY → SELECT → FROM'], 1, '先确定来源，再筛选行，随后分组。'],
    ['找出尚未填写邮箱的学生，应写什么条件？', ['email = 0', "email = ''", 'email = NULL', 'email IS NULL'], 3, '字段用 NULL 表示缺失时，要用 IS NULL 判断。'],
    ['Java 中比较两个非空 String 的文字内容，用什么？', ['equals()', '==', 'length()', 'hashCode()'], 0, 'String.equals() 比较字符内容，== 比较引用。'],
    ['Java 表达式 7 / 2 的结果是多少？', ['3.5', '4', '3', '2'], 2, '两个整数相除时，整数结果向零截断。'],
    ['Java 中 int[] a = new int[3] 的最后一个有效下标是？', ['3', '2', '1', '4'], 1, '长度为 3 的数组下标从 0 到 2。'],
    ['HTTP 哪个状态码表示服务暂时不可用？', ['200', '404', '301', '503'], 3, '503 表示服务暂时无法处理请求，可用 Retry-After 提示重试时间。'],
    ['HTTP 201 通常代表什么？', ['资源已创建', '需要身份认证', '请求有冲突', '服务器超时'], 0, '201 Created 表示请求成功，并创建了资源。'],
    ['数据库事务中的 I（Isolation）指什么？', ['数据按主键排序', '写入后不能删除', '并发事务之间的隔离', '必须只读'], 2, '隔离性约束并发事务可以看到彼此的哪些操作结果。'],
];

const styles = `
:root {
    color-scheme:light dark;
    --bg:light-dark(#f2f5ee,#101915); --card:light-dark(#fdfefa,#19241e);
    --ink:light-dark(#192d24,#eff5ec); --muted:light-dark(#52645a,#b1c2b6);
    --line:light-dark(#d6e0d4,#3a4b40); --soft:light-dark(#eef3eb,#25342a);
    --green:light-dark(#076f54,#34d399); --tint:light-dark(#dcefe3,#203d31);
    --hot:light-dark(#945027,#ffc180); --hot-bg:light-dark(#faeedc,#403024);
    --mono:ui-monospace,Consolas,"Liberation Mono",monospace;
}
:root[data-theme=light]{color-scheme:light} :root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box} [hidden]{display:none!important}
body{margin:0;color:var(--ink);background:var(--bg);font:15px/1.55 system-ui,"Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,p,figure{margin:0} h1,h2{text-wrap:balance;line-height:1.25}
button,a{font:inherit;color:inherit} button{cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:9px 13px;font-weight:600}
button:enabled:hover{border-color:var(--green);color:var(--green)} button:enabled:active{transform:scale(.97)}
button:disabled{cursor:default} :focus-visible{outline:3px solid var(--green);outline-offset:3px}
.icon{width:18px;height:18px;flex:none;display:inline-block;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.wrap{width:min(1160px,calc(100% - 64px));margin-inline:auto}
header{border-bottom:1px solid var(--line);background:var(--card)}
nav,.row,.brand,.inline,.actions,.tabs,.action,.legend{display:flex;align-items:center}
nav,.row{justify-content:space-between;gap:12px} nav{height:74px}
.brand{gap:10px;font-size:21px;font-weight:750;letter-spacing:-.04em}.brand img{width:35px;height:35px}
.brand small{margin-left:4px;padding-left:15px;border-left:1px solid var(--line);font-weight:500;font-size:14px;letter-spacing:0;color:var(--muted)}
.inline{gap:8px}.mono,time,output{font-family:var(--mono);font-variant-numeric:tabular-nums}
.nav-clock{color:var(--muted);margin-right:13px;font-size:13px}#theme{height:42px;width:42px;padding:0;border-radius:50%}
main{display:grid;grid-template-columns:minmax(0,1.17fr) minmax(0,1fr);gap:22px;padding-block:clamp(28px,5.5vh,60px);align-items:start}
.card{min-width:0;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 4px 16px #18372606;padding:clamp(20px,2.3vw,34px)}
.badge{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:fit-content;border-radius:999px;padding:4px 11px;font-size:13px;font-weight:650;color:var(--green);background:var(--tint)}
.badge .icon{width:15px;height:15px} h1{font-size:clamp(26px,2.8vw,40px);letter-spacing:-.05em;margin:16px 0 8px}
h2{font-size:21px;letter-spacing:-.035em} .muted,.small,.sub{color:var(--muted)}.small{font-size:13px}
.dial{position:relative;isolation:isolate;overflow:hidden;margin:22px 0 16px;padding:20px 24px;border-radius:13px;color:#e8f8df;background:#0c493b}
.dial:after{content:"";position:absolute;inset:0;z-index:-1;background-image:radial-gradient(#b7eacf28 .8px,transparent .8px);background-size:9px 9px}
.dial .icon{width:15px;height:15px}.dial-label,.charge{color:#c1dcc8;font-size:13px}.digits{display:block;font:bold clamp(44px,5.2vw,73px)/1.15 var(--mono);letter-spacing:-.065em;margin:8px 0 16px}
.wave{position:absolute;right:-6px;top:14px;width:33%;height:84px;z-index:-1;opacity:.35}
.charge{margin-bottom:6px}.charge output{color:#dcf4bf}.track{height:7px;background:#376455;border-radius:8px;overflow:hidden}.track i{height:100%;display:block;background:#b2e9aa;border-radius:inherit}
.actions{gap:18px;flex-wrap:wrap}.action{justify-content:center;gap:8px;min-height:44px}.actions a{color:var(--green);font-weight:650;text-decoration:none;font-size:14px}.actions a:hover{text-decoration:underline}
#enter{background:var(--green);color:var(--card);border:none}#enter:disabled{background:var(--soft);color:var(--muted)}
.note{font-size:14px;margin:14px 0 21px;color:var(--muted)}#hours{border-top:1px solid var(--line);padding-top:19px}#hours h2{font-size:18px}
.rail{position:relative;background:var(--line);height:10px;margin:20px 0 5px;border-radius:5px}.rail .segment{background:var(--green);position:absolute;inset-block:0}.segment:first-child,.segment:last-of-type{border-radius:3px}
#marker{position:absolute;top:50%;width:12px;height:18px;border-radius:5px;background:var(--ink);border:2px solid var(--card);transform:translate(-50%,-50%)}
.ticks{display:flex;justify-content:space-between;color:var(--muted);font:12px var(--mono)}.legend{gap:5px 14px;flex-wrap:wrap;margin-top:14px;font:13px/1.6 var(--mono);color:var(--muted)}
.legend span:before{content:"";display:inline-block;background:var(--green);width:6px;height:6px;border-radius:50%;margin-right:5px}
.game-title{display:flex;align-items:center;gap:9px;margin:1px 0 18px}.game-title .icon{color:var(--green);width:22px;height:22px}
.tabs{display:grid;grid-template-columns:1fr 1.25fr;background:var(--soft);border:1px solid var(--line);padding:4px;border-radius:13px;margin-bottom:17px}
.tabs button{border:1px solid transparent;background:transparent;color:var(--muted);min-height:39px;padding:6px;font-size:14px}
.tabs [aria-selected=true]{border-color:var(--line);background:var(--card);color:var(--green);box-shadow:0 1px 3px #17281c10}
.stage{position:relative;isolation:isolate;overflow:hidden;border-radius:13px;background-color:light-dark(#def0df,#234535);background-image:radial-gradient(light-dark(#b2cfb8,#365e48) 1px,transparent 1px);background-size:12px 12px;border:1px solid var(--line);padding:13px 15px 6px}
.stage .row{align-items:start}.stage strong{display:block;font:700 25px/1.1 var(--mono)}.stage-label{font-size:12px;color:var(--muted);font-weight:600}.reading{color:var(--hot);background:var(--hot-bg);border:1px solid var(--line);padding:7px 10px;border-radius:9px}
.machine{display:block;width:92%;height:clamp(160px,15vw,210px);margin:-22px auto 0;position:relative;z-index:-1}
.lamp{width:7px;height:7px;border-radius:50%;background:var(--green);animation:breathe 3s ease-in-out infinite}@keyframes breathe{50%{opacity:.5}}
.particle{position:absolute;left:55%;top:61%;color:var(--green);font:bold 15px var(--mono);pointer-events:none;animation:float .7s ease-out forwards}
@keyframes float{to{opacity:0;transform:translate(var(--drift),-48px)}}
.cool-actions{display:grid;grid-template-columns:1fr 1.15fr 1.35fr;gap:7px;margin:12px 0 18px}.cool-actions button{font-size:13px;padding:9px 3px;gap:5px}.cool-actions .icon{width:15px}
.tip{border-top:1px solid var(--line);padding-top:16px}.tip b{font-size:13px;color:var(--green)}.tip p{margin-top:6px;min-height:3.1em}
.reward{margin-bottom:13px;color:var(--green);font-weight:bold}.reward button{margin-left:8px}
.quiz-meta{color:var(--muted);font-size:13px;flex-wrap:wrap}.quiz-meta output{font-weight:bold;color:var(--green)}
#prompt{font-size:19px;margin:16px 0}.choices{display:grid;gap:8px}.choices button{text-align:left;display:flex;align-items:center;gap:10px;min-height:42px}.choices kbd{font:13px var(--mono);border:1px solid var(--line);border-radius:5px;padding:1px 5px;color:var(--muted)}
.choices .correct{border-color:var(--green);background:var(--tint);color:var(--green)}.choices .wrong{color:var(--hot);background:var(--hot-bg);border-color:var(--hot)}#feedback{margin:12px 0}#feedback:empty{display:none}#next{color:var(--green)}
@media(max-width:850px){.wrap{width:min(640px,calc(100% - 32px))}main{grid-template-columns:minmax(0,1fr);gap:16px;padding-block:22px}.card{padding:22px}.digits{font-size:56px}}
@media(max-width:480px){nav{height:60px}.brand{font-size:18px;gap:7px}.brand img{width:30px;height:30px}.brand small{font-size:12px;padding-left:9px;margin:0}.nav-clock{margin-right:2px;font-size:12px}.nav-clock .icon,.nav-clock .zone{display:none}.wrap{width:calc(100% - 24px)}.card{padding:18px}.dial{padding:16px;margin-top:16px}.digits{font-size:clamp(38px,12vw,54px)}.wave{width:26%}.legend{gap:4px 9px}.tabs button{font-size:13px}.machine{width:95%}.cool-actions button{flex-direction:column}.note{margin-bottom:17px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}button:enabled:active{transform:none}.particle{display:none}}
`;
const brandUri = 'data:image/svg+xml,' + encodeURIComponent(brand);
const pad = value => String(value).padStart(2, '0');
function countdown(seconds) {
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(pad).join(':');
}
function timeline(windows) {
    const ranges = windows.flatMap(({startMinute, endMinute}) => endMinute < startMinute
        ? [[0, endMinute], [startMinute, 1440]] : [[startMinute, endMinute]]);
    return ranges.sort(([a], [b]) => a - b).map(([start, end]) =>
        `<i class="segment" style="left:${start / 14.4}%;width:${(end - start) / 14.4}%"></i>`).join('');
}

export function renderCooldownPage(status) {
    const {period, nowMs, cooldownStartMs, cooldownEndMs, nextOpenMs, openWindows} = status;
    const [label, greeting, symbol] = scenes[period];
    const opensAt = new Date(nextOpenMs + 8 * 3600_000).toISOString().slice(11, 16);
    const percent = Math.floor(100 * (nowMs - cooldownStartMs) / (cooldownEndMs - cooldownStartMs));
    const minute = ((nowMs / 60_000 + 480) % 1440);
    const sceneData = Object.fromEntries(Object.entries(scenes).map(([name, [label, title, symbol]]) =>
        [name, {label, title, icon: icon(symbol)}]));
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>码起步 · 停站冷却</title><link rel="icon" href="${brandUri}">
<script>try{const t=localStorage.getItem('maqibu.cooldown.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}</script>
<style>${styles}</style>
<noscript><style>.game,#theme,.actions,#live-clock,.dial{display:none}</style></noscript></head>
<body><svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${iconSheet}</defs></svg><header><nav class="wrap" aria-label="站点状态"><div class="brand"><img src="${brandUri}" alt="">码起步<small>服务状态</small></div>
<div class="inline"><div class="nav-clock inline" id="live-clock">${icon('clock')}<span class="zone">北京时间</span><time id="beijing">${status.beijingTimeText}</time></div>
<button id="theme" aria-label="切换明暗模式">${icon('moon')}</button></div></nav></header>
<main class="wrap" data-now="${nowMs}" data-next-open-at="${nextOpenMs}" data-cooldown-start="${cooldownStartMs}" data-cooldown-end="${cooldownEndMs}">
<section class="card" aria-labelledby="greeting"><span class="badge" id="status-badge">${icon(symbol)}${label}</span>
<h1 id="greeting">${greeting}</h1><p class="sub" id="reopen" role="status">北京时间 ${opensAt} 准时开闸。</p>
<div class="dial"><svg aria-hidden="true" class="wave" viewBox="0 0 160 70" fill="none" stroke="#9adcb0" stroke-width="1.5">
<path d="M0 40h22l8-8 10 16 12-39 12 56 11-34 8 9h12l8-10 10 17 8-7h39"/><path opacity=".4" d="M0 48h22l8-8 10 16 12-39 12 56 11-34 8 9h12l8-10 10 17 8-7h39"/></svg>
<span class="dial-label inline">${icon('clock')}<span id="timer-label">距离下次开放</span></span><span id="remaining" class="digits" role="timer" aria-labelledby="timer-label">${countdown(status.retryAfterSeconds)}</span>
<div class="charge row"><span>冷却充能</span><span class="mono" id="percent">${percent}%</span></div>
<div class="track" role="progressbar" aria-label="冷却充能" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div></div>
<div class="actions"><button class="action" id="enter" disabled>进入码起步 ${icon('arrow')}</button><a class="action" href="#hours">查看开放时段 ${icon('down')}</a></div>
<p class="note">冷却期间暂不支持登录与提交。已保存的草稿和学习进度会安全保留。</p>
<section id="hours" tabindex="-1"><div class="row"><h2>每日开放时段</h2><span class="small">北京时间 · 24 小时</span></div>
<div class="rail" aria-hidden="true">${timeline(openWindows)}<b id="marker" style="left:${minute / 14.4}%"></b></div>
<div class="ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
<div class="legend">${openWindows.map(w => '<span>' + w.label + '</span>').join('')}</div></section>
<noscript><p class="note">${serviceHoursMessage} 到点后可手动刷新此页继续学习。</p></noscript></section>
<section class="card game" aria-labelledby="game-heading"><h2 class="game-title" id="game-heading">${icon('chip')}冷却游乐场</h2>
<div class="tabs" role="tablist" aria-label="冷却互动"><button role="tab" id="cool-tab" aria-selected="true" aria-controls="cool">帮服务器降温</button>
<button role="tab" id="quiz-tab" aria-selected="false" aria-controls="quiz" tabindex="-1">SQL &amp; Java 冷却热身</button></div>
<div id="cool" role="tabpanel" aria-labelledby="cool-tab"><figure class="stage"><div class="row"><span class="inline stage-label"><i class="lamp"></i>码起步机箱</span>
<div class="reading"><span class="stage-label">模拟温度</span><strong id="temperature"></strong></div></div>${machine}</figure>
<div class="cool-actions">${[['wind','扇扇风',5],['cup','递杯冰美式',8],['plug','释放空闲连接',11]].map(([symbol, name, delta]) =>
    `<button class="action" data-drop="${delta}">${icon(symbol)}${name}</button>`).join('')}</div>
<div class="reward" hidden><span role="status">已解锁 · 机房降温达人</span><button id="reset">再降温一次</button></div>
<div class="tip"><b class="inline">${icon('bulb')}机房小纸条</b><p id="tip" aria-live="polite">试着给机箱降降温。低于 26°C，就能解锁「机房降温达人」。</p></div></div>
<div id="quiz" role="tabpanel" aria-labelledby="quiz-tab" hidden><div class="row quiz-meta"><span id="question-no"></span>
<span>连击 <output id="combo">0</output> · 本机最高 <output id="best">0</output></span></div>
<h3 id="prompt" tabindex="-1"></h3><div class="choices" role="group" aria-labelledby="prompt"></div><p id="feedback" role="status"></p>
<button id="next" hidden>下一题 ${icon('arrow')}</button></div></section></main>
<script>${clientScript({questions, tips, windows: openWindows, scenes: sceneData, openIcon: icon('check'), sun: icon('sun'), moon: icon('moon')})}</script></body></html>`;
}

function clientScript(data) {
    // Only module-owned question text, icons and schedule definitions are serialized.
    return `'use strict';
const config = ${JSON.stringify(data).replaceAll('<', '\\u003c')};
${interactions.trim().replace(/^ +/gm, '')}`;
}

const interactions = `
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const pad = number => String(number).padStart(2, '0');
function save(key, value) {
    try { localStorage.setItem('maqibu.cooldown.' + key, String(value)); } catch {}
}
const scheme = matchMedia('(prefers-color-scheme: dark)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function syncTheme() {
    const dark = (document.documentElement.dataset.theme || (scheme.matches ? 'dark' : 'light')) === 'dark';
    $('#theme').innerHTML = dark ? config.sun : config.moon;
    $('#theme').setAttribute('aria-label', dark ? '切换为浅色模式' : '切换为深色模式');
    return dark;
}
$('#theme').onclick = () => {
    const theme = syncTheme() ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    save('theme', theme);
    syncTheme();
};
syncTheme();
scheme.addEventListener('change', syncTheme);

const initial = $('main').dataset;
const loadedAt = Date.now();
const dayMs = 86400000;
const offsetMs = 8 * 3600000;
const breaks = config.windows.map((window, index, windows) => ({
    start: windows.at(index - 1).endMinute * 60000, end: window.startMinute * 60000,
    scene: window.precedingBreak,
}));
let displayed = 'initial';
function tick() {
    const now = Number(initial.now) + Date.now() - loadedAt;
    const local = new Date(now + offsetMs).toISOString().slice(11, 19);
    const inDay = (now + offsetMs) % dayMs;
    $('#beijing').textContent = local;
    $('#marker').style.left = (100 * inDay / dayMs) + '%';
    $('#marker').title = '北京时间 ' + local;
    let start = Number(initial.cooldownStart), end = Number(initial.cooldownEnd);
    let remaining = Number(initial.nextOpenAt) - now;
    // A tab can stay open into a later break. Re-evaluate the same daily windows locally.
    if (remaining <= 0) {
        const gap = breaks.find(gap => gap.start <= inDay && inDay < gap.end);
        const state = gap ? gap.scene : 'open';
        if (gap) {
            start = now - inDay + gap.start;
            end = now - inDay + gap.end;
            remaining = end - now;
        }
        if (displayed !== state) {
            displayed = state;
            const scene = config.scenes[state];
            $('#enter').disabled = Boolean(gap);
            $('#timer-label').textContent = gap ? '距离下次开放' : '本次冷却已结束';
            $('#status-badge').innerHTML = gap ? scene.icon + scene.label : config.openIcon + '服务开放';
            $('#greeting').textContent = gap ? scene.title : '已进入开放时段';
            $('#reopen').textContent = gap ? '北京时间 ' + new Date(end + offsetMs).toISOString().slice(11,16) + ' 准时开闸。' : '现在可以进入码起步，继续上次的学习。';
        }
    }
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    $('#remaining').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(pad).join(':');
    const percent = Math.max(0, Math.min(100, Math.floor(100 * (now - start) / (end - start))));
    $('#percent').textContent = percent + '%';
    $('.track i').style.width = percent + '%';
    $('.track').setAttribute('aria-valuenow', percent);
}
tick();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', tick);
$('#enter').onclick = () => { tick(); if (!$('#enter').disabled) location.reload(); };

const tabs = all('[role=tab]');
function selectTab(tab) {
    for (const item of tabs) {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
    tab.focus();
}
for (const tab of tabs) {
    tab.onclick = () => selectTab(tab);
    tab.onkeydown = event => {
        const index = tabs.indexOf(tab);
        const target = {ArrowRight: 1 - index, ArrowLeft: 1 - index, Home: 0, End: 1}[event.key];
        if (target !== undefined) { event.preventDefault(); selectTab(tabs[target]); }
    };
}

const drops = all('[data-drop]');
const initialTip = $('#tip').textContent;
let temperature, tipIndex = -1;
function resetGame() {
    temperature = 76 + Math.floor(Math.random() * 9);
    $('#temperature').textContent = temperature + '°C';
    $('.reward').hidden = true;
    for (const button of drops) button.disabled = false;
    $('#tip').textContent = initialTip;
}
function cool(button) {
    const drop = Number(button.dataset.drop);
    temperature -= drop;
    $('#temperature').textContent = temperature + '°C';
    tipIndex = (tipIndex + 1 + Math.floor(Math.random() * (config.tips.length - 1))) % config.tips.length;
    $('#tip').textContent = config.tips[tipIndex];
    if (!reduced.matches) {
        for (const drift of [-26, 0, 26]) {
            const particle = document.createElement('span');
            particle.className = 'particle';
            particle.textContent = drift === 0 ? '−' + drop + '°' : '·';
            particle.setAttribute('aria-hidden','true');
            particle.style.setProperty('--drift', drift + 'px');
            $('.stage').append(particle);
            setTimeout(() => particle.remove(), 720);
        }
    }
    if (temperature < 26) {
        $('.reward').hidden = false;
        for (const action of drops) action.disabled = true;
        $('#reset').focus();
    }
}
for (const button of drops) button.onclick = () => cool(button);
$('#reset').onclick = () => { resetGame(); drops[0].focus(); };
resetGame();

let questionIndex = 0, combo = 0, best = 0, answered = false;
try { best = Math.max(0, parseInt(localStorage.getItem('maqibu.cooldown.best'), 10) || 0); } catch {}
$('#best').textContent = best;
function answer(index) {
    if (answered) return;
    answered = true;
    const [, , correct, explanation] = config.questions[questionIndex];
    const right = index === correct;
    combo = right ? combo + 1 : 0;
    if (combo > best) { best = combo; save('best', best); }
    $('#combo').textContent = combo;
    $('#best').textContent = best;
    const choices = all('.choices button');
    choices[correct].classList.add('correct');
    if (!right) choices[index].classList.add('wrong');
    for (const choice of choices) choice.setAttribute('aria-disabled', 'true');
    $('#feedback').textContent = (right ? '答对了！' : '正确答案是 ' + (correct + 1) + '。') + explanation;
    $('#next').hidden = false;
}
function showQuestion() {
    const [prompt, options] = config.questions[questionIndex];
    answered = false;
    $('#question-no').textContent = '第 ' + (questionIndex + 1) + ' / ' + config.questions.length + ' 题';
    $('#prompt').textContent = prompt;
    $('.choices').replaceChildren();
    options.forEach((option, index) => {
        const button = document.createElement('button'), key = document.createElement('kbd');
        key.textContent = index + 1;
        button.append(key, option);
        button.onclick = () => answer(index);
        $('.choices').append(button);
    });
    $('#feedback').textContent = '';
    $('#next').hidden = true;
}
$('#next').onclick = () => {
    questionIndex = (questionIndex + 1) % config.questions.length;
    showQuestion();
    $('#prompt').focus();
};
document.addEventListener('keydown', event => {
    if ($('#quiz').hidden || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (['1','2','3','4'].includes(event.key)) { event.preventDefault(); answer(Number(event.key) - 1); }
});
showQuestion();
`;

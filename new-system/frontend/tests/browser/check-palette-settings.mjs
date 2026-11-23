import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const bin = process.env.CS_BROWSER_BIN;
assert.ok(bin, 'Set CS_BROWSER_BIN to the agent-browser executable.');
const session = 'cs-palette-settings-qa';
const base = process.env.CS_FRONTEND_URL || 'http://127.0.0.1:5178';
const output = fileURLToPath(new URL('../../../docs/acceptance/palette-settings/', import.meta.url));
const toggle = '.palette-toggle';
const popup = '.palette-popover';
const results = {browser: null, pages: [], contrast: [], checks: []};

function run(...args) {
  const result = spawnSync(bin, ['--session', session, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}

function evaluate(code) {
  const result = spawnSync(bin, ['--session', session, 'eval', '--stdin'], {
    input: code, encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

function open(route, ready) {
  run('open', base + route);
  run('wait', ready);
}

function check(condition, label) {
  assert.ok(condition, label);
  results.checks.push(label);
}

function clickOption(scope, value) {
  run('click', scope + ' label:has(input[value="' + value + '"])');
}

function measureContrast() {
  const text = document.querySelector('.access-fields button[type=submit]');
  const brand = document.querySelector('.brand-symbol');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function rgbOf(color) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }
  function luminance(color) {
    const [r, g, b] = rgbOf(color).map(value => {
      const x = value / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(foreground, background) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }
  const buttonStyle = getComputedStyle(text);
  const brandBackground = getComputedStyle(brand).backgroundColor;
  const brandStroke = getComputedStyle(brand.querySelector('svg')).stroke;
  const root = getComputedStyle(document.documentElement);
  const primaryInk = root.getPropertyValue('--primary-ink');
  const statusBar = document.querySelector('meta[name="theme-color"]').content;
  return {
    palette: document.documentElement.dataset.palette,
    mode: document.documentElement.dataset.theme,
    button: contrast(buttonStyle.color, buttonStyle.backgroundColor),
    brand: contrast(brandStroke, brandBackground),
    hover: contrast(buttonStyle.color, root.getPropertyValue('--primary-hover')),
    surfaceInk: contrast(primaryInk, root.getPropertyValue('--surface')),
    softInk: contrast(primaryInk, root.getPropertyValue('--primary-soft')),
    statusBar,
    statusBarMatches: String(rgbOf(statusBar)) === String(rgbOf(getComputedStyle(document.querySelector('.access-page')).backgroundColor)),
  };
}

function inspectPopup(width, route) {
  run('click', toggle);
  run('wait', popup);
  const metrics = evaluate(`(() => {
    const panel = document.querySelector('.palette-popover');
    const button = document.querySelector('.palette-toggle');
    const rect = panel.getBoundingClientRect();
    const trigger = button.getBoundingClientRect();
    return {
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: innerHeight,
      belowTrigger: rect.top >= trigger.bottom,
      target: [trigger.width, trigger.height],
      focusInside: panel.contains(document.activeElement),
      rows: panel.querySelectorAll('.palette-quick-option').length,
    };
  })()`);
  const {left, right, bottom, height, belowTrigger, target, focusInside, rows, scrollWidth} = metrics;
  check(left >= 0 && right <= width && bottom <= height && belowTrigger && scrollWidth <= width, route + ' popup fits ' + width);
  check(target.every(value => value >= 44) && focusInside && rows === 9, route + ' popup controls and focus ' + width);
  run('press', 'Escape');
  run('wait', '80');
  check(evaluate(`!document.querySelector('.palette-popover') && document.activeElement.matches('.palette-toggle')`),
    route + ' Escape restores focus ' + width);
  return metrics;
}

mkdirSync(output, {recursive: true});
try {
  open('/learn', '.topbar .palette-toggle');
  results.browser = evaluate('navigator.userAgent');
  check(evaluate(`document.documentElement.dataset.palette === 'emerald'`), 'Clean browser defaults to emerald');

  for (const [width, height] of [[390, 844], [1440, 900]]) {
    run('set', 'viewport', String(width), String(height));
    for (const [route, ready] of [['/learn', '.topbar'], ['/settings#appearance', '.palette-grid']]) {
      open(route, ready);
      if (route === '/settings#appearance') {
        const grid = evaluate(`[getComputedStyle(document.querySelector('.palette-grid')).gridTemplateColumns.split(' ').length,
          document.querySelectorAll('.palette-card').length]`);
        check(grid[0] === (width === 390 ? 1 : 3) && grid[1] === 9, 'Settings card grid ' + width);
        clickOption('.theme-settings', 'cupcake-synthwave');
        check(evaluate(`localStorage.getItem('cs-palette') === 'cupcake-synthwave' &&
          document.querySelector('.palette-card:has(input[value="cupcake-synthwave"]) input').checked`), 'Settings persists classic palette');
        clickOption('.theme-settings', 'dark');
        check(evaluate(`[...document.querySelectorAll('.theme-preview')].every(preview => preview.dataset.theme === 'dark')`), 'Dark mode updates all previews');
        run('eval', "document.querySelector('.theme-settings').scrollIntoView({block:'start'})");
        run('screenshot', path.join(output, 'settings-dark-' + width + '.png'));
        run('eval', `window.scrollTo(0, 0)`);
      }
      results.pages.push({route, ...inspectPopup(width, route)});
    }
  }

  // Enable the account UI in the test browser while keeping the local backend and its data isolated.
  run('network', 'route', '**/api/v1/auth/config', '--body', '{"enabled":true,"inviteRequired":true}');
  run('network', 'route', '**/api/v1/auth/refresh', '--abort');
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    run('set', 'viewport', String(width), String(height));
    for (const route of ['/register', '/login']) {
      open(route, '.access-fields');
      results.pages.push({route, ...inspectPopup(width, route)});
      run('click', toggle);
      const ids = evaluate(`[...document.querySelectorAll('.palette-quick-option input')].map(input => input.value)`);
      run('press', 'Escape');
      for (const mode of ['light', 'dark']) {
        run('click', toggle);
        clickOption(popup, mode);
        for (const id of ids) {
          clickOption(popup, id);
          const reading = evaluate('(' + measureContrast + ')()');
          assert.equal(reading.palette, id);
          assert.equal(reading.mode, mode);
          const minimum = id === 'cupcake-synthwave' && mode === 'light' ? 5 : 4.5;
          const record = {route, width, ...reading};
          results.contrast.push(record);
          assert.ok(reading.button >= minimum && reading.brand >= minimum && reading.hover >= minimum,
            'Button and wordmark contrast: ' + JSON.stringify(record));
          assert.ok(reading.statusBarMatches, 'Status bar matches the canvas: ' + JSON.stringify(record));
          assert.ok(reading.surfaceInk >= 4.5 && reading.softInk >= 4.5, 'Surface ink contrast: ' + JSON.stringify(record));
        }
        run('press', 'Escape');
      }
      if (width === 390 && route === '/register') {
        run('screenshot', path.join(output, 'register-classic-dark-390.png'));
        run('click', toggle);
        clickOption(popup, 'light');
        clickOption(popup, 'emerald');
        run('screenshot', path.join(output, 'register-palette-menu-390.png'));
        run('click', '.access-wordmark');
        run('wait', '80');
        check(evaluate(`!document.querySelector('.palette-popover') && document.activeElement.matches('.palette-toggle')`),
          'Outside click closes and restores focus');
        run('hover', '.access-fields button[type=submit]');
        run('wait', '200');
        check(evaluate('(' + measureContrast + ')().button') >= 4.5, 'Emerald registration hover meets 4.5:1');
      }
    }
  }

  run('set', 'viewport', '320', '844');
  results.pages.push({route: '/register', ...(() => {
    open('/register', '.access-fields');
    return inspectPopup(320, '/register');
  })()});
  run('click', toggle);
  clickOption(popup, 'light');
  run('press', 'ArrowRight');
  check(evaluate(`localStorage.getItem('cs-theme') === 'dark'`), 'Arrow keys select the next mode');
  clickOption(popup, 'system');
  run('set', 'media', 'dark');
  check(evaluate(`document.documentElement.dataset.theme === 'dark'`), 'System preference reacts to dark media');
  run('set', 'media', 'light');
  check(evaluate(`document.documentElement.dataset.theme === 'light'`), 'System preference reacts to light media');
  run('reload');
  run('wait', '.access-fields');
  check(evaluate(`localStorage.getItem('cs-theme') === 'system' && document.documentElement.dataset.palette === 'cupcake-synthwave'`),
    'Both preferences survive reload');
} catch (error) {
  results.failure = error.message;
  throw error;
} finally {
  writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  run('close');
}
console.log(results.checks.length + ' interaction assertions and ' + results.contrast.length + ' contrast combinations passed.');

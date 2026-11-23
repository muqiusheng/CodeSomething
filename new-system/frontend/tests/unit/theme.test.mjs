import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const bootstrap = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
const ids = ['emerald', 'indigo', 'terracotta', 'ocean', 'graphite', 'forest', 'rose', 'amber', 'cupcake-synthwave'];

function start(initial = {}, dark = false, blocked = false) {
  const storage = new Map(Object.entries(initial));
  const window = new EventTarget();
  const media = Object.assign(new EventTarget(), {matches: dark});
  const root = {dataset: {}, style: {}};
  const meta = new Map();
  runInNewContext(bootstrap, {
    window, matchMedia: () => media,
    localStorage: {
      getItem(key) { if (blocked) throw Error(); return storage.get(key); },
      setItem(key, value) { if (blocked) throw Error(); storage.set(key, value); },
    },
    document: {documentElement: root, querySelector: () => ({setAttribute: (key, value) => meta.set(key, value)})},
  });
  return {appearance: window.csAppearance, root, storage, media, window, meta};
}

test('first paint uses emerald and validates each stored preference independently', () => {
  const defaults = start();
  assert.deepEqual(defaults.root.dataset, {theme: 'light', palette: 'emerald'});
  assert.equal(defaults.root.style.colorScheme, 'light');
  assert.equal(defaults.meta.get('content'), '#F7FAF8');
  assert.deepEqual(start({'cs-theme': 'dark', 'cs-palette': 'constructor'}).root.dataset,
    {theme: 'dark', palette: 'emerald'});
  assert.deepEqual(start({'cs-theme': 'twilight', 'cs-palette': 'ocean'}, true).root.dataset,
    {theme: 'light', palette: 'ocean'});
});

test('all nine palettes persist, survive reload and synchronize the status bar', () => {
  const state = start();
  assert.deepEqual(Array.from(state.appearance.paletteIds), ids);
  for (const id of ids) {
    assert.equal(state.appearance.setPalette(id), true);
    assert.equal(state.storage.get('cs-palette'), id);
    assert.equal(state.root.dataset.palette, id);
    const lightColor = state.meta.get('content');
    state.appearance.setTheme('dark');
    assert.notEqual(state.meta.get('content'), lightColor);
    const reloaded = start(Object.fromEntries(state.storage));
    assert.deepEqual(reloaded.root.dataset, {theme: 'dark', palette: id});
    assert.equal(reloaded.meta.get('content'), state.meta.get('content'));
    state.appearance.setTheme('light');
  }
});

test('system, explicit themes and cross-tab changes update a stable reactive snapshot', () => {
  const state = start({'cs-theme': 'system', 'cs-palette': 'forest'}, true);
  const {appearance, root, storage, media, window} = state;
  const changes = [];
  const stop = appearance.subscribe(() => changes.push(appearance.getSnapshot()));
  assert.equal(appearance.getSnapshot().resolved, 'dark');
  assert.equal(appearance.getSnapshot(), appearance.getSnapshot());
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  assert.equal(root.dataset.theme, 'light');
  appearance.setTheme('dark');
  media.dispatchEvent(new Event('change'));
  assert.equal(root.dataset.theme, 'dark');
  storage.set('cs-palette', 'rose');
  window.dispatchEvent(Object.assign(new Event('storage'), {key: 'cs-palette'}));
  storage.set('cs-theme', 'system');
  window.dispatchEvent(Object.assign(new Event('storage'), {key: 'cs-theme'}));
  assert.deepEqual(root.dataset, {theme: 'light', palette: 'rose'});
  storage.clear();
  window.dispatchEvent(Object.assign(new Event('storage'), {key: null}));
  assert.deepEqual(root.dataset, {theme: 'light', palette: 'emerald'});
  assert.equal(changes.length, 5);
  stop();
});

test('blocked storage keeps both selections for the current page', () => {
  const {appearance, root, meta} = start({}, true, true);
  assert.equal(appearance.setPalette('amber'), false);
  assert.equal(appearance.setTheme('system'), false);
  assert.deepEqual(root.dataset, {theme: 'dark', palette: 'amber'});
  assert.equal(meta.get('content'), '#12110E');
});

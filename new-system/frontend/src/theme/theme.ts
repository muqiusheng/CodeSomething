import {useSyncExternalStore} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
const key = 'cs-theme';
const changed = 'cs-theme-change';
const system = window.matchMedia('(prefers-color-scheme: dark)');

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(key);
    if (value === 'dark' || value === 'system') return value;
  } catch { /* The selected theme still works when storage is unavailable. */ }
  return 'light';
}

function resolve(preference: ThemePreference) {
  return preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
}

// Keep an in-memory preference when browser storage is blocked.
let temporaryPreference: ThemePreference | undefined;
function preference() { return temporaryPreference ?? readPreference(); }
function sync() {
  const resolved = resolve(preference());
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#09002f' : '#f7f3f1');
  window.dispatchEvent(new Event(changed));
}

sync();
system.addEventListener('change', sync);
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) { temporaryPreference = undefined; sync(); }
});

function subscribe(callback: () => void) {
  window.addEventListener(changed, callback);
  return () => window.removeEventListener(changed, callback);
}

export function setTheme(value: ThemePreference): boolean {
  temporaryPreference = value;
  let persisted = false;
  try { localStorage.setItem(key, value); persisted = true; } catch { /* Report this in settings. */ }
  sync();
  return persisted;
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, () => `${preference()}:${resolve(preference())}`);
  const [selected, resolved] = snapshot.split(':') as [ThemePreference, 'light' | 'dark'];
  return {preference: selected, resolved, setTheme};
}

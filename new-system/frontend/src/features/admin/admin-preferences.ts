import {useSyncExternalStore} from 'react';

const key = 'cs-admin-preferences';
export const adminOptions = {
  palette: {site:'跟随全站配色', classic:'经典商务蓝'},
  density: {comfortable:'舒适', compact:'紧凑'},
  pageSize: {'10':'10 条','20':'20 条','50':'50 条'},
  refresh: {normal:'默认', slow:'低频（2 倍间隔）', manual:'仅手动刷新'},
  home: {overview:'概览', users:'用户管理', school:'课内实验', submissions:'评测作业'},
  exportFormat: {word:'Word (.doc)', markdown:'Markdown (.md)'},
} as const;
type Preferences = {[K in keyof typeof adminOptions]: keyof (typeof adminOptions)[K]};
const defaults: Preferences = {palette:'site',density:'comfortable',pageSize:'20',refresh:'normal',home:'overview',exportFormat:'word'};

function read(raw: string | null): Preferences {
  try {
    const entries = JSON.parse(raw ?? '{}') as Partial<Preferences>;
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => {
      const pref = name as keyof Preferences;
      const value = entries[pref];
      return [name, typeof value === 'string' && Object.hasOwn(adminOptions[pref],value) ? value : fallback];
    })) as Preferences;
  } catch { return defaults; }
}

let preferences = defaults;
try { preferences = read(localStorage.getItem(key)); } catch { /* Initial defaults are usable without storage. */ }
const listeners = new Set<() => void>();
function publish(next: Preferences) {
  preferences = next;
  document.documentElement.dataset.adminPalette = next.palette;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) publish(read(event.newValue));
});
document.documentElement.dataset.adminPalette = preferences.palette;

export function useAdminPreferences() {
  return useSyncExternalStore(subscribe, () => preferences);
}
export function setAdminPreference<K extends keyof Preferences>(name: K, value: string) {
  if (!Object.hasOwn(adminOptions[name],value)) return false;
  const next = {...preferences,[name]:value};
  publish(next);
  try { localStorage.setItem(key,JSON.stringify(next)); return true; }
  catch { return false; }
}

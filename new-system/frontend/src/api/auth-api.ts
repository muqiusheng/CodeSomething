import {setStorageOwner} from './browser-state.mjs';

export type User = {
  userId: string;
  username: string;
  email: string | null;
  role: 'ROLE_ADMIN' | 'ROLE_STUDENT';
  passwordChangeRequired: boolean;
};

type Session = User & {token: string; expiresIn: number};
type Config = {enabled: boolean; inviteRequired: boolean};
type AccessState = {loading: boolean; config?: Config; user: User | null; error?: string};

let state: AccessState = {loading: true, user: null};
let accessToken = '';
let initialization: Promise<void> | undefined;
let refreshing: Promise<boolean> | undefined;
const listeners = new Set<() => void>();
const prefix = '/api/v1/auth';
const sessionEvent = 'codesomething-auth-session';

export const currentAccess = () => state;
export function onAccessChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(next: AccessState) {
  state = next;
  listeners.forEach(listener => listener());
}

function session(next: Session) {
  const {token, expiresIn: _expiresIn, ...user} = next;
  accessToken = token;
  setStorageOwner(user.userId);
  update({...state, user});
}

async function json<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || '服务暂时无法完成请求。');
  return result as T;
}

async function refresh(expectedOwner?: string) {
  if (refreshing) return refreshing;
  async function renew() {
    try {
      const result = await fetch(prefix + '/refresh', {method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000)});
      if (result.ok) {
        const next = await json<Session>(result);
        if ((!expectedOwner || next.userId === expectedOwner) && (!expectedOwner || state.user?.userId === expectedOwner)) {
          session(next);
          return true;
        }
      }
    } catch { /* The route guard will request a new login. */ }
    accessToken = '';
    update({...state, user: null});
    return false;
  }
  refreshing = (async () => navigator.locks ? await navigator.locks.request(sessionEvent, renew) : await renew())
    ().finally(() => { refreshing = undefined; });
  return refreshing;
}

export function initializeAccess() {
  return initialization ??= (async () => {
    try {
      const response = await fetch(prefix + '/config', {cache: 'no-store', signal: AbortSignal.timeout(6000)});
      const config = response.status===404 ? {enabled:false,inviteRequired:false} : await json<Config>(response);
      update({config, user: null, loading: true});
      if (config.enabled) {
        setStorageOwner('guest');
        await refresh();
        window.addEventListener('storage', event => {
          if (event.key === sessionEvent) {
            update({...state,user:null});
            window.location.reload();
          }
        });
      }
      update({...state, loading: false});
    } catch {
      update({user: null, loading: false, error: '暂时无法读取登录状态，请检查服务后重试。'});
    }
  })();
}

function notifyTabs() {
  try { localStorage.setItem(sessionEvent, crypto.randomUUID()); } catch { /* Storage may be unavailable. */ }
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!url.startsWith('/api/') || !state.config?.enabled) return fetch(url, init);
  const owner = state.user?.userId;
  const headers = new Headers(init.headers);
  const paired = headers.get('Authorization');
  if (paired) headers.set('X-CS-Workspace-Authorization', paired);
  headers.delete('Authorization');
  const request = () => {
    if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);
    return fetch(url, {...init, headers});
  };
  const used = accessToken;
  const response = await request();
  if (response.status !== 401 || !owner || state.user?.userId !== owner) return response;
  const error = await response.clone().json().catch(() => null);
  if (error?.code !== 'AUTH_REQUIRED') return response;
  const renewed = accessToken !== used && !!accessToken || await refresh(owner);
  return renewed && state.user?.userId === owner && !init.signal?.aborted ? request() : response;
}

export async function credentials(mode: 'login' | 'register', body: Record<string,string>) {
  const response = await fetch(prefix + '/' + mode, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  session(await json<Session>(response));
  notifyTabs();
}

export async function changePassword(body: Record<string,string>) {
  const response = await fetch(prefix + '/password', {
    method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken}, body: JSON.stringify(body),
    cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  session(await json<Session>(response));
  notifyTabs();
}

export async function logout() {
  await json(await apiFetch(prefix + '/logout', {method: 'POST', signal: AbortSignal.timeout(10000)}));
  accessToken = '';
  setStorageOwner('guest');
  update({...state, user: null});
  notifyTabs();
  window.location.replace('/login');
}

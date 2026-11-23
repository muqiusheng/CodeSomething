import {useScopedRead} from '../hooks/useScopedRead';
import {apiFetch} from './auth-api';
import {localState} from './browser-state.mjs';
export type LearningPreferences = {
  dailyMinutes: number;
  motion: 'system' | 'reduce';
  revision: number;
  updatedAt: string;
};

async function preferencesRequest(method: 'GET' | 'PATCH', patch?: Partial<Pick<LearningPreferences, 'dailyMinutes' | 'motion'>>): Promise<LearningPreferences> {
  const response = await apiFetch('/api/v1/profiles/me/preferences', {
    method,
    cache: 'no-store',
    headers: {'Content-Type': 'application/json'},
    body: patch ? JSON.stringify(patch) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '保存失败，请重试。');
  if (![30, 60, 90].includes(body.dailyMinutes) || !['system', 'reduce'].includes(body.motion)) {
    throw new Error('本机服务返回了无法识别的偏好。');
  }
  return body as LearningPreferences;
}

export const getPreferences = () => preferencesRequest('GET');
export const updatePreferences = (patch: Partial<Pick<LearningPreferences, 'dailyMinutes' | 'motion'>>) => preferencesRequest('PATCH', patch);

export function usePreferences() {
  return useScopedRead('/profiles/me/preferences',getPreferences,{staleTime:Infinity});
}

export function cachePreferences(preferences: LearningPreferences) {
  document.documentElement.dataset.motion = preferences.motion;
  try {
    localState.setItem('cs-duration', String(preferences.dailyMinutes));
    localState.setItem('cs-motion', preferences.motion);
  } catch { /* The server remains the source when browser storage is unavailable. */ }
}

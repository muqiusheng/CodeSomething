import {apiFetch} from '../../api/auth-api';
import type {Progress} from './onboarding-state.mjs';

export type ProgressPatch=Partial<Omit<Progress,'updatedAt'>>;
export async function requestOnboarding(patch?:ProgressPatch,signal?:AbortSignal):Promise<Progress> {
  const timeout=AbortSignal.timeout(12000);
  const response=await apiFetch('/api/v1/onboarding',{
    cache:'no-store',signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
    ...(patch ? {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)} : {}),
  });
  if (!response.ok) throw new Error('导览状态暂时无法同步。');
  return response.json();
}

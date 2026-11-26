import {apiFetch} from './auth-api';

export type Page<T> = {items: T[]; page: number; size: number; total: number};

export function query(values: Record<string, string | number>) {
  const parameters = Object.entries(values).filter(([,value]) => value !== '').map(([key,value]) => [key, String(value)]);
  return '?' + new URLSearchParams(parameters);
}

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch('/api/v1/admin' + path, {cache: 'no-store', signal: AbortSignal.timeout(30000), ...init});
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || '管理请求失败，请重试。');
  }
  return response;
}

export async function adminRead<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request(path, signal ? {signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])} : {})).json();
}

export async function adminWrite<T>(path: string, method: 'POST' | 'PATCH', body: unknown = {}, timeoutMs = 30000): Promise<T> {
  return (await request(path, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)})).json();
}

export async function adminDelete(path: string) {
  await request(path, {method: 'DELETE'});
}

export async function adminDownload(path: string, name: string, signal?: AbortSignal) {
  const response = await request(path, signal ? {signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])} : undefined);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

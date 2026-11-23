import {useEffect, useSyncExternalStore, type ReactNode} from 'react';
import {currentAccess, initializeAccess, onAccessChange} from '../../api/auth-api';

export function useAuth() {
  return useSyncExternalStore(onAccessChange, currentAccess);
}

export function AuthProvider({children}: {children: ReactNode}) {
  const state = useAuth();
  useEffect(() => { void initializeAccess(); }, []);
  if (state.loading) return <main className="access-shell"><p role="status">正在读取登录状态…</p></main>;
  if (state.error) return <main className="access-shell"><div role="alert" className="csx-alert csx-alert-error">{state.error}</div><button type="button" className="csx-btn" onClick={() => window.location.reload()}>重试</button></main>;
  return children;
}

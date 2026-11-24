import {useEffect} from 'react';
import {apiFetch, currentAccess} from '../api/auth-api';

const INTERVAL = 60_000;

export function useMysqlActivity(endpoint: string | null, keepWhileVisible = false) {
  useEffect(() => {
    if (!endpoint || currentAccess().user?.role !== 'ROLE_STUDENT') return;
    let sentAt = -Infinity;
    const notify = () => {
      if (document.visibilityState !== 'visible' || performance.now() - sentAt < INTERVAL) return;
      sentAt = performance.now();
      void apiFetch(endpoint, {method: 'POST', cache: 'no-store'}).catch(() => {});
    };
    notify();
    document.addEventListener('pointerdown', notify, {passive: true, capture: true});
    document.addEventListener('keydown', notify, true);
    document.addEventListener('wheel', notify, {passive: true, capture: true});
    document.addEventListener('visibilitychange', notify);
    const timer = keepWhileVisible ? window.setInterval(notify, INTERVAL) : undefined;
    return () => {
      document.removeEventListener('pointerdown', notify, true);
      document.removeEventListener('keydown', notify, true);
      document.removeEventListener('wheel', notify, true);
      document.removeEventListener('visibilitychange', notify);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [endpoint, keepWhileVisible]);
}

import {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {BellRing} from 'lucide-react';
import {apiFetch} from '../../api/auth-api';
import {Modal} from '../../components/ui/modal';
import '../../styles/nudges.css';

type Nudge = {id: string; kind: string; title: string; message: string; created_at: string; sender_username: string};
const time = new Intl.DateTimeFormat('zh-CN', {dateStyle: 'medium', timeStyle: 'short'});

export function NudgeNotifier() {
  const [items, setItems] = useState<Nudge[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const acknowledged = useRef(new Set<string>());
  const current = items[0];

  useEffect(() => {
    let pending: AbortController | undefined;
    async function poll() {
      if (document.hidden || pending) return;
      const request = new AbortController();
      pending = request;
      try {
        const response = await apiFetch('/api/v1/nudges/unread', {
          cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) return;
        const unread: Nudge[] = await response.json();
        if (!request.signal.aborted) setItems(unread.filter(item => !acknowledged.current.has(item.id)));
      } catch { /* The next visible poll retries. */ }
      finally { if (pending === request) pending = undefined; }
    }
    function visibility() {
      if (document.hidden) {
        pending?.abort();
        pending = undefined;
      } else void poll();
    }
    void poll();
    const timer = window.setInterval(poll, 15000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  async function confirm(id: string, destination?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/nudges/' + encodeURIComponent(id) + '/ack', {
        method: 'POST', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok && response.status !== 404) throw new Error('确认失败');
      acknowledged.current.add(id);
      setItems(items => items.filter(item => item.id !== id));
      if (destination) navigate(destination);
    } catch {
      setError('暂时无法确认提醒，请重试。');
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;
  const shortcut = current.kind === 'lab' ? {label: '去课内实验', path: '/school'}
    : current.kind === 'exam' ? {label: '去备考', path: '/school/database-systems/exams'} : null;
  return <Modal key={current.id} open title={current.title} description="管理员提醒" className="learner-nudge"
    dismissible={false} onOpenChange={() => {}}>
    <p className="learner-nudge-meta"><BellRing size={17} aria-hidden="true"/>
      <span>{current.sender_username} · <time dateTime={current.created_at}>{time.format(new Date(current.created_at))}</time></span>
    </p>
    <p className="learner-nudge-message">{current.message}</p>
    {error && <p role="alert" className="csx-alert csx-alert-error">{error}</p>}
    <div className="learner-nudge-actions">
      <button className="csx-btn csx-btn-primary" type="button" disabled={busy} onClick={() => void confirm(current.id)}>知道了</button>
      {shortcut && <button className="csx-btn csx-btn-outline" type="button" disabled={busy}
        onClick={() => void confirm(current.id, shortcut.path)}>{shortcut.label}</button>}
    </div>
  </Modal>;
}

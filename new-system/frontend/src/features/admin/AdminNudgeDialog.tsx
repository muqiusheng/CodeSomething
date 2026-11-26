import {useState, type FormEvent} from 'react';
import {BellRing} from 'lucide-react';
import {adminWrite} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {message} from './admin-controls';

export type NudgeTarget = {id: string; username: string};
type Kind = 'study' | 'lab' | 'exam' | 'custom';
export type NudgeRecord = {
  id: string; title: string; message: string; created_at: string; acknowledged_at: string | null;
  status: 'acknowledged' | 'expired' | 'unread';
};

const templates: {kind: Kind; title: string; message: string}[] = [
  {kind: 'study', title: '学习进度提醒', message: '有空记得继续推进学习进度。遇到卡住的题目，可以去留言板告诉我。'},
  {kind: 'lab', title: '数据库实验提醒', message: '记得推进数据库实验进度，完成后保存并检查本次实验。'},
  {kind: 'exam', title: '考前练习提醒', message: '考前记得做一套综合模拟卷，做完可以回看错题。'},
];

export function AdminNudgeDialog({target, onClose, onSent}: {
  target: NudgeTarget; onClose: () => void; onSent: () => void;
}) {
  const [kind, setKind] = useState<Kind>('custom');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminWrite('/users/' + encodeURIComponent(target.id) + '/nudge', 'POST', {kind, title, message: body});
      onSent();
    } catch (failure) {
      setError(message(failure));
      setBusy(false);
    }
  }

  return <Modal open title={'督促一下 · ' + target.username} description="学员打开学习工作台时会收到提醒，提醒在 24 小时后过期。"
    className="admin-dialog" onOpenChange={open => {if (!open && !busy) onClose();}}>
    <form className="admin-form admin-nudge-form" onSubmit={send}>
      <div className="admin-tools" aria-label="快捷模板">
        {templates.map(template => <button key={template.kind} className="csx-btn csx-btn-outline csx-btn-sm" type="button"
          disabled={busy} onClick={() => {setKind(template.kind); setTitle(template.title); setBody(template.message);}}>
          {template.title}
        </button>)}
      </div>
      <label>类型<select className="csx-select" value={kind} disabled={busy} onChange={event => setKind(event.target.value as Kind)}>
        <option value="custom">自定义</option><option value="study">学习督促</option>
        <option value="lab">实验提醒</option><option value="exam">备考提醒</option>
      </select></label>
      <label>标题<input className="csx-input" value={title} maxLength={80} required disabled={busy}
        onChange={event => setTitle(event.target.value)}/></label>
      <label>正文<textarea className="csx-textarea" value={body} maxLength={500} rows={4} required disabled={busy}
        onChange={event => setBody(event.target.value)}/></label>
      {error && <p className="csx-alert csx-alert-error" role="alert">{error}</p>}
      <div className="admin-tools">
        <button className="csx-btn csx-btn-primary" type="submit" disabled={busy || !title.trim() || !body.trim()}>
          <BellRing size={16} aria-hidden="true"/>{busy ? '正在发送…' : '发送提醒'}
        </button>
        <button className="csx-btn csx-btn-ghost" type="button" disabled={busy} onClick={onClose}>取消</button>
      </div>
    </form>
  </Modal>;
}

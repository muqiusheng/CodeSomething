import {useState, type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {Megaphone, MessageSquareText, Pin, Plus} from 'lucide-react';
import {adminDelete, adminWrite, query, type Page} from '../../api/admin-api';
import {announcementCategories, feedbackCategories, feedbackStates} from '../../api/community-api';
import {InlineSpinner} from '../../components/shared/LoadingState';
import {Modal} from '../../components/ui/modal';
import {
  AdminNotice,
  ConfirmAction,
  DataState,
  Pager,
  RowActions,
  SearchFilter,
  Status,
  TableFrame,
  formatTime,
  message,
  useAdminData,
  useAdminFilters,
  type Confirmation,
} from './admin-controls';

type AdminAnnouncement = {
  id: string;
  title: string;
  content: string;
  category: 'feature' | 'notice' | 'maintenance' | 'exam';
  pinned: number;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminFeedback = {
  id: string;
  user_id: string;
  username: string;
  category: 'feature' | 'bug' | 'course' | 'chat';
  title: string;
  content: string;
  status: 'pending' | 'reviewed' | 'planned' | 'replied' | 'closed';
  admin_reply: string;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

type FeedbackPageData = Page<AdminFeedback> & {pendingCount: number};

const announcementStates: Record<AdminAnnouncement['status'], string> = {
  published: '已发布',
  draft: '草稿',
  archived: '已下架',
};

const blankAnnouncement: AdminAnnouncement = {
  id: '',
  title: '',
  content: '',
  category: 'feature',
  pinned: 1,
  status: 'published',
  published_at: null,
  created_at: '',
  updated_at: '',
};

export function AdminCommunity() {
  const {filters, applied, page, pageSize, setPage, setFilter, apply, reset} = useAdminFilters({
    tab: 'announcements',
    status: '',
    category: '',
    keyword: '',
  });
  const tab = applied.tab === 'feedback' ? 'feedback' : 'announcements';
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [replying, setReplying] = useState<AdminFeedback | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const announcements = useAdminData<Page<AdminAnnouncement>>(
    tab === 'announcements'
      ? '/announcements' + query({status: applied.status, category: applied.category, keyword: applied.keyword, page, size: pageSize})
      : null,
  );
  const feedback = useAdminData<FeedbackPageData>(
    tab === 'feedback'
      ? '/feedback' + query({status: applied.status, category: applied.category, keyword: applied.keyword, page, size: pageSize})
      : '/feedback' + query({status: 'pending', page: 1, size: 1}),
    20_000,
  );

  function switchTab(next: 'announcements' | 'feedback') {
    apply({tab: next, status: '', category: '', keyword: ''});
  }

  async function toggleAnnouncement(item: AdminAnnouncement, patch: Partial<{status: string; pinned: boolean}>, text: string) {
    setNotice('');
    await adminWrite('/announcements/' + item.id, 'PATCH', patch);
    setNotice(text);
    announcements.refresh();
  }

  function removeAnnouncement(item: AdminAnnouncement) {
    setConfirmation({
      title: '删除公告',
      description: `删除公告「${item.title}」后，用户端将不再显示该公告，且无法恢复。`,
      confirmLabel: '确认删除',
      action: async () => {
        await adminDelete('/announcements/' + item.id);
        setNotice(`已删除公告「${item.title}」。`);
        announcements.refresh();
      },
    });
  }

  function removeFeedback(item: AdminFeedback) {
    setConfirmation({
      title: '删除留言',
      description: `删除来自「${item.username}」的留言「${item.title}」？此操作不可撤销。`,
      confirmLabel: '确认删除',
      action: async () => {
        await adminDelete('/feedback/' + item.id);
        setNotice('已删除该条留言。');
        feedback.refresh();
      },
    });
  }

  const pendingCount = feedback.data?.pendingCount ?? 0;

  return <>
    <div className="admin-heading">
      <h1>公告与留言</h1>
      <div className="admin-tools">
        <button className="csx-btn csx-btn-primary" type="button" onClick={() => setEditing(blankAnnouncement)}>
          <Plus size={16} aria-hidden="true"/>发布全站公告
        </button>
      </div>
    </div>

    <div className="admin-tools admin-school-tabs" role="tablist" aria-label="公告与留言视图">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'announcements'}
        className={tab === 'announcements' ? 'csx-btn csx-btn-primary' : 'csx-btn'}
        onClick={() => switchTab('announcements')}
      >
        <Megaphone size={15} aria-hidden="true"/>全站公告
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'feedback'}
        className={tab === 'feedback' ? 'csx-btn csx-btn-primary' : 'csx-btn'}
        onClick={() => switchTab('feedback')}
      >
        <MessageSquareText size={15} aria-hidden="true"/>用户留言板
        {pendingCount > 0 && <span className="admin-tab-pill">{pendingCount}</span>}
      </button>
    </div>

    <AdminNotice text={notice} onClose={() => setNotice('')}/>

    {tab === 'announcements' && (
      <section className="admin-card admin-list">
        <form className="admin-form admin-filter-bar" aria-label="筛选公告" onSubmit={event => {event.preventDefault(); apply();}}>
          <SearchFilter label="标题或正文" placeholder="按公告关键词搜索…" value={filters.keyword} onChange={event => setFilter('keyword', event.target.value)}/>
          <label>分类<select className="csx-select" value={filters.category} onChange={event => apply({category: event.target.value})}>
            <option value="">全部分类</option>
            {Object.entries(announcementCategories).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select></label>
          <label>状态<select className="csx-select" value={filters.status} onChange={event => apply({status: event.target.value})}>
            <option value="">全部状态</option>
            {Object.entries(announcementStates).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select></label>
          <button className="csx-btn csx-btn-outline" type="submit">检索</button>
          <button className="csx-btn csx-btn-ghost" type="button" onClick={reset}>重置筛选</button>
        </form>
        <DataState loading={!announcements.data} error={announcements.error} retry={announcements.refresh}/>
        {announcements.data && (announcements.data.items.length ? (
          <TableFrame name="全站公告列表">
            <table className="csx-table admin-data-table">
              <thead>
                <tr>
                  <th scope="col">公告内容</th>
                  <th scope="col">分类</th>
                  <th scope="col">状态</th>
                  <th scope="col">更新时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {announcements.data.items.map(item => (
                  <tr key={item.id}>
                    <th scope="row">
                      <span className="admin-announcement-title">
                        {item.pinned ? <Pin size={13} aria-hidden="true" className="admin-pin-icon"/> : null}
                        {item.title}
                      </span>
                      <small>{item.content.length > 72 ? item.content.slice(0, 72) + '…' : item.content}</small>
                    </th>
                    <td>{announcementCategories[item.category] || item.category}</td>
                    <td><Status value={item.status}/></td>
                    <td className="admin-table-number">{formatTime(item.updated_at)}</td>
                    <td>
                      <RowActions subject={item.title} actions={[
                        {
                          label: item.status === 'published' ? '下架公告' : '立即发布',
                          run: () => void toggleAnnouncement(
                            item,
                            {status: item.status === 'published' ? 'archived' : 'published'},
                            item.status === 'published' ? '公告已下架。' : '公告已发布到全站。',
                          ),
                        },
                        {
                          label: item.pinned ? '取消置顶' : '置顶提醒',
                          run: () => void toggleAnnouncement(
                            item,
                            {pinned: !item.pinned},
                            item.pinned ? '已取消置顶。' : '已设为置顶提醒。',
                          ),
                        },
                        {label: '删除公告', run: () => removeAnnouncement(item), destructive: true},
                      ]}>
                        <button className="csx-btn csx-btn-outline" type="button" onClick={() => setEditing(item)}>编辑</button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ) : <p className="admin-empty">暂无全站公告，点击右上角「发布全站公告」即可推送新功能或通知。</p>)}
        {announcements.data && <Pager data={announcements.data} setPage={setPage}/>}
      </section>
    )}

    {tab === 'feedback' && (
      <section className="admin-card admin-list">
        <form className="admin-form admin-filter-bar" aria-label="筛选用户留言" onSubmit={event => {event.preventDefault(); apply();}}>
          <SearchFilter label="用户名或内容" placeholder="按用户名、标题或正文搜索…" value={filters.keyword} onChange={event => setFilter('keyword', event.target.value)}/>
          <label>分类<select className="csx-select" value={filters.category} onChange={event => apply({category: event.target.value})}>
            <option value="">全部分类</option>
            {Object.entries(feedbackCategories).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select></label>
          <label>状态<select className="csx-select" value={filters.status} onChange={event => apply({status: event.target.value})}>
            <option value="">全部状态</option>
            {Object.entries(feedbackStates).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
          </select></label>
          <button className="csx-btn csx-btn-outline" type="submit">检索</button>
          <button className="csx-btn csx-btn-ghost" type="button" onClick={() => apply({tab: 'feedback', status: '', category: '', keyword: ''})}>重置筛选</button>
        </form>
        <DataState loading={!feedback.data} error={feedback.error} retry={feedback.refresh}/>
        {feedback.data && (feedback.data.items.length ? (
          <TableFrame name="用户留言列表">
            <table className="csx-table admin-data-table">
              <thead>
                <tr>
                  <th scope="col">学员</th>
                  <th scope="col">留言内容</th>
                  <th scope="col">分类</th>
                  <th scope="col">状态</th>
                  <th scope="col">提交时间</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {feedback.data.items.map(item => (
                  <tr key={item.id}>
                    <th scope="row">
                      <Link to={'/admin/users' + query({profile: item.user_id})}>{item.username}</Link>
                    </th>
                    <td>
                      <strong>{item.title}</strong>
                      <small>{item.content.length > 84 ? item.content.slice(0, 84) + '…' : item.content}</small>
                      {item.admin_reply && <small className="admin-reply-preview">已回复：{item.admin_reply.slice(0, 60)}{item.admin_reply.length > 60 ? '…' : ''}</small>}
                    </td>
                    <td>{feedbackCategories[item.category] || item.category}</td>
                    <td><Status value={item.status}/></td>
                    <td className="admin-table-number">{formatTime(item.created_at)}</td>
                    <td>
                      <RowActions subject={item.title} actions={[
                        {label: '删除留言', run: () => removeFeedback(item), destructive: true},
                      ]}>
                        <button className="csx-btn csx-btn-outline" type="button" onClick={() => setReplying(item)}>查看并回复</button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ) : <p className="admin-empty">当前筛选下暂无用户留言。</p>)}
        {feedback.data && <Pager data={feedback.data} setPage={setPage}/>}
      </section>
    )}

    {editing && (
      <AnnouncementEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setNotice(editing.id ? '公告已更新。' : '全站公告已保存。');
          announcements.refresh();
        }}
      />
    )}

    {replying && (
      <FeedbackReplyModal
        item={replying}
        onClose={() => setReplying(null)}
        onSaved={() => {
          setReplying(null);
          setNotice('留言处理状态与回复已保存。');
          feedback.refresh();
        }}
      />
    )}

    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
  </>;
}

function AnnouncementEditor({item, onClose, onSaved}: {item: AdminAnnouncement; onClose: () => void; onSaved: () => void}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinned, setPinned] = useState(!!item.pinned);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await adminWrite('/announcements' + (item.id ? '/' + item.id : ''), item.id ? 'PATCH' : 'POST', {
        title: form.get('title'),
        content: form.get('content'),
        category: form.get('category'),
        status: form.get('status'),
        pinned,
      });
      onSaved();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={item.id ? '编辑全站公告' : '发布全站公告'} description="发布后，所有学员在学习工作台顶部和公告中心都会看到该消息。" className="admin-dialog" onOpenChange={open => {if (!open && !busy) onClose();}}>
      <form className="access-fields" onSubmit={save}>
        <label>公告标题<input className="csx-input w-full" name="title" required maxLength={120} defaultValue={item.title} placeholder="例如：新增「考试冲刺备考」与「我的收藏」功能"/></label>
        <div className="admin-two-col">
          <label>分类<select className="csx-select w-full" name="category" defaultValue={item.category}>
            {Object.entries(announcementCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>发布状态<select className="csx-select w-full" name="status" defaultValue={item.status}>
            {Object.entries(announcementStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
        </div>
        <label>公告正文<textarea className="csx-textarea w-full" name="content" rows={5} required maxLength={4000} defaultValue={item.content} placeholder="简要说明本次新功能亮点、使用入口或通知事项…"/></label>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)}/>
          <span>置顶优先提醒（优先展示在学员顶部公告条）</span>
        </label>
        {error && <p role="alert" className="csx-alert csx-alert-error">{error}</p>}
        <div className="admin-tools">
          <button type="button" className="csx-btn" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="csx-btn csx-btn-primary" disabled={busy}>
            <InlineSpinner active={busy}/>{busy ? '正在保存…' : '保存公告'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FeedbackReplyModal({item, onClose, onSaved}: {item: AdminFeedback; onClose: () => void; onSaved: () => void}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AdminFeedback['status']>(item.status === 'pending' ? 'replied' : item.status);
  const [reply, setReply] = useState(item.admin_reply || '');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminWrite('/feedback/' + item.id, 'PATCH', {status, adminReply: reply});
      onSaved();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="处理用户留言" description={`来自 ${item.username} · ${formatTime(item.created_at)}`} className="admin-dialog" onOpenChange={open => {if (!open && !busy) onClose();}}>
      <div className="admin-feedback-detail">
        <div className="admin-tools">
          <span className="csx-badge admin-status admin-status-info">{feedbackCategories[item.category] || item.category}</span>
          <Status value={item.status}/>
        </div>
        <h3>{item.title}</h3>
        <p>{item.content}</p>
      </div>
      <form className="access-fields" onSubmit={save}>
        <label>处理状态<select className="csx-select w-full" value={status} onChange={event => setStatus(event.target.value as AdminFeedback['status'])}>
          {Object.entries(feedbackStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>回复学员<textarea className="csx-textarea w-full" rows={4} maxLength={2000} value={reply} onChange={event => setReply(event.target.value)} placeholder="写下给学员的回复，学员在留言板页面即可看到…"/></label>
        {error && <p role="alert" className="csx-alert csx-alert-error">{error}</p>}
        <div className="admin-tools">
          <button type="button" className="csx-btn" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="csx-btn csx-btn-primary" disabled={busy}>
            <InlineSpinner active={busy}/>{busy ? '正在保存…' : '保存回复与状态'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {CheckCircle2, Clock3, MessageSquarePlus, Send, Sparkles, Trash2} from 'lucide-react';
import {
  feedbackCategories,
  feedbackStates,
  fetchMyFeedback,
  submitFeedback,
  withdrawFeedback,
  type LearnerFeedback,
} from '../../api/community-api';
import {InlineSpinner, PageSkeleton} from '../../components/shared/LoadingState';
import '../../styles/community.css';

const timeFormat = new Intl.DateTimeFormat('zh-CN', {dateStyle: 'short', timeStyle: 'short'});
const formatTime = (value?: string | null) => value ? timeFormat.format(new Date(value)) : '—';

export function FeedbackPage() {
  const [items, setItems] = useState<LearnerFeedback[] | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<LearnerFeedback['category']>('feature');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await fetchMyFeedback());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法读取留言记录，请重试。');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    setNotice('');
    try {
      const created = await submitFeedback({category, title, content});
      setItems(prev => [created, ...(prev || [])]);
      setTitle('');
      setContent('');
      setNotice('留言已发送给管理员，回复后会直接显示在下方列表。');
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : '发送失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    setNotice('');
    try {
      await withdrawFeedback(id);
      setItems(prev => (prev || []).filter(item => item.id !== id));
      setNotice('已撤回该条留言。');
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : '撤回失败，请重试。');
    } finally {
      setRemovingId('');
    }
  }

  const repliedCount = items?.filter(item => item.admin_reply).length ?? 0;

  return (
    <div className="page feedback-page">
      <header className="feedback-hero">
        <div className="feedback-hero-copy">
          <span className="feedback-hero-eyebrow"><Sparkles size={14} aria-hidden="true"/>直达管理员</span>
          <h1>留言板</h1>
          <p>想要什么新功能、发现题库或页面哪里不好用，或者单纯想说句话，都可以直接留在这里。管理员查看和回复后会同步显示。</p>
        </div>
        <div className="feedback-hero-stats">
          <div><span>已发留言</span><strong>{items ? items.length : '—'}</strong></div>
          <div><span>已获回复</span><strong>{items ? repliedCount : '—'}</strong></div>
        </div>
      </header>

      <div className="feedback-grid">
        <section className="feedback-panel feedback-compose" aria-labelledby="feedback-compose-title">
          <div className="feedback-panel-head">
            <h2 id="feedback-compose-title"><MessageSquarePlus size={18} aria-hidden="true"/>写一条留言</h2>
          </div>
          <form className="feedback-form" onSubmit={onSubmit}>
            <fieldset className="feedback-category-group">
              <legend>留言类型</legend>
              <div className="feedback-category-pills">
                {(Object.entries(feedbackCategories) as [LearnerFeedback['category'], string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="feedback-cat-pill"
                    aria-pressed={category === key}
                    onClick={() => setCategory(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="feedback-field">
              <span>标题</span>
              <input
                className="csx-input"
                type="text"
                required
                maxLength={120}
                placeholder="一句话概括你的想法或问题…"
                value={title}
                onChange={event => setTitle(event.target.value)}
              />
            </label>
            <label className="feedback-field">
              <span>详细内容</span>
              <textarea
                className="csx-textarea"
                rows={5}
                required
                maxLength={2000}
                placeholder="例如：希望增加什么功能、哪道题遇到了什么问题，或者想对平台说的话…"
                value={content}
                onChange={event => setContent(event.target.value)}
              />
              <small className="feedback-counter">{content.length} / 2000</small>
            </label>
            {formError && <p className="feedback-alert error" role="alert">{formError}</p>}
            {notice && <p className="feedback-alert success" role="status">{notice}</p>}
            <button type="submit" className="button primary feedback-submit" disabled={submitting}>
              <InlineSpinner active={submitting}/>
              {submitting ? '正在发送…' : <><Send size={15} aria-hidden="true"/>发送给管理员</>}
            </button>
          </form>
        </section>

        <section className="feedback-panel feedback-history" aria-labelledby="feedback-history-title">
          <div className="feedback-panel-head">
            <h2 id="feedback-history-title">我的留言记录</h2>
            <button type="button" className="button secondary" onClick={() => void load()}>刷新</button>
          </div>
          {error && <p className="feedback-alert error" role="alert">{error}</p>}
          {!items && !error && <PageSkeleton variant="cards" label="正在读取留言记录…"/>}
          {items && (items.length ? (
            <div className="feedback-list">
              {items.map(item => (
                <article key={item.id} className="feedback-item" data-status={item.status}>
                  <header className="feedback-item-head">
                    <div className="feedback-item-badges">
                      <span className="feedback-tag">{feedbackCategories[item.category] || item.category}</span>
                      <span className="feedback-status" data-status={item.status}>
                        {item.status === 'replied' || item.status === 'planned'
                          ? <CheckCircle2 size={12} aria-hidden="true"/>
                          : <Clock3 size={12} aria-hidden="true"/>}
                        {feedbackStates[item.status] || item.status}
                      </span>
                    </div>
                    <time>{formatTime(item.created_at)}</time>
                  </header>
                  <h3>{item.title}</h3>
                  <p className="feedback-item-body">{item.content}</p>
                  {item.admin_reply && (
                    <div className="feedback-reply-box">
                      <div className="feedback-reply-head">
                        <strong>管理员回复</strong>
                        {item.replied_at && <time>{formatTime(item.replied_at)}</time>}
                      </div>
                      <p>{item.admin_reply}</p>
                    </div>
                  )}
                  {item.status === 'pending' && (
                    <div className="feedback-item-foot">
                      <button
                        type="button"
                        className="feedback-withdraw"
                        disabled={removingId === item.id}
                        onClick={() => void remove(item.id)}
                      >
                        <Trash2 size={13} aria-hidden="true"/>{removingId === item.id ? '撤回中…' : '撤回留言'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="feedback-empty">
              <MessageSquarePlus size={28} aria-hidden="true"/>
              <p>还没有发过留言，左侧随时可以给管理员写一条。</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

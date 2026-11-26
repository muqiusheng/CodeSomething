import {useEffect, useMemo, useState} from 'react';
import {Bell, ChevronRight, Megaphone, Pin, Sparkles, X} from 'lucide-react';
import {announcementCategories, fetchAnnouncements, type Announcement} from '../../api/community-api';
import {localState} from '../../api/browser-state.mjs';
import {Modal} from '../../components/ui/modal';
import '../../styles/community.css';

const DISMISSED_KEY = 'cs-dismissed-announcements';
const timeFormat = new Intl.DateTimeFormat('zh-CN', {dateStyle: 'short', timeStyle: 'short'});

function announcementToken(item: Announcement) {
  return `${item.id}:${item.updated_at || item.created_at}`;
}

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localState.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(v => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveDismissed(tokens: string[]) {
  try {
    localState.setItem(DISMISSED_KEY, JSON.stringify(tokens.slice(-60)));
  } catch { /* Keep in memory when storage is unavailable. */ }
}

function formatDate(value?: string | null) {
  return value ? timeFormat.format(new Date(value)) : '';
}

export function useAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    let active = true;
    fetchAnnouncements()
      .then(data => { if (active) setItems(data); })
      .catch(() => { /* Announcements are non-blocking enhancements. */ });
    return () => { active = false; };
  }, []);

  const unread = useMemo(
    () => items.filter(item => !dismissed.includes(announcementToken(item))),
    [items, dismissed],
  );

  function dismiss(item: Announcement) {
    const token = announcementToken(item);
    setDismissed(prev => {
      if (prev.includes(token)) return prev;
      const next = [...prev, token];
      saveDismissed(next);
      return next;
    });
  }

  function markAllRead() {
    setDismissed(prev => {
      const next = Array.from(new Set([...prev, ...items.map(announcementToken)]));
      saveDismissed(next);
      return next;
    });
  }

  return {items, unread, dismiss, markAllRead};
}

export function AnnouncementBar({items, unread, onDismiss, onOpenAll}: {
  items: Announcement[];
  unread: Announcement[];
  onDismiss: (item: Announcement) => void;
  onOpenAll: (focus?: Announcement) => void;
}) {
  const active = unread[0];
  if (!active || items.length === 0) return null;
  const tag = announcementCategories[active.category] || '公告';
  return (
    <div className="site-announcement-bar" role="region" aria-label="全站公告" data-category={active.category}>
      <div className="site-announcement-main">
        <span className="site-announcement-pill">
          {active.category === 'feature' ? <Sparkles size={13} aria-hidden="true"/> : <Megaphone size={13} aria-hidden="true"/>}
          {active.pinned ? '置顶 · ' : ''}{tag}
        </span>
        <strong className="site-announcement-title">{active.title}</strong>
        <span className="site-announcement-excerpt">{active.content}</span>
      </div>
      <div className="site-announcement-actions">
        <button type="button" className="site-announcement-link" onClick={() => onOpenAll(active)}>
          查看详情{unread.length > 1 ? `（共 ${unread.length} 条新公告）` : ''}<ChevronRight size={14} aria-hidden="true"/>
        </button>
        <button type="button" className="site-announcement-close" aria-label="关闭本条公告提示" title="知道了" onClick={() => onDismiss(active)}>
          <X size={15} aria-hidden="true"/>
        </button>
      </div>
    </div>
  );
}

export function AnnouncementBell({unreadCount, onOpen}: {unreadCount: number; onOpen: () => void}) {
  return (
    <button
      type="button"
      className="theme-toggle announcement-bell"
      aria-label={unreadCount > 0 ? `全站公告（${unreadCount} 条未读）` : '全站公告'}
      title={unreadCount > 0 ? `全站公告（${unreadCount} 条未读）` : '全站公告'}
      onClick={onOpen}
    >
      <Bell size={17} aria-hidden="true"/>
      {unreadCount > 0 && <span className="announcement-dot" aria-hidden="true"/>}
    </button>
  );
}

export function AnnouncementCenterModal({open, onOpenChange, items, focus, onMarkAllRead}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Announcement[];
  focus?: Announcement | null;
  onMarkAllRead: () => void;
}) {
  useEffect(() => {
    if (open && items.length > 0) onMarkAllRead();
  }, [open, items.length, onMarkAllRead]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="全站公告" description="查看平台最新功能上线、备考提醒与维护通知。" className="announcement-modal">
      {items.length ? (
        <div className="announcement-list">
          {items.map(item => (
            <article key={item.id} className="announcement-card" data-focused={focus?.id === item.id || undefined} data-category={item.category}>
              <header className="announcement-card-head">
                <span className="announcement-tag" data-category={item.category}>
                  {item.pinned ? <Pin size={12} aria-hidden="true"/> : null}
                  {announcementCategories[item.category] || '公告'}
                </span>
                <time>{formatDate(item.published_at || item.created_at)}</time>
              </header>
              <h3>{item.title}</h3>
              <p className="announcement-body">{item.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="announcement-empty">暂无全站公告。</p>
      )}
    </Modal>
  );
}

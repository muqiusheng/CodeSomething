import {Bookmark as BookmarkIcon} from 'lucide-react';
import {useLocation} from 'react-router-dom';
import {useBookmarks,type BookmarkTarget} from './BookmarksProvider';

export function BookmarkButton({target,compact=false,tourTarget}:{target:BookmarkTarget;compact?:boolean;tourTarget?:string}) {
  const store = useBookmarks();
  if (!store) return null;
  const saved = store.items.some(item=>item.id===target.id);
  const label = saved ? '已收藏' : '收藏';
  return <button type="button" className="btn btn-ghost btn-sm bookmark-button" data-compact={compact} data-tour={tourTarget}
    aria-pressed={saved} aria-label={label+'：'+target.title}
    aria-busy={store.pending.has(target.id)||undefined}
    disabled={(!store.error && store.loading) || store.pending.has(target.id)}
    title={store.error ? '收藏读取失败，点击重试' : label}
    onClick={()=>store.error ? store.reload() : store.toggle(target)}>
    <BookmarkIcon size={16} fill={saved?'currentColor':'none'} aria-hidden="true"/>
    {!compact && <span>{label}</span>}
  </button>;
}

export function learningBookmarkTarget(title:string,source:string,href:string): BookmarkTarget {
  const id = 'outside.'+href.replace(/^\//,'').replaceAll('/','.').replace(/[?=&]/g,'.').replace(/[^a-zA-Z0-9_.-]/g,'-');
  return {id,category:'outside',title,source,href};
}

export function LearningBookmark({title,source,href,compact}: {title:string;source:string;href?:string;compact?:boolean}) {
  const {pathname} = useLocation();
  return <BookmarkButton target={learningBookmarkTarget(title,source,href ?? pathname)} compact={compact}/>;
}

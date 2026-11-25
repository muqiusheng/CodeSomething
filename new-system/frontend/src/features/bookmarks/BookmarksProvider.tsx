import {createContext,useContext,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {apiFetch,currentAccess} from '../../api/auth-api';
import {useScopedRead} from '../../hooks/useScopedRead';

export type BookmarkTarget = {id:string; category:'school'|'outside'; title:string; source:string; href:string};
export type Bookmark = BookmarkTarget & {createdAt:string};
const path = '/api/v1/bookmarks';

async function request<T>(suffix = '', init?: RequestInit): Promise<T> {
  const response = await apiFetch(path+suffix,{cache:'no-store',signal:AbortSignal.timeout(12000),...init});
  if (response.status===204) return undefined as T;
  const data = await response.json().catch(()=>null);
  if (!response.ok || data===null) throw new Error(data?.message || '暂时无法更新收藏，请重试。');
  return data as T;
}
const readBookmarks = () => request<Bookmark[]>();
const newestFirst = (a:Bookmark,b:Bookmark) => Date.parse(b.createdAt)-Date.parse(a.createdAt);
function change(items:Bookmark[],id:string,next:Bookmark|null) {
  const others = items.filter(item=>item.id!==id);
  return next ? [next,...others] : others;
}

type Store = {
  items:Bookmark[]; loading:boolean; error:string; pending:Map<string,Bookmark|null>;
  toggle:(target:BookmarkTarget)=>void; ensure:(target:BookmarkTarget)=>Promise<boolean>; reload:()=>void;
};
const BookmarksContext = createContext<Store|null>(null);

export function BookmarksProvider({children}:{children:ReactNode}) {
  const {data,error,reload,setData} = useScopedRead(path,readBookmarks,{refreshOnFocus:true,staleTime:0});
  const latest = useRef(data);
  useLayoutEffect(()=>{latest.current=data;},[data]);
  const pendingRef = useRef(new Map<string,Bookmark|null>());
  const [pending,setPending] = useState(pendingRef.current);
  const [notice,setNotice] = useState('');

  function updatePending(id:string,value?:Bookmark|null) {
    const next = new Map(pendingRef.current);
    if (value===undefined) next.delete(id);
    else next.set(id,value);
    pendingRef.current=next;
    setPending(next);
  }

  async function update(target:BookmarkTarget,keep=false) {
    if (!latest.current || pendingRef.current.has(target.id)) return false;
    const owner = currentAccess().user?.userId;
    const adding = !latest.current.some(item=>item.id===target.id);
    if (keep && !adding) return true;
    updatePending(target.id,adding ? {...target,createdAt:new Date().toISOString()} : null);
    setNotice('');
    try {
      const saved = adding
        ? await request<Bookmark>('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(target)})
        : await request<void>('/'+target.id,{method:'DELETE'}).then(()=>null);
      if (currentAccess().user?.userId !== owner) return false;
      latest.current=change(latest.current ?? [],target.id,saved);
      setData(latest.current);
      return true;
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : '收藏未保存，请重试。');
      return false;
    } finally {
      updatePending(target.id);
    }
  }

  const items = Array.from(pending).reduce((list,[id,optimistic])=>change(list,id,optimistic),data ?? []).slice().sort(newestFirst);
  return <BookmarksContext.Provider value={{items,error,loading:data===null,reload,pending,toggle:target=>void update(target),ensure:target=>update(target,true)}}>
    {children}
    {notice && <div className="bookmark-notice" role="alert">{notice}<button className="btn btn-ghost btn-sm" onClick={()=>setNotice('')}>关闭</button></div>}
  </BookmarksContext.Provider>;
}

export function useBookmarks() {
  return useContext(BookmarksContext);
}

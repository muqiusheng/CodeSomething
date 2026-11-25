import {ArrowRight,Bookmark as BookmarkIcon,BookmarkMinus} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {PageSkeleton} from '../../components/shared/LoadingState';
import {useBookmarks,type Bookmark} from './BookmarksProvider';
import '../../styles/bookmarks.css';

const tabs = [{id:'all',label:'全部'},{id:'school',label:'课内必学'},{id:'outside',label:'课外拓展'}] as const;
const date = new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'});

export function BookmarksPage() {
  const store = useBookmarks();
  if (!store) return null;
  return <div className="page study-profile bookmarks-page">
    <header className="study-heading"><div><h1>我的收藏</h1><p>把想再看一遍的题目和章节放在这里，随时回到原处。</p></div></header>
    <Tabs defaultValue="all">
      <TabsList className="exam-route-tabs study-profile-tabs" aria-label="收藏分类">
        {tabs.map(tab=><TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map(tab=><TabsContent key={tab.id} value={tab.id} className="study-section">
        {store.error ? <div className="card study-panel" role="alert"><p>{store.error}</p><button type="button" className="btn button secondary" onClick={store.reload}>重新读取</button></div>
          : store.loading ? <PageSkeleton variant="cards" label="正在读取收藏…"/>
          : <BookmarkList items={store.items.filter(item=>tab.id==='all'||item.category===tab.id)}
            category={tab.id} remove={store.toggle}/>}
      </TabsContent>)}
    </Tabs>
  </div>;
}

function BookmarkList({items,category,remove}: {items:Bookmark[];category:(typeof tabs)[number]['id'];remove:(item:Bookmark)=>void}) {
  if (!items.length) return <section className="card study-panel bookmark-empty">
    <BookmarkIcon size={26} aria-hidden="true"/><h2>这里还没有收藏</h2>
    <p>练题或学习章节时，点击「收藏」，之后就能从这里回来。</p>
    <div className="button-row">
      {category!=='outside' && <Link className="btn button secondary" to="/school">去课内实验</Link>}
      {category!=='school' && <Link className="btn button secondary" to="/projects">去课外项目库</Link>}
    </div>
  </section>;
  return <ul className="bookmark-list">
    {items.map(item=><li className="card study-panel bookmark-record" key={item.id}>
      <div className="bookmark-meta"><span className="badge" data-category={item.category}>{item.category==='school'?'课内必学':'课外拓展'}</span>
        <span>{item.source}</span><time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time></div>
      <h2>{item.title}</h2>
      <div className="bookmark-actions">
        <Link className="btn button secondary" to={item.href}>打开原位置<ArrowRight size={15} aria-hidden="true"/></Link>
        <button className="btn btn-ghost btn-sm bookmark-remove" type="button" aria-label={'取消收藏：'+item.title} onClick={()=>remove(item)}>
          <BookmarkMinus size={15} aria-hidden="true"/>取消收藏
        </button>
      </div>
    </li>)}
  </ul>;
}

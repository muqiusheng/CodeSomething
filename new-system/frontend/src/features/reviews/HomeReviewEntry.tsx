import {Link} from 'react-router-dom';
import {ArrowRight, Radar} from 'lucide-react';
import {useLearnerResource,type ReviewQueue} from '../../api/learner-api';

export function HomeReviewEntry(){
 const {data,error,reload}=useLearnerResource<ReviewQueue>('/reviews');
 const pending=data?.history.filter(round=>round.status==='open')||[];
 const due=data?.items.filter(item=>item.recommended&&item.lastStatus!=='open')||[];
 return <section className="review-card review-entry" aria-labelledby="home-review-title">
  <div className="section-heading"><h2 id="home-review-title"><Radar size={19} aria-hidden="true"/>复习雷达</h2>{(error||data)&&<span className="home-status">{error?'读取失败':pending.length||due.length?'有待复习':'已清空'}</span>}</div>
  {error?<><p role="status">复习暂未加载。</p><button type="button" className="btn button secondary" onClick={reload}>重新加载复习</button></>
   :!data?<><div className="home-review-counts home-review-loading loading-delay" aria-hidden="true">
    <span><i className="loading-line"/><i className="loading-line"/></span>
    <span><i className="loading-line"/><i className="loading-line"/></span>
   </div><p className="sr-only" role="status">正在读取复习安排…</p><div className="home-review-text-placeholder" aria-hidden="true"/></>
   :<><div className="home-review-counts"><span><strong>{pending.length}</strong>待作答</span><span><strong>{due.length}</strong>到期建议</span></div><p>{pending.length?pending[0].skill.title+' · 有一轮待作答':due.length?`${due.length}项待巩固 · ${due[0].skill.title}`:'暂无待复习项，可以主动选题。'}</p></>}
  <Link className="btn button secondary home-review-action" to="/reviews">查看复习安排<ArrowRight size={15} aria-hidden="true"/></Link>
 </section>;
}

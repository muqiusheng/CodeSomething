import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import {learningRequest} from '../../api/learning-api';
type Entry={id:string;theme:string;state:string;route:string;checks:unknown[];visits:unknown[]};
export function PortfolioEntry(){
 const [works,setWorks]=useState<Entry[]>([]);const [error,setError]=useState('');
 useEffect(()=>{let live=true;void learningRequest<Entry[]>('/portfolio').then(v=>{if(live)setWorks(v)}).catch(()=>{if(live)setError('作品记录暂时无法读取。')});return()=>{live=false}},[]);
 if(!works.length&&!error)return null;
 return <section className="profile-panel portfolio-resume"><div className="section-heading"><h2>独立作品</h2><Link to="/portfolio">全部作品<ArrowRight size={15} aria-hidden="true"/></Link></div>{error?<p>{error} <Link to="/portfolio">打开作品重试</Link></p>:<><h3>{works[0].theme}</h3><p>{works[0].checks.length}次工程检查 · {works[0].visits.length}次实际回访 · 独立程度待回访核实</p><Link className="button secondary" to={works[0].route}>继续作品<ArrowRight size={15} aria-hidden="true"/></Link></>}</section>;
}

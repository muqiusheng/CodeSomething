import {InlineSpinner} from '../../components/shared/LoadingState';
import {apiFetch} from '../../api/auth-api';
import {useEffect,useState} from 'react';
import {learningRequest} from '../../api/learning-api';
import {Bot, Check, RefreshCw, ShieldCheck, WifiOff} from 'lucide-react';
type Connection={status:string;message:string;model?:string};
export function TutorConnection(){
 const [connection,setConnection]=useState<Connection|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;void learningRequest<Connection>('/tutor/connection').then(value=>{if(live)setConnection(value)}).catch(()=>{if(live)setError('暂时无法读取连接，请检查本机服务。')});return()=>{live=false}},[]);
 async function check(){setBusy(true);setError('');try{const response=await apiFetch('/api/v1/tutor/connection',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw new Error(result.message);setConnection(result as Connection)}catch(e){setError(e instanceof Error?e.message:'连接检查失败，请重试。')}finally{setBusy(false)}}
 const ready=connection?.status==='ready'&&!error;
 const state=busy?'checking':error?'error':ready?'ready':'idle';
 const StatusIcon=ready?Check:WifiOff;
 return <section className="profile-panel connection-settings settings-refined" aria-labelledby="connection-title">
  <div className="connection-heading"><div className="settings-section-title"><span className="settings-symbol"><Bot size={21} aria-hidden="true"/></span><div><h2 id="connection-title">模型连接</h2><p>网页中的 AI 学习辅导</p></div></div><span className="connection-badge" data-state={state}>{busy?<InlineSpinner/>:<StatusIcon size={15} aria-hidden="true"/>}{busy?'检查中':ready?'已连接':error?'连接异常':'待检查'}</span></div>
  <div className="connection-provider"><div><strong>本机 ChatGPT</strong><p>按章节选择上下文，支持流式回答、停止和恢复。</p></div><div className="connection-model"><span>当前模型</span><code>{connection?.model||'检查后获取'}</code></div></div>
  <div className="connection-footer"><p className="connection-policy"><ShieldCheck size={16} aria-hidden="true"/><span>使用本机 ChatGPT 登录额度<br/><span>不会自动切换至付费 API</span></span></p><button className="button secondary" type="button" disabled={busy} onClick={()=>void check()}>{busy?<InlineSpinner/>:<RefreshCw size={15} aria-hidden="true"/>}{busy?'正在检查…':'检查连接'}</button></div>
  <div className="connection-result" data-state={state} role="status">{error||(!busy&&connection?.status!=='ready'?connection?.message:'')|| (busy?'正在确认本机 ChatGPT 是否可用…':'')}</div>
 </section>;
}

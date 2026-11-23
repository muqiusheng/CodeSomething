import {InlineSpinner} from '../../components/shared/LoadingState';
import {localState} from '../../api/browser-state.mjs';
import {Link,useLocation} from 'react-router-dom';
import {useEffect, useState} from 'react';
import {Check} from 'lucide-react';
import {usePreferences, updatePreferences, type LearningPreferences} from '../../api/api';
import {MotionSettings} from '../../components/shared/WorkspaceExtras';
import {TutorConnection} from './TutorConnection';
import {ThemeSettings} from '../../components/shared/ThemeControls';
import '../../styles/settings.css';

function localDuration() {try {const value=localState.getItem('cs-duration');return value&&['30','60','90'].includes(value)?value:'60';} catch {return '60';}}

export function SettingsPage() {
 const location=useLocation();useEffect(()=>{if(location.hash){requestAnimationFrame(()=>{document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});document.getElementById(location.hash.slice(1))?.focus({preventScroll:true})})}},[location.hash]);
  const [duration, setDuration] = useState(localDuration);
  const {data:saved,error:readError,setData:setSaved}=usePreferences();
  const loading=!saved&&!readError;
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [writeFailed, setWriteFailed] = useState(false);
  const connected=!!saved&&!writeFailed;
  useEffect(()=>{if(saved)setDuration(String(saved.dailyMinutes));},[saved]);

  async function saveDuration() {
    setSaving(true); setStatus('');
    let cached=false;
    try {localState.setItem('cs-duration', duration);cached=true;} catch { /* Report actual persistence below. */ }
    try {
      const result = await updatePreferences({dailyMinutes: Number(duration)});
      setSaved(result); setWriteFailed(false); setStatus('已保存到本机数据库');
    } catch {
      setWriteFailed(true);
      if(cached)window.dispatchEvent(new CustomEvent('learning-duration',{detail:duration}));
      setStatus(cached?'未保存到本机数据库，已保存在此浏览器。可再次保存以重试。':'保存失败，请再次保存以重试。');
    } finally {setSaving(false);}
  }
  async function saveMotion(motion: string) {
    setSaving(true);
    try {
      const result = await updatePreferences({motion: motion as LearningPreferences['motion']});
      setSaved(result); setWriteFailed(false);
    } catch (error) {setWriteFailed(true); throw error;} finally {setSaving(false);}
  }

  return <div className="page narrow">
    <Link className="back-link" to="/profile">← 个人中心</Link><div className="page-title"><h1>设置</h1></div>
    <div id="appearance" tabIndex={-1} className="settings-section-anchor"><ThemeSettings/></div>
    <section id="learning" tabIndex={-1} className="profile-panel settings-section-anchor">
      <div className="section-heading"><h2>学习偏好</h2><span className="text-pill">{loading ? '正在连接…' : connected ? '本机数据库' : '浏览器本地'}</span></div>
      <form onSubmit={event => {event.preventDefault(); void saveDuration();}}>
        <label className="field-label" htmlFor="duration">每日计划时长</label>
        <select name="duration" id="duration" disabled={loading || saving} value={duration} onChange={event => {setDuration(event.target.value); setStatus('');}}>
          <option value="30">30 分钟</option><option value="60">60 分钟</option><option value="90">90 分钟</option>
        </select>
        <button className="button primary" type="submit" disabled={loading || saving}>{saving ? '保存中…' : '保存偏好'}{saving?<InlineSpinner/>:<Check size={15} aria-hidden="true"/>}</button>
        <span className="save-status" role="status">{status}</span>
      </form>
    </section>
    <div id="model" tabIndex={-1} className="settings-section-anchor"><TutorConnection/></div>
    <section className="profile-panel"><div className="section-heading"><h2>项目与 IDE</h2><span className="text-pill">本地工程与网页检查</span></div><p>先在本地IDE创建与开发工程，再在网页连接同一份源码、保存和检查。HTTP、Boot及项目A/B支持网页编辑写回授权文件；SQL使用脚本导入，其他项目按页面说明操作。</p></section>
    <MotionSettings value={saved?.motion} onSave={saveMotion} disabled={loading || saving}/>
  </div>;
}

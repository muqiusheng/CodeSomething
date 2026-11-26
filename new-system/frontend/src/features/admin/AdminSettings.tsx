import {useEffect, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {ThemeSettings} from '../../components/shared/ThemeControls';
import {MotionSettings} from '../../components/shared/WorkspaceExtras';
import {adminOptions, setAdminPreference, useAdminPreferences} from './admin-preferences';
import '../../styles/settings.css';

const labels = {
  palette:'管理端配色模式',density:'表格密度',pageSize:'默认每页条数',
  refresh:'自动刷新频率',home:'登录后台默认首页',exportFormat:'实验报告默认导出格式',
};

export function AdminSettings() {
  const preferences = useAdminPreferences();
  const {hash} = useLocation();
  const [notice,setNotice] = useState('');
  useEffect(() => {
    if (hash !== '#appearance') return;
    const section = document.getElementById('appearance');
    section?.scrollIntoView({block:'start'});
    section?.focus({preventScroll:true});
  },[hash]);

  function control(name: keyof typeof adminOptions) {
    return <label key={name} className="admin-setting">
      <span>{labels[name]}</span>
      <select className="csx-select" value={preferences[name]} onChange={event =>
        setNotice(setAdminPreference(name,event.target.value) ? '偏好已保存' : '偏好已在此标签页生效，浏览器存储不可用。')}>
        {Object.entries(adminOptions[name]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>;
  }

  return <>
    <div className="admin-heading"><h1>设置</h1></div>
    <div id="appearance" tabIndex={-1} className="settings-section-anchor"><ThemeSettings/></div>
    <section className="admin-card admin-settings">
      <h2>控制台配色</h2>
      {control('palette')}
    </section>
    <MotionSettings/>
    <section className="admin-card admin-settings">
      <h2>工作区偏好</h2>
      <div className="admin-settings-grid">{(['density','pageSize','refresh','home','exportFormat'] as const).map(control)}</div>
    </section>
    {notice && <p className="admin-settings-notice" role="status">{notice}</p>}
  </>;
}

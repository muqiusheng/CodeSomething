import {useState} from 'react';
import {Sun, Moon, Monitor, Check} from 'lucide-react';
import {useTheme, type ThemePreference} from '../../theme/theme';

export function ThemeToggle() {
  const {resolved, setTheme} = useTheme();
  const dark = resolved === 'dark';
  return <button className="theme-toggle" type="button" aria-label={dark ? '切换到浅色模式' : '切换到深色模式'} title={dark ? '切换到浅色模式' : '切换到深色模式'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
    {dark ? <Sun size={18} aria-hidden="true"/> : <Moon size={18} aria-hidden="true"/>}
  </button>;
}

const options = [
  {value: 'light', name: '浅色模式', detail: '薄荷绿 · 樱花粉 · 杏橙', Icon: Sun},
  {value: 'dark', name: '深色模式', detail: '深靛紫 · 亮粉 · 天蓝', Icon: Moon},
  {value: 'system', name: '跟随系统', detail: '随设备外观自动切换', Icon: Monitor},
] as const;

export function ThemeSettings() {
  const {preference, setTheme} = useTheme();
  const [status, setStatus] = useState('');
  function choose(value: ThemePreference) {
    setStatus(setTheme(value) ? '外观已保存到此浏览器' : '外观已切换，此浏览器无法保存偏好');
  }
  return <section className="profile-panel theme-settings" aria-labelledby="appearance-title">
    <div className="section-heading"><h2 id="appearance-title">外观</h2><span className="text-pill">立即生效</span></div>
    <fieldset className="theme-options"><legend className="sr-only">选择界面外观</legend>
      {options.map(({value, name, detail, Icon}) => <label className="theme-option" key={value} data-preview-theme={value}>
        <input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => choose(value)}/>
        <span className="theme-preview" aria-hidden="true"><span className="theme-preview-rail"/><span className="theme-preview-body"><i/><i/><i/></span></span>
        <span className="theme-option-title"><Icon size={17} aria-hidden="true"/>{name}{preference === value && <Check size={16} aria-hidden="true"/>}</span>
        <span className="theme-option-detail">{detail}</span>
      </label>)}
    </fieldset>
    <p className="save-status" role="status">{status}</p>
  </section>;
}

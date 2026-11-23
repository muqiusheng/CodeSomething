import {useId, useRef, useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Sun, Moon, Monitor, Palette, Check} from 'lucide-react';
import {useTheme, type ThemePreference} from '../../theme/theme';

const modes = [
  {value: 'light', name: '浅色模式', short: '浅色', Icon: Sun},
  {value: 'dark', name: '深色模式', short: '深色', Icon: Moon},
  {value: 'system', name: '跟随系统', short: '跟随系统', Icon: Monitor},
] as const;

function ModeOptions({preference, onChange, compact = false}: {
  preference: ThemePreference;
  onChange: (value: ThemePreference) => void;
  compact?: boolean;
}) {
  const name = useId();
  return <fieldset className="theme-options">
    <legend>明暗模式</legend>
    <div className="theme-mode-grid">
      {modes.map(({value, name: label, short, Icon}) => <label className="theme-option theme-mode" key={value}>
        <input type="radio" name={name} value={value} checked={preference === value} onChange={() => onChange(value)}/>
        {!compact && <Icon size={17} aria-hidden="true"/>}
        <span>{compact ? short : label}</span>
        {preference === value && <Check className="theme-check" size={16} aria-hidden="true"/>}
      </label>)}
    </div>
  </fieldset>;
}

export function ThemeToggle() {
  const {preference, resolved, palette, setTheme, setPalette, palettes} = useTheme();
  const name = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dark = resolved === 'dark';
  const toggleLabel = dark ? '切换到浅色模式' : '切换到深色模式';

  return <div className="theme-controls">
    <button className="theme-toggle" type="button" aria-label={toggleLabel} title={toggleLabel} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun size={18} aria-hidden="true"/> : <Moon size={18} aria-hidden="true"/>}
    </button>
    <Dialog.Root modal={false}>
      <Dialog.Trigger ref={trigger} className="theme-toggle palette-toggle" aria-label="选择配色方案" title="选择配色方案">
        <Palette size={18} aria-hidden="true"/>
      </Dialog.Trigger>
      <Dialog.Content className="palette-popover" aria-describedby={undefined} onCloseAutoFocus={event => {
        event.preventDefault();
        trigger.current?.focus({preventScroll: true});
      }}>
        <Dialog.Title className="sr-only">外观快捷设置</Dialog.Title>
        <ModeOptions preference={preference} onChange={setTheme} compact/>
        <fieldset className="theme-options">
          <legend>配色方案</legend>
          <div className="palette-quick-list">
            {palettes.map(({id, name: label}) => <label className="theme-option palette-quick-option" key={id}>
              <input type="radio" name={name} value={id} checked={palette === id} onChange={() => setPalette(id)}/>
              <span className="palette-swatches" data-palette={id} data-theme={resolved} aria-hidden="true"><i/><i/></span>
              <span>{label}</span>
              {id === 'emerald' && <span className="palette-badge">主配色</span>}
              {palette === id && <Check className="theme-check" size={16} aria-hidden="true"/>}
            </label>)}
          </div>
        </fieldset>
      </Dialog.Content>
    </Dialog.Root>
  </div>;
}

export function ThemeSettings() {
  const {preference, resolved, palette, setTheme, setPalette, palettes} = useTheme();
  const name = useId();
  const [status, setStatus] = useState('');
  function report(saved: boolean) {
    setStatus(saved ? '外观已保存到此浏览器' : '外观已切换，此浏览器无法保存偏好');
  }

  return <section className="profile-panel theme-settings" aria-labelledby="appearance-title">
    <div className="section-heading"><h2 id="appearance-title">外观</h2></div>
    <ModeOptions preference={preference} onChange={value => report(setTheme(value))}/>
    <fieldset className="theme-options">
      <legend>选择配色方案</legend>
      <div className="palette-grid">
        {palettes.map(({id, name: label, detail, badge}) => <label className="theme-option palette-card" key={id}>
          <input type="radio" name={name} value={id} checked={palette === id} onChange={() => report(setPalette(id))}/>
          <span className="theme-preview" data-palette={id} data-theme={resolved} aria-hidden="true">
            <span className="theme-preview-rail"/><span className="theme-preview-body"><i/><i/><i/></span>
          </span>
          <span className="theme-option-copy">
            <span className="theme-option-title">
              <span>{label}</span>
              {badge && <span className="palette-badge">{badge}</span>}
              {palette === id && <Check className="theme-check" size={16} aria-hidden="true"/>}
            </span>
            <span className="theme-option-detail">{detail}</span>
          </span>
        </label>)}
      </div>
    </fieldset>
    <p className="save-status" role="status">{status}</p>
  </section>;
}

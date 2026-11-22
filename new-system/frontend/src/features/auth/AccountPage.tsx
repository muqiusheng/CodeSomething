import {BrandMark} from '../../components/layout/BrandMark';
import {useState, type FormEvent} from 'react';
import {Link, Navigate, useLocation, useNavigate, useSearchParams} from 'react-router-dom';
import {credentials, changePassword, logout, type User} from '../../api/auth-api';
import {ThemeToggle} from '../../components/shared/ThemeControls';
import {useAuth} from './AuthContext';

type Mode = 'login' | 'register' | 'password';

function safeDestination(value: string | null, role?: User['role']) {
  if (value?.startsWith('/') && !value.startsWith('//') && !/[\\\x00-\x20]/.test(value)) {
    const url = new URL(value, window.location.origin);
    const adminPath = /^\/admin(?:\/|$)/i.test(url.pathname);
    if (url.origin === window.location.origin && !/^\/(login|register|change-password)(?:\/|$)/i.test(url.pathname)
      && (!role || adminPath === (role === 'ROLE_ADMIN')))
      return url.pathname + url.search + url.hash;
  }
  return role === 'ROLE_ADMIN' ? '/admin/overview' : '/learn';
}

export function AccountPage({mode}: {mode: Mode}) {
  const {user, config} = useAuth();
  const {hash} = useLocation();
  const [parameters] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const destination = safeDestination(parameters.get('redirect'), user?.role);
  const redirect = '?redirect=' + encodeURIComponent(destination);
  const registration = mode === 'register';
  const invite = registration ? new URLSearchParams(hash.slice(1)).get('invite') || '' : '';
  const changing = mode === 'password';
  const title = registration ? '创建学习账户' : changing ? '修改密码' : '登录 CodeSomething';

  if (!config?.enabled) return <Navigate replace to="/learn"/>;
  if (changing && !user) return <Navigate replace to={'/login' + redirect}/>;
  if (!changing && user) return <Navigate replace to={user.passwordChangeRequired ? '/change-password' + redirect : destination}/>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
    setBusy(true);
    setError('');
    try {
      if (changing) {
        await changePassword(data);
        navigate(destination, {replace: true});
      } else {
        await credentials(mode, data);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '请求失败，请重试。');
    } finally { setBusy(false); }
  }

  return <div className="access-page">
    <header className="access-header">
      <span className="access-wordmark"><BrandMark/>CodeSomething</span>
      <ThemeToggle/>
    </header>
    <main className="access-shell">
      <section className="access-panel" aria-labelledby="account-title">
        <h1 id="account-title">{title}</h1>
        {changing && user?.passwordChangeRequired && <p>首次使用临时密码登录后，请设置新密码。</p>}
        <form className="access-fields" onSubmit={submit} aria-busy={busy}>
          {!changing && <label>用户名<input className="csx-input" name="username" autoComplete="username" spellCheck={false} required maxLength={32} pattern={registration ? '[A-Za-z0-9_\\-]{3,32}' : undefined}/></label>}
          {registration && <label>邮箱<input className="csx-input" name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254}/></label>}
          <label>{changing ? '当前密码' : '密码'}<input className="csx-input" name={changing ? 'currentPassword' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} type="password" required minLength={registration ? 12 : undefined} maxLength={72}/></label>
          {changing && <label>新密码<input className="csx-input" name="newPassword" autoComplete="new-password" type="password" required minLength={12} maxLength={72}/></label>}
          {(registration || changing) && <small>至少12个字符，最多72字节。</small>}
          {registration && config.inviteRequired && <label>邀请码<input key={invite} className="csx-input" name="inviteCode" defaultValue={invite.length <= 100 ? invite : ''} autoComplete="off" spellCheck={false} required maxLength={100}/></label>}
          {error && <div role="alert" className="csx-alert csx-alert-error">{error}</div>}
          <button className="csx-btn csx-btn-primary" disabled={busy} type="submit">{busy ? '正在提交…' : changing ? '保存新密码' : registration ? '注册' : '登录'}</button>
        </form>
        {!changing && <p className="access-alternate">{registration ? '已有账户？' : '首次使用？'} <Link to={(registration ? '/login' : '/register') + redirect}>{registration ? '去登录' : '创建账户'}</Link></p>}
        {changing && !user?.passwordChangeRequired && <Link to={destination}>取消修改</Link>}
        {changing && user?.passwordChangeRequired && <button type="button" className="csx-btn csx-btn-ghost" disabled={busy} onClick={() => {
          setBusy(true);setError('');
          void logout().catch(failure => {setBusy(false);setError(failure instanceof Error ? failure.message : '无法退出，请重试。');});
        }}>退出登录</button>}
      </section>
    </main>
  </div>;
}

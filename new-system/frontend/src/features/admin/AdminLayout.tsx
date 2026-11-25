import {BrandMark} from '../../components/layout/BrandMark';
import {useEffect, useRef} from 'react';
import {Link, NavLink, Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {Activity, BookOpen, FileClock, GraduationCap, LayoutDashboard, Server, UsersRound} from 'lucide-react';
import {ThemeToggle} from '../../components/shared/ThemeControls';
import {PersonalMenu} from '../../components/layout/PersonalMenu';
import {AdminOverview} from './AdminOverview';
import {AdminUsers} from './AdminUsers';
import {AdminSubmissions} from './AdminSubmissions';
import {AdminSchool} from './AdminSchool';
import {AdminRunners} from './AdminRunners';
import {AdminAudit} from './AdminAudit';
import {AdminQuestions} from './AdminQuestions';
import '../../styles/admin.css';

const views = [
  {key: 'overview', label: '概览', icon: LayoutDashboard, screen: AdminOverview},
  {key: 'users', label: '用户管理', icon: UsersRound, screen: AdminUsers},
  {key: 'submissions', label: '评测作业', icon: Activity, screen: AdminSubmissions},
  {key: 'school', label: '课内实验', icon: GraduationCap, screen: AdminSchool},
  {key: 'questions', label: '题库', icon: BookOpen, screen: AdminQuestions},
  {key: 'runners', label: '运行环境', icon: Server, screen: AdminRunners},
  {key: 'audit', label: '审计日志', icon: FileClock, screen: AdminAudit},
];

export function AdminLayout() {
  const {pathname} = useLocation();
  const navigation = useRef<HTMLElement>(null);
  const title = views.find(view => pathname === '/admin/' + view.key)?.label;
  useEffect(() => {
    document.title = title ? title + ' · 码起步 管理控制台' : '码起步 管理控制台';
    window.scrollTo(0, 0);
  }, [title]);
  useEffect(() => {
    const nav = navigation.current;
    if (nav && nav.scrollWidth > nav.clientWidth) {
      const current = nav.querySelector('[aria-current="page"]');
      current?.scrollIntoView({block:'nearest',inline:'center'});
    }
  }, [pathname]);
  return <div className="admin-layout">
    <a className="skip" href="#main">跳到主要内容</a>
    <header className="admin-header">
      <Link className="access-wordmark" to="/admin/overview"><BrandMark/>管理控制台</Link>
      <div className="admin-tools"><ThemeToggle/><PersonalMenu compact/></div>
    </header>
    <div className="admin-body">
      <nav ref={navigation} className="admin-nav" aria-label="管理导航">
        {views.map(({key, label, icon: Icon}) => <NavLink key={key} to={'/admin/' + key}><Icon size={18} aria-hidden="true"/>{label}</NavLink>)}
      </nav>
      <main id="main" className="admin-main" tabIndex={-1}>
        <div className="admin-crumb"><Link to="/admin/overview">管理控制台</Link>{title && <span aria-current="page">{title}</span>}</div>
        <Routes>
          <Route index element={<Navigate replace to="overview"/>}/>
          {views.map(({key, screen: Screen}) => <Route key={key} path={key} element={<Screen/>}/>)}
          <Route path="*" element={<><h1>页面不存在</h1><Link to="/admin/overview">返回概览</Link></>}/>
        </Routes>
      </main>
    </div>
  </div>;
}

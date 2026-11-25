import {BookmarksProvider} from './features/bookmarks/BookmarksProvider';
import {BookmarksPage} from './features/bookmarks/BookmarksPage';
import {PageSkeleton} from './components/shared/LoadingState';
import {localState} from './api/browser-state.mjs';
import {initializeAccess, currentAccess} from './api/auth-api';
import {SupplementalPractice} from './features/reviews/SupplementalPractice';
import {AuthProvider,useAuth} from './features/auth/AuthContext';
import {RequireAuth} from './features/auth/RequireAuth';
import {AccountPage} from './features/auth/AccountPage';
import './styles/access.css';
import {TliasLearning} from './features/learning/tlias/TliasLearning';
import {BrandMark} from './components/layout/BrandMark';
import {PersonalMenu} from './components/layout/PersonalMenu';
import {ProjectStudio} from './features/projects/ProjectStudio';
import {GeneratedLearning} from './features/projects/GeneratedLearning';
import React, {useState, useEffect} from 'react';
import {receiveIdeHandoff} from './api/ide-handoff';
import {learningRequest} from './api/learning-api';
import {createRoot} from 'react-dom/client';
import {createBrowserRouter, createRoutesFromElements, Outlet, RouterProvider, Routes, Route, NavLink, Link, useLocation, useSearchParams} from 'react-router-dom';
import {Bookmark,ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Circle, Clock3, Compass, Copy, ExternalLink, FileCode2, Folder, GraduationCap, Home, Layers3, Menu, RotateCcw, Settings, ShieldCheck, Terminal, Trophy, UserRound, X,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {SchoolReviewRadar,useSchoolCourses} from './features/school/SchoolLearningProgress';
import {SchoolHome} from './features/school/SchoolHome';
const SchoolLabWorkspace = React.lazy(() => import('./features/school/SchoolLabWorkspace').then(m => ({default: m.SchoolLabWorkspace})));
const ExamHall = React.lazy(() => import('./features/school/exams/ExamHall'));
const ExamMistakes = React.lazy(() => import('./features/school/exams/ExamMistakes'));
const ExamWorkspace = React.lazy(() => import('./features/school/exams/ExamWorkspace'));
const ExamReport = React.lazy(() => import('./features/school/exams/ExamReport'));
import {Dashboard} from './features/home/Dashboard';
import {BootLearning} from './features/learning/boot/BootLearning';
import {LearnerProfile} from './features/profile/LearnerProfile';
import {SqlLearning} from './features/learning/sql/SqlLearning';
import {SettingsPage} from './features/settings/SettingsPage';
import {usePreferences, cachePreferences} from './api/api';
import {LearningPath} from './features/projects/LearningPath';
import {Journey as FullJourney} from './features/learning/journey/Journey';
import {LessonWorkspace} from './features/learning/http/LessonWorkspace';
import {QuickNavigation} from './components/layout/QuickNavigation';
import {ProjectBrowser} from './features/projects/ProjectBrowser';
import {FoundationProject} from './features/projects/FoundationProject';
import {ReviewPractice} from './features/reviews/ReviewPractice';
const IndependentPortfolio=React.lazy(()=>import('./features/portfolio/Portfolio').then(m=>({default:m.Portfolio})));
import {usePointerFeedback} from './hooks/usePointerFeedback';
import {useMysqlActivity} from './hooks/useMysqlActivity';
import './styles/styles.css';
import './styles/loading.css';
import './styles/design-system.css';
import './styles/learning.css';
import './styles/themes.css';
import './styles/navigation.css';
import './styles/coding-layout.css';
import './styles/report-refinements.css';
import {HeaderNavigation} from './components/layout/HeaderNavigation';
import {ThemeToggle} from './components/shared/ThemeControls';
const AdminLayout = React.lazy(() => import('./features/admin/AdminLayout').then(module => ({default: module.AdminLayout})));

const lesson='/learn/http-json/1.0/json-response';
const coreNav=[{to:'/learn',label:'首页',icon:Home},{to:'/school',label:'课内实验',icon:GraduationCap},{to:'/reviews',label:'复习',icon:RotateCcw},{to:'/bookmarks',label:'我的收藏',icon:Bookmark}];
const optionalNav=[{to:'/projects',label:'项目库',icon:Folder},{to:'/path',label:'拓展路线',icon:Compass},{to:'/portfolio',label:'独立作品',icon:Trophy}];
const nav=[...coreNav,...optionalNav];
const stages=[{name:'基础模块',tag:'当前阶段',desc:'读懂请求，写出第一个接口。',skills:'HTTP / JSON · SQL · Spring Boot',count:'3 个模块',icon:BookOpen},{name:'第一个后端项目',tag:'项目 A',desc:'从零搭建个人任务管理，完成数据库与 CRUD。',skills:'数据建模 · REST API · 自动化测试',count:'6 个关卡',icon:Terminal},{name:'完整业务项目',tag:'项目 B',desc:'让项目具备登录、权限与上线能力。',skills:'鉴权 · 分页 · 异常处理 · 部署',count:'规划中',icon:Layers3},{name:'你的独立作品',tag:'作品 C',desc:'自己设计、实现，并讲清每一个技术选择。',skills:'需求设计 · 独立开发 · 项目讲解',count:'自主选题',icon:Trophy}];
function App(){
 const {user}=useAuth();
 return <BookmarksProvider key={user?.userId ?? 'local'}><LearningApp/></BookmarksProvider>;
}

const tightWorkspaceQuery = '(min-width:641px) and (max-width:1280px)';
function LearningApp(){
 const loc=useLocation();
 const coursePractice=loc.pathname.match(/^\/school\/([a-z0-9-]+)\/(?!exams\/?$)[a-z0-9-]+(?:\/|$)/);
 const activeDraft=coursePractice && new URLSearchParams(loc.search).has('draft');
 const mysqlActivity=coursePractice && !activeDraft
   ? '/api/school/courses/'+coursePractice[1]+'/environment/activity'
   : /^\/learn\/sql\/|^\/projects\/sql-foundations\/?$/.test(loc.pathname) ? '/api/v1/sql/environment/activity' : null;
 useMysqlActivity(mysqlActivity);
 const pathname=loc.pathname;
 const home=pathname==='/'||pathname==='/learn';
 const school=pathname==='/school'||pathname.startsWith('/school/');
 const compact=pathname.startsWith('/school/')||pathname.startsWith('/learn/');
 const title=school?'课内实验':pathname.startsWith('/portfolio/')?'作品档案':pathname.startsWith('/learn/')?'学习工作台':pathname.startsWith('/projects/')?'项目详情':([...nav,{to:'/profile',label:'个人中心'},{to:'/settings',label:'设置'}].find(item=>item.to===pathname)?.label||'学习');
 const [duration,setDuration]=useState(()=>{
  try {
   const saved=localState.getItem('cs-duration');
   if(saved&&['30','60','90'].includes(saved))return saved;
  } catch {
   // The settings default is still available when local storage is blocked.
  }
  return '60';
 });
 usePointerFeedback();
 const {data:preferences}=usePreferences();
 useEffect(()=>{
  try {document.documentElement.dataset.motion=localState.getItem('cs-motion')||'system'}catch{}
  const onLocalDuration=(event: Event)=>setDuration((event as CustomEvent<string>).detail);
  window.addEventListener('learning-duration',onLocalDuration);
  return()=>window.removeEventListener('learning-duration',onLocalDuration);
 },[]);
 useEffect(()=>{
  if(!preferences)return;
  cachePreferences(preferences);
  setDuration(String(preferences.dailyMinutes));
 },[preferences]);
 const [menu,setMenu]=useState(false);
 const [ordinarySidebar,setOrdinarySidebar]=useState(()=>{
  try {return localState.getItem('cs-main-sidebar')!=='collapsed';}
  catch {return true;}
 });
 const [tight,setTight]=useState(()=>matchMedia(tightWorkspaceQuery).matches);
 const immersive = compact && tight && (!school || /^\/school\/[^/]+\/(?!exams(?:\/|$))[^/]+\/?$/.test(pathname)
   || /^\/school\/[^/]+\/exams\/[^/]+\/?$/.test(pathname) && new URLSearchParams(loc.search).has('draft'));
 const [workspaceOverride,setWorkspaceOverride]=useState<{path:string;expanded:boolean}>();
 useEffect(()=>{
  const media=matchMedia(tightWorkspaceQuery);
  const update=()=>setTight(media.matches);
  media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{if(!immersive)setWorkspaceOverride(undefined);},[immersive]);
 const sidebarExpanded=immersive ? workspaceOverride?.path===pathname && workspaceOverride.expanded : ordinarySidebar;
 function toggleSidebar(){
  const next=!sidebarExpanded;
  if(immersive){setWorkspaceOverride({path:pathname,expanded:next});return;}
  setOrdinarySidebar(next);
  try {localState.setItem('cs-main-sidebar',next?'expanded':'collapsed');} catch { /* Use the state for this session. */ }
 }
 const [isMobile,setIsMobile]=useState(()=>matchMedia('(max-width:640px)').matches);
 useEffect(()=>{
  const media=matchMedia('(max-width:640px)');
  const update=()=>{setIsMobile(media.matches);setMenu(false);};
  media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  if(menu&&isMobile)document.querySelector<HTMLAnchorElement>('.sidebar a')?.focus({preventScroll:true});
 },[menu,isMobile,pathname]);
 useEffect(()=>{
  if(!menu)return;
  const close=(event:KeyboardEvent)=>{
   if(event.key!=='Escape')return;
   setMenu(false);
   requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus());
  };
  window.addEventListener('keydown',close,true);
  return()=>window.removeEventListener('keydown',close,true);
 },[menu]);
 useEffect(()=>{
  window.scrollTo({top:0,behavior:'instant'});
  document.title='码起步 · '+(home?'课内实验与考前复习':title);
 },[pathname,title,home]);
const navigationLink=(n:typeof nav[number])=><NavLink key={n.to} to={n.to} end={n.to==='/learn'}
  aria-label={n.label} title={n.label} className={({isActive})=>isActive?'active':''} onClick={()=>setMenu(false)}>
  <n.icon aria-hidden="true" size={18}/><span className="nav-label">{n.label}</span></NavLink>;
const navigation=<aside id="site-sidebar" data-expanded={!isMobile&&sidebarExpanded} inert={isMobile&&!menu} className={`sidebar ${compact?'coding-sidebar':''} ${menu?'open':''}`}><Link className="brand" to="/learn" aria-label="码起步" onClick={()=>setMenu(false)}><BrandMark/><span className="brand-name">码起步</span></Link>{!isMobile&&<button type="button" className="btn btn-ghost desktop-sidebar-toggle" aria-expanded={sidebarExpanded} aria-controls="site-sidebar" aria-label={sidebarExpanded?'收起侧边栏':'展开侧边栏'} title={sidebarExpanded?'收起侧边栏':'展开侧边栏'} onClick={toggleSidebar}>{sidebarExpanded?<PanelLeftClose size={18} aria-hidden="true"/>:<PanelLeftOpen size={18} aria-hidden="true"/>}<span className="sidebar-toggle-label" aria-hidden="true">收起侧栏</span></button>}<nav aria-label="主导航">{coreNav.map(navigationLink)}</nav>
  <h2 className="sidebar-group-title">课外探索</h2><nav aria-label="课外探索">{optionalNav.map(navigationLink)}</nav><div className="sidebar-bottom"><PersonalMenu onNavigate={()=>setMenu(false)}/></div>{isMobile&&<HeaderNavigation/>}</aside>;
return <><a className="skip" href="#main">跳到主要内容</a>{!isMobile&&navigation}
<div className={`app ${compact?'coding-app':''}`}><header className="topbar"><div className="header-left"><button className="icon-button mobile-menu" aria-expanded={menu} aria-controls="site-sidebar" aria-label={menu?'关闭导航':'打开导航'} onClick={()=>setMenu(!menu)}>{menu?<X aria-hidden="true" size={19}/>:<Menu aria-hidden="true" size={19}/>}</button>{(!home||isMobile)&&<div className="shell-title"><strong>{title}</strong><small>{school||pathname==='/reviews'?'课内学习':compact||optionalNav.some(item=>pathname.startsWith(item.to))?'课外探索':'学习工作台'}</small></div>}{!isMobile&&<HeaderNavigation/>}</div><div className="header-right"><ThemeToggle/><QuickNavigation/>{!home&&<Link className="header-daily" to="/settings" aria-label={'每日 '+duration+' 分钟计划，打开设置'}><Clock3 size={15} aria-hidden="true"/><span>{duration} 分钟</span></Link>}<PersonalMenu compact/></div></header>{isMobile&&<div className="mobile-nav-slot" data-open={menu}><div>{navigation}</div></div>}<main id="main" key={loc.pathname} tabIndex={-1}><React.Suspense fallback={<PageSkeleton variant="page" className="app-route-loading" label="正在读取页面…"/>}><Routes><Route path="/school" element={<SchoolHome/>}/><Route path="/school/:courseId/exams" element={<ExamHall/>}/><Route path="/school/:courseId/exams/mistakes" element={<ExamMistakes/>}/><Route path="/school/:courseId/exams/:paperId" element={<ExamWorkspace/>}/><Route path="/school/:courseId/exams/:paperId/attempts/:attemptId" element={<ExamReport/>}/><Route path="/school/:courseId/:labId" element={<SchoolLabWorkspace/>}/><Route path="/" element={<Dashboard duration={duration}/>}/><Route path="/learn" element={<Dashboard duration={duration}/>}/><Route path="/learn/sql/1.0/:stage" element={<SqlLearning/>}/><Route path="/learn/boot-foundations/1.0/:stage" element={<BootLearning course="boot-foundations"/>}/><Route path="/learn/collaboration/1.0/:stage" element={<BootLearning course="collaboration"/>}/><Route path="/learn/task-manager/1.0/:stage" element={<BootLearning course="task-manager"/>}/><Route path="/learn/tlias/:chapter" element={<TliasLearning/>}/><Route path="/learn/:course/:version/:stage" element={<LessonWorkspace/>}/><Route path="/path" element={<Path/>}/><Route path="/learn/journey/:lessonId?" element={<FullJourney/>}/><Route path="/projects" element={<Projects/>}/><Route path="/projects/backend-foundations" element={<FoundationProject/>}/><Route path="/projects/sql-foundations" element={<SqlLearning project/>}/><Route path="/projects/boot-foundations" element={<BootLearning project course="boot-foundations"/>}/><Route path="/projects/collaboration" element={<BootLearning project course="collaboration"/>}/><Route path="/projects/task-manager" element={<BootLearning project course="task-manager"/>}/><Route path="/projects/studio" element={<ProjectStudio/>}/><Route path="/projects/generated/:id" element={<GeneratedLearning/>}/><Route path="/projects/tlias" element={<TliasLearning overview/>}/><Route path="/projects/:id" element={<ProjectDetail/>}/><Route path="/reviews" element={<Reviews/>}/><Route path="/reviews/supplemental" element={<SupplementalPractice/>}/><Route path="/portfolio" element={<Portfolio/>}/><Route path="/portfolio/:id" element={<IndependentPortfolio/>}/><Route path="/projects/independent" element={<IndependentPortfolio/>}/><Route path="/profile" element={<Profile/>}/><Route path="/bookmarks" element={<BookmarksPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="*" element={<div className="page"><h1>这个页面不存在</h1><Link className="button primary" to="/learn">返回首页</Link></div>}/></Routes></React.Suspense></main></div></>}
function Path(){return <LearningPath/>}
function PageTitle({title}:{title:string}){return <div className="page-title"><h1>{title}</h1></div>}
function Projects(){return <ProjectBrowser/>}
function ProjectDetail(){const loc=useLocation();const idx=loc.pathname.endsWith('task-manager')?1:loc.pathname.endsWith('collaboration')?2:3;const s=stages[idx];return <div className="page narrow"><Link className="back-link" to="/projects">← 返回项目</Link><PageTitle title={idx===1?'个人任务管理':idx===2?'学习计划与任务协作':'你的独立作品'}/><div className="note"><BookOpen aria-hidden="true" size={20}/><p>课程规划中</p></div><section className="detail-section"><h2>最终你会做出什么</h2><p>{idx===1?'一个能创建、查询、修改、删除任务的后端服务，连接 MySQL 数据库，并能使用接口工具验证结果。':idx===2?'一个具有登录、角色权限、任务协作、分页查询与部署说明的完整业务项目。':'一个从需求、建模、接口到测试与部署均由你完成的后端作品，附可运行说明和技术讲解。'}</p><h2>将练习的能力</h2><p>{s.skills}</p><h2>开始前需要什么</h2><p>{idx===1?'Java 基础、HTTP/JSON、SQL 与 Spring Boot 入门。先在基础模块中完成这些能力的验证。':'完成上一阶段，能够独立复现主要功能，并解释请求到数据库的数据流。'}</p><Link to={idx===1?lesson:'/path'} className="button primary">{idx===1?'先学习基础模块':'查看前置路径'}<ArrowRight aria-hidden="true" size={15}/></Link></section></div>}
function Reviews(){
 const {config}=useAuth();
 const [params]=useSearchParams();
 const showProjects=params.get('view')==='projects'||params.has('stage');
 const {data,error,reload}=useSchoolCourses();
 const courses=data?.flatMap(group=>group.courses) ?? [];
 if(showProjects)return <>
  <div className="page supplemental-link button-row">
   <Link className="csx-btn" to="/reviews">返回课内复习</Link>
   {config?.enabled&&<Link className="csx-btn" to="/reviews/supplemental">补充练习</Link>}
  </div>
  <ReviewPractice/>
 </>;
 return <div className="page study-review">
  <header className="study-heading"><div><h1>复习与错题</h1><p>重练错题，按考点做专项练习，或用整套模拟卷检验掌握情况。</p></div></header>
  {error&&<p role="alert">{error} <button className="button secondary" onClick={reload}>重试</button></p>}
  {data?<SchoolReviewRadar courses={courses} detail/>:!error&&<PageSkeleton variant="cards" label="正在读取复习安排…"/>}
  <div className="button-row">
   <Link className="btn button secondary" to="/school">回顾课内实验</Link>
   <Link className="btn button secondary" to="/reviews?view=projects">课外项目复习</Link>
   {config?.enabled&&<Link className="btn button secondary" to="/reviews/supplemental">补充练习</Link>}
  </div>
 </div>;
}
function Portfolio(){return <IndependentPortfolio/>}
function Profile(){return <LearnerProfile/>}
// Consume the one-time transfer before mounting; StrictMode cannot consume it twice.
if(window.location.hash.startsWith('#ide-handoff=')){
 await initializeAccess();
 try{if(currentAccess().config?.enabled!==false)throw new Error('IDE交接仅适用于本机服务');await receiveIdeHandoff(window.location,window.history,window.sessionStorage,learningRequest)}
 catch{window.history.replaceState(null,'',window.location.pathname+'?tab='+encodeURIComponent('任务')+'&ide-handoff-error=1')}
}
const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<AuthProvider><Outlet/></AuthProvider>}>
    <Route path="/login" element={<AccountPage key="login" mode="login"/>}/>
    <Route path="/register" element={<AccountPage key="register" mode="register"/>}/>
    <Route path="/change-password" element={<AccountPage key="password" mode="password"/>}/>
    <Route path="/admin/*" element={<RequireAuth admin><React.Suspense fallback={<PageSkeleton variant="table" className="admin-route-loading" label="正在加载控制台…"/>}><AdminLayout/></React.Suspense></RequireAuth>}/>
    <Route path="*" element={<RequireAuth><App/></RequireAuth>}/>
  </Route>
));
createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>);






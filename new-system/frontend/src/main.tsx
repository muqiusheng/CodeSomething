import {TliasLearning} from './features/learning/tlias/TliasLearning';
import {PersonalMenu} from './components/layout/PersonalMenu';
import {ProjectStudio} from './features/projects/ProjectStudio';
import {GeneratedLearning} from './features/projects/GeneratedLearning';
import React, {useState, useEffect} from 'react';
import {receiveIdeHandoff} from './api/ide-handoff';
import {learningRequest} from './api/learning-api';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Routes, Route, NavLink, Link, useLocation, useSearchParams} from 'react-router-dom';
import {ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Circle, Clock3, Code2, Compass, Copy, ExternalLink, FileCode2, Folder, Home, Layers3, Menu, RotateCcw, Settings, ShieldCheck, Terminal, Trophy, UserRound, X} from 'lucide-react';
import {Dashboard} from './features/home/Dashboard';
import {BootLearning} from './features/learning/boot/BootLearning';
import {LearnerProfile} from './features/profile/LearnerProfile';
import {SqlLearning} from './features/learning/sql/SqlLearning';
import {SettingsPage} from './features/settings/SettingsPage';
import {getPreferences, cachePreferences} from './api/api';
import {LearningPath} from './features/projects/LearningPath';
import {Journey as FullJourney} from './features/learning/journey/Journey';
import {LessonWorkspace} from './features/learning/http/LessonWorkspace';
import {QuickNavigation} from './components/layout/QuickNavigation';
import {ProjectBrowser} from './features/projects/ProjectBrowser';
import {FoundationProject} from './features/projects/FoundationProject';
import {ReviewPractice} from './features/reviews/ReviewPractice';
const IndependentPortfolio=React.lazy(()=>import('./features/portfolio/Portfolio').then(m=>({default:m.Portfolio})));
import {usePointerFeedback} from './hooks/usePointerFeedback';
import './styles/styles.css';
import './styles/design-system.css';
import './styles/learning.css';
import './styles/themes.css';
import './styles/navigation.css';
import './styles/coding-layout.css';
import './styles/report-refinements.css';
import {HeaderNavigation} from './components/layout/HeaderNavigation';
import {ThemeToggle} from './components/shared/ThemeControls';

const lesson='/learn/http-json/1.0/json-response';
const nav=[{to:'/learn',label:'学习',icon:Home},{to:'/path',label:'学习路径',icon:Compass},{to:'/projects',label:'项目',icon:Folder},{to:'/reviews',label:'复习',icon:RotateCcw},{to:'/portfolio',label:'作品',icon:Trophy}];
const stages=[{name:'基础模块',tag:'当前阶段',desc:'读懂请求，写出第一个接口。',skills:'HTTP / JSON · SQL · Spring Boot',count:'3 个模块',icon:BookOpen},{name:'第一个后端项目',tag:'项目 A',desc:'从零搭建个人任务管理，完成数据库与 CRUD。',skills:'数据建模 · REST API · 自动化测试',count:'6 个关卡',icon:Terminal},{name:'完整业务项目',tag:'项目 B',desc:'让项目具备登录、权限与上线能力。',skills:'鉴权 · 分页 · 异常处理 · 部署',count:'规划中',icon:Layers3},{name:'你的独立作品',tag:'作品 C',desc:'自己设计、实现，并讲清每一个技术选择。',skills:'需求设计 · 独立开发 · 项目讲解',count:'自主选题',icon:Trophy}];
function App(){const loc=useLocation();usePointerFeedback();useEffect(()=>{try{document.documentElement.dataset.motion=localStorage.getItem('cs-motion')||'system'}catch{};void getPreferences().then(cachePreferences).catch(()=>{})},[]);const [menu,setMenu]=useState(false);const [isMobile,setIsMobile]=useState(()=>matchMedia('(max-width:640px)').matches);useEffect(()=>{const media=matchMedia('(max-width:640px)');const update=()=>{setIsMobile(media.matches);setMenu(false)};media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);useEffect(()=>{if(menu&&isMobile){document.querySelector<HTMLAnchorElement>('.sidebar a')?.focus({preventScroll:true})}},[menu,isMobile,loc.pathname]);useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&document.querySelector('.sidebar')?.classList.contains('open')){setMenu(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus())}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true)},[]);useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});document.title=`CodeSomething · ${loc.pathname.startsWith('/portfolio/')?'作品档案':loc.pathname.startsWith('/learn/')?'学习工作台':loc.pathname.startsWith('/projects/')?'项目详情':([...nav,{to:'/profile',label:'个人中心'},{to:'/settings',label:'设置'}].find(n=>n.to===loc.pathname)?.label||'学习')}`},[loc.pathname]);const title=loc.pathname.startsWith('/portfolio/')?'作品档案':loc.pathname.startsWith('/learn/')?'学习工作台':loc.pathname.startsWith('/projects/')?'项目详情':([...nav,{to:'/profile',label:'个人中心'},{to:'/settings',label:'设置'}].find(n=>n.to===loc.pathname)?.label||'学习');
const navigation=<aside id="site-sidebar" inert={isMobile&&!menu} className={`sidebar ${loc.pathname.startsWith('/learn/')?'coding-sidebar':''} ${menu?'open':''}`}><Link className="brand" to="/learn" aria-label="CodeSomething" onClick={()=>setMenu(false)}><span className="brand-symbol"><Code2 aria-hidden="true" size={21}/></span><span className="brand-name">CodeSomething<span className="brand-dot">.</span></span></Link><nav aria-label="主导航">{nav.map(n=><NavLink key={n.to} to={n.to} aria-label={n.label} title={n.label} className={({isActive})=>isActive?'active':''} onClick={()=>setMenu(false)}><n.icon aria-hidden="true" size={18}/><span className="nav-label">{n.label}</span></NavLink>)}</nav><div className="sidebar-bottom"><PersonalMenu onNavigate={()=>setMenu(false)}/></div></aside>;
return <><a className="skip" href="#main">跳到主要内容</a>{!isMobile&&navigation}
<div className={`app ${loc.pathname.startsWith('/learn/')?'coding-app':''}`}><header className="topbar"><div className="header-left"><button className="icon-button mobile-menu" aria-expanded={menu} aria-controls="site-sidebar" aria-label={menu?'关闭导航':'打开导航'} onClick={()=>setMenu(!menu)}>{menu?<X aria-hidden="true" size={19}/>:<Menu aria-hidden="true" size={19}/>}</button><HeaderNavigation/></div><div className="header-right"><ThemeToggle/><QuickNavigation/>{loc.pathname!=='/learn'&&loc.pathname!=='/'&&<span className="prototype"><Circle aria-hidden="true" size={7} fill="currentColor"/>{loc.pathname.startsWith('/portfolio')||loc.pathname==='/projects/independent'?'作品证据':loc.pathname.startsWith('/projects/studio')?'研究与生成':loc.pathname.startsWith('/projects/generated/')?'已发布项目':loc.pathname==='/learn'||loc.pathname==='/'||loc.pathname==='/profile'||loc.pathname==='/reviews'?'正式进度':loc.pathname.startsWith('/learn/tlias/')||loc.pathname==='/projects/tlias'?'资料实战':loc.pathname.startsWith('/learn/journey')?'全流程课程':loc.pathname.startsWith('/learn/')||(loc.pathname==='/projects/backend-foundations'||loc.pathname==='/projects/sql-foundations'||loc.pathname==='/projects/boot-foundations'||loc.pathname==='/projects/task-manager'||loc.pathname==='/projects/collaboration')?'正式课程':loc.pathname==='/projects'||loc.pathname==='/path'?'课程目录':'个人学习空间'}</span>}<PersonalMenu compact/></div></header>{isMobile&&<div className="mobile-nav-slot" data-open={menu}><div>{navigation}</div></div>}<main id="main" key={loc.pathname} tabIndex={-1}><React.Suspense fallback={<p role="status">正在读取页面…</p>}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/learn" element={<Dashboard/>}/><Route path="/learn/sql/1.0/:stage" element={<SqlLearning/>}/><Route path="/learn/boot-foundations/1.0/:stage" element={<BootLearning course="boot-foundations"/>}/><Route path="/learn/collaboration/1.0/:stage" element={<BootLearning course="collaboration"/>}/><Route path="/learn/task-manager/1.0/:stage" element={<BootLearning course="task-manager"/>}/><Route path="/learn/tlias/:chapter" element={<TliasLearning/>}/><Route path="/learn/:course/:version/:stage" element={<LessonWorkspace/>}/><Route path="/path" element={<Path/>}/><Route path="/learn/journey/:lessonId?" element={<FullJourney/>}/><Route path="/projects" element={<Projects/>}/><Route path="/projects/backend-foundations" element={<FoundationProject/>}/><Route path="/projects/sql-foundations" element={<SqlLearning project/>}/><Route path="/projects/boot-foundations" element={<BootLearning project course="boot-foundations"/>}/><Route path="/projects/collaboration" element={<BootLearning project course="collaboration"/>}/><Route path="/projects/task-manager" element={<BootLearning project course="task-manager"/>}/><Route path="/projects/studio" element={<ProjectStudio/>}/><Route path="/projects/generated/:id" element={<GeneratedLearning/>}/><Route path="/projects/tlias" element={<TliasLearning overview/>}/><Route path="/projects/:id" element={<ProjectDetail/>}/><Route path="/reviews" element={<Reviews/>}/><Route path="/portfolio" element={<Portfolio/>}/><Route path="/portfolio/:id" element={<IndependentPortfolio/>}/><Route path="/projects/independent" element={<IndependentPortfolio/>}/><Route path="/profile" element={<Profile/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="*" element={<div className="page"><h1>这个页面不存在</h1><Link className="button primary" to="/learn">返回继续学习</Link></div>}/></Routes></React.Suspense></main></div></>}
function Path(){return <LearningPath/>}
function PageTitle({title}:{title:string}){return <div className="page-title"><h1>{title}</h1></div>}
function Projects(){return <ProjectBrowser/>}
function ProjectDetail(){const loc=useLocation();const idx=loc.pathname.endsWith('task-manager')?1:loc.pathname.endsWith('collaboration')?2:3;const s=stages[idx];return <div className="page narrow"><Link className="back-link" to="/projects">← 返回项目</Link><PageTitle title={idx===1?'个人任务管理':idx===2?'学习计划与任务协作':'你的独立作品'}/><div className="note"><BookOpen aria-hidden="true" size={20}/><p>课程规划中</p></div><section className="detail-section"><h2>最终你会做出什么</h2><p>{idx===1?'一个能创建、查询、修改、删除任务的后端服务，连接 MySQL 数据库，并能使用接口工具验证结果。':idx===2?'一个具有登录、角色权限、任务协作、分页查询与部署说明的完整业务项目。':'一个从需求、建模、接口到测试与部署均由你完成的后端作品，附可运行说明和技术讲解。'}</p><h2>将练习的能力</h2><p>{s.skills}</p><h2>开始前需要什么</h2><p>{idx===1?'Java 基础、HTTP/JSON、SQL 与 Spring Boot 入门。先在基础模块中完成这些能力的验证。':'完成上一阶段，能够独立复现主要功能，并解释请求到数据库的数据流。'}</p><Link to={idx===1?lesson:'/path'} className="button primary">{idx===1?'先学习基础模块':'查看前置路径'}<ArrowRight aria-hidden="true" size={15}/></Link></section></div>}
function Reviews(){return <ReviewPractice/>}
function Portfolio(){return <IndependentPortfolio/>}
function Profile(){return <LearnerProfile/>}
// Consume the one-time transfer before mounting; StrictMode cannot consume it twice.
if(window.location.hash.startsWith('#ide-handoff=')){
 try{await receiveIdeHandoff(window.location,window.history,window.sessionStorage,learningRequest)}
 catch{window.history.replaceState(null,'',window.location.pathname+'?tab='+encodeURIComponent('任务')+'&ide-handoff-error=1')}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);






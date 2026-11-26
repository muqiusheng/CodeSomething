import {InlineSpinner} from '../../components/shared/LoadingState';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link,useLocation} from 'react-router-dom';
import {LogOut,KeyRound} from 'lucide-react';
import {logout} from '../../api/auth-api';
import {useAuth} from '../../features/auth/AuthContext';
import {useOnboarding} from '../../features/onboarding/OnboardingProvider';
import {BookOpenCheck} from 'lucide-react';
import {ChartNoAxesCombined,SlidersHorizontal,Palette,Bot,Settings,ChevronRight} from 'lucide-react';
import '../../styles/personal-center.css';
const items=[{title:'学习进度与数据',to:'/profile',icon:ChartNoAxesCombined},{title:'学习偏好',to:'/settings#learning',icon:SlidersHorizontal},{title:'外观与交互',to:'/settings#appearance',icon:Palette},{title:'模型连接',to:'/settings#model',icon:Bot},{title:'设置',to:'/settings',icon:Settings}];
export function PersonalMenu({compact=false,onNavigate}:{compact?:boolean;onNavigate?:()=>void}){
 const {user,config}=useAuth(); const onboarding=useOnboarding();
 const [logoutError,setLogoutError]=useState('');
 const [signingOut,setSigningOut]=useState(false);
 const name=user?.username||'我的学习空间', initial=user?.username[0]?.toUpperCase()||'C';
 const admin=user?.role==='ROLE_ADMIN';
 const links=config?.enabled?[
  ...(admin?[
   {title:'外观与交互',to:'/admin/settings#appearance',icon:Palette},
   {title:'控制台设置',to:'/admin/settings',icon:Settings},
  ]:items.filter(item=>item.title!=='模型连接')),
  {title:'修改密码',to:'/change-password',icon:KeyRound},
 ]:items;
 async function signOut(){setSigningOut(true);setLogoutError('');try{await logout()}catch(error){setLogoutError(error instanceof Error?error.message:'无法退出，请重试。');setSigningOut(false)}}
 const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0});const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);const id=useId();const location=useLocation();
 useEffect(()=>setOpen(false),[location.key]);
 useEffect(()=>{if(!open)return;function close(e:PointerEvent){if(!panel.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false)}function reposition(){const r=trigger.current?.getBoundingClientRect();if(r)setPosition({left:Math.max(8,Math.min(r.left,innerWidth-296)),top:Math.max(8,Math.min(compact?r.bottom+10:r.top-(panel.current?.offsetHeight||346)-8,innerHeight-(panel.current?.offsetHeight||346)-8))})}reposition();document.addEventListener('pointerdown',close);window.addEventListener('resize',reposition);requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus());return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',reposition)}},[open,compact]);
 function navigate(){setOpen(false);onNavigate?.()}
 return <><button ref={trigger} className={compact?'avatar small personal-trigger compact':'personal-trigger profile-link'} aria-label="打开个人中心菜单" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true)}}}>{compact?initial:<><span className="avatar">{initial}</span><span className="personal-trigger-copy"><strong>{name}</strong><small>个人中心</small></span><ChevronRight size={15} aria-hidden="true"/></>}</button>{open&&createPortal(<div ref={panel} id={id} className="personal-menu-panel" role="menu" aria-label="个人中心" style={position} onKeyDown={e=>{const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')||[]);const i=nodes.indexOf(document.activeElement as HTMLElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();nodes[e.key==='Home'?0:e.key==='End'?nodes.length-1:(i+(e.key==='ArrowDown'?1:-1)+nodes.length)%nodes.length]?.focus()}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus()}if(e.key==='Tab'){setOpen(false);trigger.current?.focus()}}}><Link className="personal-menu-identity" role="menuitem" to={admin?'/admin/overview':'/profile'} onClick={navigate}><span className="avatar">{initial}</span><span><strong>{name}</strong><small>{admin?'管理员':'个人中心'}</small></span><ChevronRight size={16} aria-hidden="true"/></Link><div className="personal-menu-separator" role="separator"/>{links.map(item=><Link key={item.title} role="menuitem" to={item.to} onClick={navigate}><item.icon size={18} aria-hidden="true"/>{item.title}</Link>)}{!admin&&onboarding&&<button type="button" role="menuitem" className="personal-guide" onClick={()=>{navigate();requestAnimationFrame(()=>{trigger.current?.focus();onboarding.openCenter()})}}><BookOpenCheck size={18} aria-hidden="true"/>新手指南与新功能</button>}{user&&<button type="button" role="menuitem" className="personal-signout" disabled={signingOut} onClick={()=>void signOut()}><span className="personal-signout-icon" aria-hidden="true">{signingOut?<InlineSpinner/>:<LogOut size={18} aria-hidden="true"/>}</span>{signingOut?'正在退出…':'退出登录'}</button>}{logoutError&&<p role="alert">{logoutError}</p>}</div>,document.body)}</>;
}

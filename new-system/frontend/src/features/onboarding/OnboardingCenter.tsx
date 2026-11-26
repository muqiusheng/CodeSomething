import {BookOpenCheck,Bookmark,Folder,GraduationCap,Timer} from 'lucide-react';
import {useEffect} from 'react';
import {Link} from 'react-router-dom';
import {Modal} from '../../components/ui/modal';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {changelog} from './changelog';
import {useOnboarding} from './OnboardingProvider';
import type {CenterTab} from './onboarding-state.mjs';
import type {TourKind} from './tours';

const guide=[
  {title:'课内实验',desc:'按顺序完成必做题，通过后更新进度。',href:'/school',icon:GraduationCap},
  {title:'考试冲刺',desc:'在数据库原理课程中打开专项卷或模拟卷。',href:'/school/database-systems/exams',icon:Timer},
  {title:'复习与收藏',desc:'回顾错题，也可从收藏回到原题。',href:'/reviews',icon:Bookmark},
  {title:'课外拓展',desc:'从零完成一个项目，逐步积累实战经验。',href:'/projects',icon:Folder},
];

export function OnboardingButton() {
  const onboarding=useOnboarding();
  if (!onboarding) return null;
  return <button id="onboarding-trigger" type="button" className="icon-button onboarding-trigger"
    onClick={onboarding.openCenter} aria-haspopup="dialog"
    aria-label={onboarding.unread?'新手指南与新功能（有新更新）':'新手指南与新功能'}>
    <BookOpenCheck size={18} aria-hidden="true"/>
    {onboarding.unread && <span className="onboarding-unread" aria-hidden="true"/>}
  </button>;
}

export function OnboardingCenter({tab,onTabChange,unread,replay,onReadUpdates}:{
  tab:CenterTab|null;onTabChange:(tab:CenterTab|null)=>void;unread:boolean;
  replay:(kind:TourKind)=>void;onReadUpdates:()=>void;
}) {
  useEffect(()=>{
    if (tab==='updates' && unread) onReadUpdates();
  },[tab,unread,onReadUpdates]);

  const close=()=>onTabChange(null);
  return <Modal open={tab!==null} onOpenChange={open=>{if (!open) close();}} title="新手指南与新功能"
    description="从最常用的功能开始，也可以随时重看导览。" className="onboarding-center">
    <Tabs value={tab ?? 'guide'} onValueChange={value=>{
      if (value==='guide' || value==='updates') onTabChange(value);
    }}>
      <TabsList className="onboarding-tabs" aria-label="指南分类">
        <TabsTrigger value="guide">新手指南</TabsTrigger>
        <TabsTrigger value="updates">
          最新功能
          {tab==='guide' && unread && <span className="onboarding-tab-unread" role="img" aria-label="有新更新"/>}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="guide" className="onboarding-tab-content">
        <ul className="onboarding-guide">
          {guide.map(({title,desc,href,icon:Icon})=><li key={title}><Link to={href} onClick={close}>
            <Icon size={18} aria-hidden="true"/><span><strong>{title}</strong><small>{desc}</small></span>
          </Link></li>)}
        </ul>
        <div className="onboarding-actions">
          <button type="button" className="btn button primary" onClick={()=>replay('home')}>重新体验首页导览</button>
          <button type="button" className="btn button secondary" onClick={()=>replay('workbench')}>查看工作台导览</button>
        </div>
        <dl className="onboarding-shortcuts">
          <div><dt><kbd>Ctrl + K</kbd></dt><dd>快速前往</dd></div>
          <div><dt><kbd>Ctrl + Enter</kbd></dt><dd>运行并判分</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>关闭浮窗或退出导览</dd></div>
        </dl>
      </TabsContent>
      <TabsContent value="updates" className="onboarding-tab-content">
        <ul className="onboarding-updates">{changelog.map(entry=><li key={entry.version}>
          <time dateTime={entry.date}>{entry.date}</time>
          <h3>{entry.title}</h3><p>{entry.description}</p>
          <Link to={entry.href} onClick={close}>{entry.actionLabel}</Link>
        </li>)}</ul>
      </TabsContent>
    </Tabs>
  </Modal>;
}

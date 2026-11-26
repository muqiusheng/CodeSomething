import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {currentAccess} from '../../api/auth-api';
import {localState} from '../../api/browser-state.mjs';
import {emptyProgress,hasUnreadUpdates,initialCenterTab,mergeProgress,shouldOfferTour,type CenterTab,type Progress} from './onboarding-state.mjs';
import {requestOnboarding,type ProgressPatch} from './onboarding-api';
import {LATEST_CHANGELOG_VERSION} from './changelog';
import {tours,type TourKind} from './tours';
import {TourOverlay} from './TourOverlay';
import {OnboardingCenter} from './OnboardingCenter';
import '../../styles/onboarding.css';

const cacheKey='cs-onboarding-v1';
const labRoute=/^\/school\/[a-z0-9-]+\/(?!exams\/?$)[a-z0-9-]+\/?$/;
type Cached={progress:Progress;pending:ProgressPatch};
function readCache(owner:string):Cached {
  try {
    const data=JSON.parse(localState.getItem(cacheKey,owner) ?? 'null');
    if (data?.progress && data.pending) return data;
  } catch { /* The server remains the source on browsers without storage. */ }
  return {progress:emptyProgress,pending:{}};
}
function writeCache(owner:string,data:Cached) {
  try {localState.setItem(cacheKey,JSON.stringify(data),owner);} catch { /* Keep the change in memory. */ }
}

type Controls={openCenter:()=>void;unread:boolean;workbenchReplayPending:boolean};
const Context=createContext<Controls|null>(null);
export function useOnboarding() {return useContext(Context);}

export function OnboardingProvider({owner,signedIn,children}:{owner:string;signedIn:boolean;children:ReactNode}) {
  const navigate=useNavigate();
  const {pathname}=useLocation();
  const home=pathname==='/'||pathname==='/learn';
  const workbench=labRoute.test(pathname);
  const page:TourKind|null=home?'home':workbench?'workbench':null;
  const [cache,setCache]=useState(()=>readCache(owner));
  const latest=useRef(cache);
  const [ready,setReady]=useState(false);
  const [centerTab,setCenterTab]=useState<CenterTab|null>(null);
  const center=centerTab!==null;
  const [active,setActive]=useState<{kind:TourKind;path:string}|null>(null);
  const [replay,setReplay]=useState<TourKind|null>(null);
  const writing=useRef(false);
  const sameOwner=useCallback(()=>(currentAccess().user?.userId ?? 'local')===owner,[owner]);

  const commit=useCallback((next:Cached)=>{
    latest.current=next;
    writeCache(owner,next);
    setCache(next);
  },[owner]);

  const flush=useCallback(async ()=>{
    if (!sameOwner()||writing.current||!Object.keys(latest.current.pending).length) return;
    writing.current=true;
    const patch=latest.current.pending;
    let synced=false;
    try {
      const saved=await requestOnboarding(patch);
      if (!sameOwner()) return;
      const current=latest.current;
      const pending={...current.pending};
      if ((pending.homeTourVersion ?? 0)<=saved.homeTourVersion) delete pending.homeTourVersion;
      if ((pending.workbenchTourVersion ?? 0)<=saved.workbenchTourVersion) delete pending.workbenchTourVersion;
      if (!hasUnreadUpdates(saved.lastSeenChangelog,pending.lastSeenChangelog ?? '')) delete pending.lastSeenChangelog;
      commit({progress:mergeProgress(current.progress,saved),pending});
      synced=true;
    } catch { /* Keep the optimistic progress and retry when the connection returns. */ }
    finally {writing.current=false;}
    if (synced && latest.current.pending!==patch && Object.keys(latest.current.pending).length) void flush();
  },[commit,sameOwner]);

  useEffect(()=>{
    if (active && active.path!==pathname) setActive(null);
  },[active,pathname]);

  useEffect(()=>{
    const controller=new AbortController();
    async function refresh() {
      try {
        const progress=await requestOnboarding(undefined,controller.signal);
        if (!controller.signal.aborted && sameOwner())
          commit({progress:mergeProgress(latest.current.progress,progress),pending:latest.current.pending});
      } catch { /* A saved account value can still be used while offline. */ }
      finally {
        if (!controller.signal.aborted && sameOwner()) {
          setReady(!!latest.current.progress.updatedAt);
          void flush();
        }
      }
    }
    const sync=()=>void refresh();
    sync();
    window.addEventListener('online',sync);
    window.addEventListener('focus',sync);
    return ()=>{controller.abort();window.removeEventListener('online',sync);window.removeEventListener('focus',sync);};
  },[commit,flush,sameOwner]);

  useEffect(()=>{
    if (!page || center || active?.path===pathname) return;
    const tour=tours[page];
    const manual=replay===page;
    if (!manual && (!signedIn || !ready || !shouldOfferTour(cache.progress[tour.field],tour.version))) return;
    let frame=0;
    function check() {
      if (frame) return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        if (document.querySelector('[aria-modal="true"],[role="dialog"][data-state="open"],dialog[open]')) return;
        if (!document.querySelector('[data-tour-ready="'+page+'"]')) return;
        if (manual) setReplay(null);
        setActive({kind:page!,path:pathname});
      });
    }
    const observer=new MutationObserver(check);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-tour-ready','data-state','open']});
    check();
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[active,cache.progress,center,page,pathname,ready,replay,signedIn]);

  function update(patch:ProgressPatch) {
    const current=latest.current;
    commit({progress:mergeProgress(current.progress,patch),pending:{...current.pending,...patch}});
    void flush();
  }

  function start(kind:TourKind) {
    setCenterTab(null);
    setReplay(kind);
    if (kind==='home'&&!home) navigate('/learn');
    if (kind==='workbench'&&!workbench) navigate('/school');
  }

  const unread=ready&&hasUnreadUpdates(cache.progress.lastSeenChangelog,LATEST_CHANGELOG_VERSION);
  return <Context.Provider value={{openCenter:()=>setCenterTab(initialCenterTab(unread)),unread,workbenchReplayPending:replay==='workbench'}}>
    {children}
    <OnboardingCenter tab={centerTab} onTabChange={setCenterTab} unread={unread} replay={start}
      onReadUpdates={()=>{if (hasUnreadUpdates(latest.current.progress.lastSeenChangelog,LATEST_CHANGELOG_VERSION))
        update({lastSeenChangelog:LATEST_CHANGELOG_VERSION});}}/>
    {active?.path===pathname && <TourOverlay kind={active.kind} onFinish={()=>{
      const {field,version}=tours[active.kind];
      setActive(null);
      if (latest.current.progress[field]<version) update({[field]:version});
    }}/>}
  </Context.Provider>;
}

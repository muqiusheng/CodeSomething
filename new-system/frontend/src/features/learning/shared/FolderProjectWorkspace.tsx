import {useEffect,useId,useMemo,useRef,useState,type ComponentProps,type ReactNode} from 'react';
import {nativeAvailable,pickNativeDirectory} from './native-project.mjs';
import {Check,FolderOpen,FileCode2,Save,RefreshCw,X} from 'lucide-react';
import {CodeEditor} from '../../../components/code/CodeEditor';
import {learningRequest,type CheckJob,type Submission} from '../../../api/learning-api';
import {BrowserWorkspace} from './BrowserWorkspace';
import {CheckJobReport} from './CheckJobReport';
import {ProjectStartCard} from './LocalProjectGuide';
import {useWorkspaceView} from './WorkspaceLayout';
import {ProjectFileDrawer} from './ProjectFileDrawer';
import {ProjectOpenFiles} from './ProjectOpenFiles';
import {WorkspaceDivider} from './WorkspaceDivider';
import {CodeCompletion} from './CodeCompletion';
import {listDirectory,readText,saveText,collectCheckFiles,projectStamp,rememberDirectory,recallDirectory,isMissingProjectEntry,openFilePresence,type LocalDirectory,type LocalFile} from './local-project-files.mjs';

type Buffer={base:string;value:string;closed?:boolean};
function pendingBuffers(key:string):Record<string,Buffer>{try{const value=JSON.parse(sessionStorage.getItem(key+'-unsaved')||'{}');return value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(b=>b&&typeof (b as Buffer).base==='string'&&typeof (b as Buffer).value==='string')?value:{}}catch{return {}}}
type Draft={id:string;revision:number;digest:string};
const checking=(job:CheckJob|null)=>!!job&&['queued','running','cancelling','awaiting_runner'].includes(job.status);
const signature=(files:Record<string,string>)=>JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
const isSupportEntry=(name:string)=>/[.]idea|[.]mvn|target|[.]git|help[.]md|mvnw/i.test(name);

function Directory({root,prefix='',view,onView,epoch}:{root:LocalDirectory;prefix?:string;view:string;onView:(path:string)=>void;epoch:number}){
 const [entries,setEntries]=useState<(LocalDirectory|LocalFile)[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void listDirectory(root).then(value=>{if(active){setEntries(value);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[root,epoch]);
 return <ul className="project-file-tree" data-large={entries.length>50}>{error&&<li role="alert">无法读取目录：{error}</li>}{entries.map(entry=>entry.kind==='directory'?<DirectoryBranch key={entry.name} {...{entry,prefix,view,onView,epoch}}/>:<li className="project-file-row" key={entry.name}><button type="button" className="text-button" data-support={isSupportEntry(entry.name)||undefined} aria-current={view===prefix+entry.name?'true':undefined} onClick={()=>onView(prefix+entry.name)} title={prefix+entry.name}><FileCode2 size={14} aria-hidden="true"/><span>{entry.name}</span></button></li>)}</ul>;
}
function DirectoryBranch({entry,prefix,view,onView,epoch}:{entry:LocalDirectory;prefix:string;view:string;onView:(path:string)=>void;epoch:number}){
 const [open,setOpen]=useState(false);
 return <li><details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary data-support={isSupportEntry(entry.name)||undefined}><FolderOpen size={14} aria-hidden="true"/><span>{entry.name}</span></summary>{open&&<Directory root={entry} prefix={prefix+entry.name+'/'} {...{view,onView,epoch}}/>}</details></li>;
}
export function FolderProjectWorkspace({context,onJobChange,nextHref,nextLabel,verifyRef,practiceFooter,guide}:ComponentProps<typeof BrowserWorkspace>&{practiceFooter?:ReactNode;guide:ReactNode}){
 const [resultsOpen,setResultsOpen]=useState(false);
 const mobileView=useWorkspaceView();
 const resultsId=useId();
 const resultPanel=useRef<HTMLDivElement>(null);
 const runButton=useRef<HTMLButtonElement>(null);
 const practiceOnly=practiceFooter!==undefined;
 const automaticPractice=!practiceOnly&&context.courseId==='http-json-basics'&&['workspace','workspace-http-text'].includes(context.stageId);
 const storageKey='cs-folder-project-'+context.courseId+'-'+context.courseVersion,resultKey=storageKey+'-'+context.stageId;
 const [root,setRoot]=useState<LocalDirectory>(),[authorized,setAuthorized]=useState(false),[epoch,setEpoch]=useState(0),[buffers,setBuffers]=useState<Record<string,Buffer>>(()=>pendingBuffers(storageKey)),[view,setView]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('选择独立的项目根目录，网站会记住此工程。'),[readAt,setReadAt]=useState('');
 const [job,setJob]=useState<CheckJob|null>(null),[submissionId,setSubmissionId]=useState<string>(),[reportKey,setReportKey]=useState(''),[currentKey,setCurrentKey]=useState(''),[readIssue,setReadIssue]=useState('');
 const [token]=useState(()=>{try{const old=localStorage.getItem(storageKey+'-key');if(old)return old;const key=crypto.randomUUID();localStorage.setItem(storageKey+'-key',key);return key}catch{return crypto.randomUUID()}});
 const [native,setNative]=useState(false),[picking,setPicking]=useState(false);
 const [missing,setMissing]=useState<Set<string>>(new Set());
 const [checkIssue,setCheckIssue]=useState('');
 const pickerCancel=useRef<AbortController|null>(null),refreshing=useRef<Promise<void>|null>(null),refreshRoot=useRef<LocalDirectory|undefined>(undefined),activeRoot=useRef<LocalDirectory|undefined>(undefined),stamp=useRef('');activeRoot.current=root;
 useEffect(()=>{void nativeAvailable().then(setNative).catch(()=>setNative(false));return()=>pickerCancel.current?.abort()},[]);
 const [discarded,setDiscarded]=useState<{path:string;buffer:Buffer}>();
 const [diskCopy,setDiskCopy]=useState<{path:string;value:string}>();
 const openSequence=useRef(0);
 const tabButtons=useRef(new Map<string,HTMLButtonElement>());
 const directory=useRef<HTMLElement>(null), treeTrigger=useRef<HTMLButtonElement>(null);
 const alert=useRef<HTMLParagraphElement>(null),latest=useRef({buffers,view,busy});latest.current={buffers,view,busy};
 useEffect(()=>{if(!root||!authorized||!reportKey)return;let active=true;void (async()=>{const before=await projectStamp(root,context.courseId);const files=await collectCheckFiles(root,context.courseId);const after=await projectStamp(root,context.courseId);if(active&&activeRoot.current===root){stamp.current=after;setCurrentKey(before===after?signature(files):'')}})().catch(()=>{if(active)setCurrentKey('')});return()=>{active=false}},[root,authorized,reportKey,context.courseId]);
 const dirty=Object.entries(buffers).filter(([,b])=>b.base!==b.value);
 const tabs=Object.entries(buffers).filter(([,b])=>!b.closed);
 const closedDrafts=dirty.filter(([,b])=>b.closed);
 const dirtyMissing=dirty.some(([path])=>missing.has(path));
 const activeBuffer=buffers[view];
 const hasConflict=diskCopy?.path===view&&activeBuffer&&activeBuffer.base!==activeBuffer.value&&activeBuffer.base!==diskCopy.value&&!missing.has(view);
 const stale=dirty.length>0||!authorized||!currentKey||currentKey!==reportKey;
 const report=useMemo(()=>job?{...job,stale:job.stale||stale,freshness:stale?'changed' as const:job.freshness}:null,[job,stale]);
 useEffect(()=>{onJobChange?.(report,context.courseVersion+context.stageId,token,submissionId)},[report,context.courseVersion,context.stageId,token,submissionId,onJobChange]);
 useEffect(()=>{if(error)alert.current?.focus()},[error]);
 useEffect(()=>{let active=true;void recallDirectory(storageKey).then(async handle=>{if(!handle||!active)return;setRoot(handle);activeRoot.current=handle;if(await handle.queryPermission({mode:'readwrite'})==='granted'){if(!active)return;setAuthorized(true);setStatus('已记住上次工程，正在核对文件。');await refresh(handle)}else if(active)setStatus('已记住工程 '+handle.name+'，点击“重新授权”恢复读写。')}).catch(()=>{if(active)setReadIssue('原工程暂时无法读取，请重新选择项目目录；未保存修改继续保留。')});return()=>{active=false}},[storageKey]);
 useEffect(()=>{let active=true;setJob(null);setSubmissionId(undefined);setReportKey('');if(practiceOnly)return;try{const raw=sessionStorage.getItem(resultKey);if(raw){const saved=JSON.parse(raw);setResultsOpen(true);setReportKey(saved.selectionKey);setSubmissionId(saved.submissionId);void learningRequest<CheckJob>('/jobs/'+saved.jobId,undefined,token).then(value=>{if(active)setJob(value)}).catch(()=>{})}}catch{}return()=>{active=false}},[resultKey,token,practiceOnly]);
 useEffect(()=>{if(!job||!checking(job))return;let active=true;const timer=setTimeout(()=>void learningRequest<CheckJob>('/jobs/'+job.id,undefined,token).then(value=>{if(active)setJob(value)}).catch(e=>{if(active)setError(e.message)}),1000);return()=>{active=false;clearTimeout(timer)}},[job,token]);
 useEffect(()=>{
  if(!root||!authorized)return;
  const update=()=>{if(document.visibilityState==='visible'&&!latest.current.busy)void refresh(root).catch(e=>setError(e.message))};
  window.addEventListener('focus',update);
  document.addEventListener('visibilitychange',update);
  const timer=setInterval(update,5000);
  return()=>{
   window.removeEventListener('focus',update);
   document.removeEventListener('visibilitychange',update);
   clearInterval(timer);
  };
 },[root,authorized,context.courseId]);
 useEffect(()=>{try{const pending=Object.fromEntries(dirty);if(dirty.length)sessionStorage.setItem(storageKey+'-unsaved',JSON.stringify(pending));else sessionStorage.removeItem(storageKey+'-unsaved')}catch{}},[buffers,storageKey]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty.length){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty.length]);
 async function refresh(handle:LocalDirectory){
  if(refreshing.current){if(refreshRoot.current===handle)return refreshing.current;await refreshing.current;if(activeRoot.current===handle)return refresh(handle);return}
  refreshRoot.current=handle;const work=(async()=>{try{
   if(await handle.queryPermission({mode:'readwrite'})!=='granted'){if(activeRoot.current!==handle)return;setAuthorized(false);setCurrentKey('');setStatus('工程已记住，需要重新授权读写。');return}
   if(!handle.bridge)await listDirectory(handle);
   if(activeRoot.current!==handle)return;
   setEpoch(v=>v+1);setReadAt(new Date().toLocaleString('zh-CN'));setReadIssue('');setStatus(practiceOnly?'工程可读取，保存后可以在 IDEA 运行。':'工程可读取，检查时会重新采集稳定快照。');
   const current=latest.current;
   const reconcile=async()=>{
    const presence=await openFilePresence(handle,Object.keys(current.buffers));
    if(activeRoot.current!==handle)return;
    const removed=[...presence].filter(([,exists])=>exists===false).map(([path])=>path);
    setMissing(previous=>{
     const next=new Set(previous);
     for(const [path,exists] of presence){if(exists===false)next.add(path);else if(exists)next.delete(path)}
     return next;
    });
    if(removed.length){
     setBuffers(previous=>{
      const next={...previous};
      for(const path of removed){
       const buffer=next[path];
       if(buffer===current.buffers[path]&&buffer.base===buffer.value)delete next[path];
      }
      return next;
     });
    }
    const {view,buffers}=current,buffer=buffers[view];
    if(!buffer||presence.get(view)!==true)return;
    try{
     const value=await readText(handle,view);
     if(activeRoot.current!==handle||latest.current.view!==view)return;
     if(buffer.base!==buffer.value){
      setDiskCopy(previous=>{
       if(value===buffer.base)return undefined;
       return previous?.path===view&&previous.value===value?previous:{path:view,value};
      });
      return;
     }
     setDiskCopy(undefined);
     if(value===buffer.base)return;
     setBuffers(previous=>previous[view]===buffer?{...previous,[view]:{base:value,value}}:previous);
    }catch{/* A concurrent IDE save can temporarily make this path unreadable. Recheck on the next refresh. */}
   };
   const updateStamp=async()=>{
    try{
     const nextStamp=await projectStamp(handle,context.courseId);
     if(activeRoot.current!==handle)return;
     if(stamp.current&&stamp.current!==nextStamp)setCurrentKey('');
     stamp.current=nextStamp;
     setCheckIssue('');
    }catch(e){
     if(activeRoot.current!==handle)return;
     setCurrentKey('');
     const failure=e as Error & {path?:string};
     setCheckIssue(isMissingProjectEntry(e)
      ? context.courseId==='http-json-basics'?'课程要求根目录包含 TaskServer.java。请在IDE中补齐，或连接本课程的工程目录。':`暂时找不到课程检查文件${failure.path?'：'+failure.path:''}。请在IDE中核对后刷新。`
      : '暂时无法核对课程检查文件。'+failure.message);
    }
   };
   await Promise.all([reconcile(),updateStamp()]);
  }catch(e){if(activeRoot.current!==handle)return;setCurrentKey('');setReadIssue((e as Error).message);setStatus('工程已记住，但文件暂时无法读取；原文件和网页修改均保留。')}})();
  refreshing.current=work;try{await work}finally{if(refreshing.current===work)refreshing.current=null}
 }
 async function connect(mode:'native'|'browser'=native?'native':'browser'){setError('');if(dirty.length){setError('请先保存当前网页修改，再更换项目目录。');return}try{
  let handle:LocalDirectory;
  if(mode==='native'){const cancel=new AbortController();pickerCancel.current=cancel;setPicking(true);setStatus('请在系统窗口选择学习工程；也可取消后继续原工程。');setBusy(true);try{handle=await pickNativeDirectory(cancel.signal)}finally{setPicking(false);pickerCancel.current=null}}else{
  const picker=(window as unknown as {showDirectoryPicker?:(options:unknown)=>Promise<LocalDirectory>}).showDirectoryPicker;
  if(!picker)throw new Error('本地同步需要桌面版Chrome或Edge，请用该浏览器打开本站。');
  setStatus('正在等待选择项目目录；取消后可继续阅读课程。');setBusy(true);
  handle=await picker({id:'cs-project-'+context.courseId,mode:'readwrite',...(root&&!root.bridge?{startIn:root}:{})});}
  const entries=await listDirectory(handle);if(entries.some(e=>e.name==='new-system')&&entries.some(e=>e.name==='PRODUCT.md')||entries.some(e=>e.name==='package.json')&&JSON.parse(await readText(handle,'package.json')).name==='codesomething-frontend')throw new Error('这是网站自身的工程目录。请在网站目录之外创建并选择学习项目。');
  setBusy(true);activeRoot.current=handle;stamp.current='';setRoot(handle);setAuthorized(true);setBuffers({});setMissing(new Set());setCheckIssue('');setDiscarded(undefined);setDiskCopy(undefined);setView('');setCurrentKey('');setStatus('正在核对新工程目录。');
  try{await rememberDirectory(storageKey,handle)}catch{setError('工程可读写，但记忆根目录失败；请检查浏览器存储设置。')}
  await refresh(handle);
 }catch(e){if((e as Error).name==='AbortError')setStatus(root?'已取消选择，原工程连接保持。':'已取消选择目录，可以继续阅读，准备好后再连接。');else {setStatus(root?'新目录未连接，原工程保持。':'工程尚未连接，请按提示重试。');setError((e as Error).message)}}finally{setBusy(false)}}
 async function authorize(){if(!root)return;setError('');try{if(await root.requestPermission({mode:'readwrite'})!=='granted')throw new Error('尚未获得工程读写权限，请点击重新授权。');setAuthorized(true);await refresh(root);setStatus('已恢复工程读写。')}catch(e){setError((e as Error).message)}}
 async function open(path:string){
  if(!root||!authorized||busy)return;
  const sequence=++openSequence.current,handle=root;
  setError('');
  try{
   const existing=buffers[path];
   const value=existing&&existing.base!==existing.value?existing.value:await readText(root,path);
   if(activeRoot.current!==handle||sequence!==openSequence.current)return;
   setBuffers(previous=>{
    const current=previous[path];
    const next=current&&current.base!==current.value?{...current,closed:false}:{base:value,value};
    return {...previous,[path]:next};
   });
   setView(path);
  }catch(e){if(activeRoot.current===handle&&sequence===openSequence.current)setError((e as Error).message)}
 }
 function closeTab(path:string){
  if(tabs.length<=1)return;
  openSequence.current++;
  setBuffers(previous=>{
   const buffer=previous[path];
   if(!buffer)return previous;
   const next={...previous};
   if(buffer.base!==buffer.value)next[path]={...buffer,closed:true};
   else delete next[path];
   return next;
  });
  const index=tabs.findIndex(([tab])=>tab===path);
  const next=tabs[index+1]?.[0]??tabs[index-1]?.[0]??'';
  if(view===path)setView(next);
  requestAnimationFrame(()=>{
   const button=tabButtons.current.get(next)??(directory.current?.offsetWidth ? directory.current.querySelector<HTMLElement>('button, summary') : treeTrigger.current);
   button?.focus();
  });
 }
 async function save(){
  if(refreshing.current)await refreshing.current;
  if(!root)throw new Error('请先选择工程。');
  for(const [path,buffer] of dirty){
   await saveText(root,path,buffer.base,buffer.value);
   setBuffers(previous=>{
    const current=previous[path],next={...previous};
    const value=current?.value??buffer.value;
    if(current?.closed&&value===buffer.value)delete next[path];
    else next[path]={...current,base:buffer.value,value};
    return next;
   });
  }
 }
 async function discard(){if(!root||!buffers[view])return;const path=view,buffer=buffers[view];setBusy(true);setError('');try{
  const presence=await openFilePresence(root,[path]);
  if(presence.get(path)===false){
   setBuffers(previous=>{const next={...previous};delete next[path];return next});
  }else{
   const value=await readText(root,path);
   setBuffers(previous=>({...previous,[path]:{base:value,value}}));
  }
  setDiscarded({path,buffer});
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function verifyBeforeComplete(){if(!root||!authorized)throw new Error('请先恢复工程读取权限。');setBusy(true);try{await save();const before=await projectStamp(root,context.courseId);const files=await collectCheckFiles(root,context.courseId),key=signature(files);const after=await projectStamp(root,context.courseId);stamp.current=after;if(before!==after){setCurrentKey('');throw new Error('工程在读取期间发生变化，请等待IDE保存完成后重试。')}setCurrentKey(key);if(key!==reportKey)throw new Error('本地工程已变化，请重新提交验证后再完成本关。');const draft=await learningRequest<Draft>('/browser-workspaces',{...context,clientKey:token});const saved=await learningRequest<Draft>('/browser-workspaces/'+draft.id+'/draft',{expectedRevision:draft.revision,files},token);if(saved.digest!==job?.report?.snapshotDigest)throw new Error('工程快照已变化，请重新验证。')}finally{setBusy(false)}}
 async function saveAll(){setBusy(true);setError('');try{await save();setStatus('网页修改已保存到本地工程。');await refresh(root!)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function run(){if(!root)return;setResultsOpen(true);if(matchMedia('(width < 640px)').matches)mobileView?.select('report');if(resultPanel.current)resultPanel.current.scrollTop=0;
  if(matchMedia('(width <= 768px)').matches)requestAnimationFrame(()=>resultPanel.current?.scrollIntoView({block:'nearest'}));
  setBusy(true);setError('');try{
  await save();const before=await projectStamp(root,context.courseId);const files=await collectCheckFiles(root,context.courseId),key=signature(files);const after=await projectStamp(root,context.courseId);stamp.current=after;if(before!==after){setCurrentKey('');throw new Error('工程在读取期间发生变化，请等待IDE保存完成后重试。')}setCurrentKey(key);setReadAt(new Date().toLocaleString('zh-CN'));
  const draft=await learningRequest<Draft>('/browser-workspaces',{...context,clientKey:token});const saved=await learningRequest<Draft>('/browser-workspaces/'+draft.id+'/draft',{expectedRevision:draft.revision,files},token);const submission=await learningRequest<Submission>('/submissions',{bindingId:saved.id,expectedDigest:saved.digest},token);setSubmissionId(submission.id);const value=await learningRequest<CheckJob>('/check-jobs',{submissionId:submission.id,idempotencyKey:'folder-'+submission.id},token);setReportKey(key);setJob(value);try{sessionStorage.setItem(resultKey,JSON.stringify({jobId:value.id,submissionId:submission.id,selectionKey:key}))}catch{}setStatus('已从本地读取并提交'+Object.keys(files).length+'个检查文件。');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{
  if(!verifyRef)return;
  verifyRef.current=verifyBeforeComplete;
  return ()=>{verifyRef.current=null};
 });
 const runPassed=report?.status==='passed'&&!report.stale&&!busy;
 useEffect(()=>{
  if(runPassed&&document.activeElement===runButton.current){
   resultPanel.current?.querySelector<HTMLElement>('.completion-next:not(:disabled)')?.focus({preventScroll:true});
  }
 },[runPassed]);
 const completionAction=(report||automaticPractice)&&<CodeCompletion context={context} job={report} token={token}
  nextHref={nextHref} nextLabel={nextLabel} beforeComplete={verifyBeforeComplete} disabled={busy||checking(job)||dirtyMissing||!!checkIssue}/>;
 return <section className="folder-project-workspace" data-passed={report?.status==='passed'&&!report.stale||undefined} aria-label="本地工程工作区">
  <header className="folder-workspace-toolbar">
  <p className="folder-toolbar-status" role="status" title={[root&&(root.bridge?'本机服务连接':'浏览器授权连接'),status,readAt].filter(Boolean).join(' · ')}>
   <span className="project-sync-dot" data-state={error||readIssue?'error':dirty.length?'dirty':busy?'busy':authorized?'synced':'offline'} aria-hidden="true"/>
   <strong>{root?.name||'工程工作区'}</strong><span className="sr-only"> · {status} {dirty.length?'有未保存修改':''}</span>
  </p>
  <details className="folder-project-options">
   <summary title="工程操作">工程操作</summary>
   <div className="folder-tools-menu">
    <p>{status}{readAt&&' · '+readAt}</p>
    {native&&<button className="btn button secondary" type="button" disabled={busy||checking(job)} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');void connect('browser')}}>浏览器授权连接（备用）</button>}
    {picking&&<button className="btn button secondary" type="button" onClick={()=>pickerCancel.current?.abort()}>取消选择</button>}
    {root&&authorized&&<>
     <button className="btn button secondary" type="button" disabled={busy||checking(job)} onClick={()=>void connect()}>{!root.bridge&&native?'改用本机工程连接':'更换项目目录'}</button>
     <button className="btn button secondary" type="button" disabled={busy} onClick={()=>void refresh(root).catch(e=>setError(e.message))}><RefreshCw size={15} aria-hidden="true"/>刷新目录</button>
    </>}
    {discarded&&<button className="text-button" disabled={busy} onClick={()=>{setBuffers(previous=>({...previous,[discarded.path]:discarded.buffer}));setView(discarded.path);setDiscarded(undefined)}}>恢复刚才的网页修改</button>}
    {closedDrafts.length>0&&<button type="button" className="text-button" disabled={busy} onClick={()=>void open(closedDrafts[0][0])}>查看已关闭的草稿（{closedDrafts.length}）</button>}
    <details><summary>创建工程与打开IDEA</summary>{guide}</details>
   </div>
  </details>
  <div className="project-sync-actions">
   {root&&authorized?<>
    <button className="btn button secondary project-save" type="button" disabled={busy||!dirty.length||dirtyMissing} onClick={()=>void saveAll()}><Save size={16} aria-hidden="true"/>保存到本地{dirty.length?'（'+dirty.length+'）':''}</button>
    {!practiceOnly&&<button ref={runButton} type="button" className="btn button primary project-run" data-passed={runPassed||undefined} disabled={busy||checking(job)||dirtyMissing||!!checkIssue} onClick={()=>void run()}>{checking(job)?'正在验证…':busy?'正在准备…':runPassed?<><Check size={15} aria-hidden="true"/>运行通过</>:automaticPractice?'运行并检查':'提交验证'}</button>}
    <span className="sr-only">{dirtyMissing?'请先处理已移动或删除文件的网页草稿。':dirty.length?(practiceOnly?'有未保存修改。请先保存到本地，再到 IDEA 运行。':'有未保存修改；提交时会先保存到本地。'):'所有网页修改均已保存。'}</span>
   </>:root&&!root.bridge?<button className="btn button secondary" type="button" onClick={()=>void authorize()}>重新授权</button>:root?<button className="btn button secondary" type="button" disabled={busy||checking(job)} onClick={()=>void connect()}><FolderOpen size={16} aria-hidden="true"/>更换项目目录</button>:null}
  </div>
 </header>
  {readIssue&&<p role="status">{readIssue}</p>}
  {error&&<p className="workspace-error" ref={alert} tabIndex={-1} role="alert">{error}</p>}
  {!root&&<ProjectStartCard practiceOnly={practiceOnly} disabled={busy||picking||checking(job)} onConnect={()=>void connect()}/>}
  {root&&authorized&&<>
 <div className="folder-project-content">
 <ProjectFileDrawer directory={directory} trigger={treeTrigger} editor={toggle=><div className="folder-file-view">
 <div className="project-tab-toolbar"><ProjectOpenFiles trigger={toggle} activePath={view}>{tabs.map(([path,buffer])=>{
  const name=path.split('/').pop();
  const duplicate=tabs.some(([other])=>other!==path&&other.split('/').pop()===name);
  return <div className="project-open-tab" data-active={view===path} key={path}>
   <button type="button" className="btn button secondary" ref={node=>{if(node)tabButtons.current.set(path,node);else tabButtons.current.delete(path)}} aria-pressed={view===path} onClick={()=>void open(path)} title={path}>{duplicate?path:name}{buffer.base!==buffer.value&&<span className="sr-only"> 未保存</span>}</button>
   {tabs.length>1?<button type="button" className="btn button secondary project-close-tab" disabled={busy} aria-label={'关闭 '+path} title={'关闭 '+path} onClick={()=>closeTab(path)}>{buffer.base!==buffer.value?<span aria-hidden="true" className="tab-dirty">●</span>:<X size={14} aria-hidden="true"/>}</button>:buffer.base!==buffer.value&&<span className="tab-dirty project-single-dirty" aria-hidden="true">●</span>}
  </div>;
 })}</ProjectOpenFiles></div><div className="folder-editor-content">{view&&buffers[view]?<>{missing.has(view)&&<p role="status">此文件已移动或删除。网页草稿已保留，可以复制到新位置。</p>}{hasConflict&&<details className="project-disk-version" key={view}>
    <summary>查看磁盘版本（网页草稿已保留）</summary>
    <textarea aria-label={'磁盘版本 '+view} value={diskCopy.value} readOnly rows={8} spellCheck={false}/>
   </details>}<CodeEditor path={view} value={buffers[view].value} readOnly={busy} onChange={value=>setBuffers(previous=>({...previous,[view]:{...previous[view],value}}))}/>{buffers[view].base!==buffers[view].value&&<button className="text-button" disabled={busy} onClick={()=>void discard()}>{missing.has(view)?'丢弃此文件网页草稿':'丢弃此文件网页修改并重新读取'}</button>}</>:<div className="project-editor-empty"><FileCode2 size={28} aria-hidden="true"/><p>从项目目录打开文件<br/>在IDE或这里编辑，使用同一份本地工程。</p>{!view&&tabs.length>0&&<button type="button" className="btn button secondary" onClick={()=>setView(tabs[0][0])}>重新打开 {tabs[0][0].split('/').pop()}</button>}</div>}</div></div>}>
  <Directory {...{root,view,epoch}} onView={path=>void open(path)}/>
 </ProjectFileDrawer></div>{!practiceOnly&&<>{checkIssue&&<p role="status">{checkIssue}</p>}<span className="sr-only">验证时自动读取本章源码，检查结果对应提交时的文件快照。</span></>}</>}{practiceOnly?<div className="practice-result-note">{practiceFooter}</div>:<>
 {resultsOpen&&<WorkspaceDivider dock/>}
 <section className="workspace-results workspace-dock-results" data-expanded={resultsOpen}>
 <button type="button" className="workspace-results-toggle" aria-expanded={resultsOpen}
  aria-controls={resultsId} onClick={()=>setResultsOpen(value=>!value)}>
  <span>运行结果</span><span role="status">{checking(job)?'正在验证…':report?.stale?'旧结果':report?.status==='passed'?'功能通过':report?'查看反馈':busy?'正在读取与保存…':'尚未运行'} · {resultsOpen?'收起':'展开'}</span>
 </button>
 <div ref={resultPanel} id={resultsId} className="workspace-output" role="region" aria-label="本次运行结果" tabIndex={0} hidden={!resultsOpen && !mobileView?.reportVisible}>
 {report?<CheckJobReport job={report} action={completionAction}/>:completionAction}
 {!report&&<p className="workspace-result-empty">{busy?'正在读取工程文件并准备检查…':'运行代码后在这里查看实际结果。'}</p>}
 <div className="button-row">{job&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void (job.status==='awaiting_runner'?learningRequest<CheckJob>('/check-jobs',{submissionId:job.submissionId,idempotencyKey:'folder-'+job.submissionId},token):learningRequest<CheckJob>('/jobs/'+job.id,undefined,token)).then(value=>{setJob(value);setError('')}).catch(e=>setError(e.message))}>刷新检查状态</button>}{checking(job)&&<button type="button" className="button secondary" disabled={busy||job?.status==='cancelling'} onClick={()=>void learningRequest<CheckJob>('/jobs/'+job!.id+'/cancel',{},token).then(setJob).catch(e=>setError(e.message))}>取消检查</button>}</div></div></section></>}</section>;
}

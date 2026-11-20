import {CodeCompletion} from './CodeCompletion';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Play,Square,Download,FileCode2,Cloud,RefreshCw} from 'lucide-react';
import {LocalDirectorySave} from '../../../components/code/LocalDirectorySave';
import {CodeEditor} from '../../../components/code/CodeEditor';
import {learningRequest,type CheckJob,type Submission} from '../../../api/learning-api';
import {CheckJobReport} from './CheckJobReport';
type Files=Record<string,string>;
type Draft={id:string;token?:string;revision:number;files:{path:string;content:string}[];digest:string;updatedAt:string;submissionId:string|null;jobId:string|null};
type Context={courseId:string;courseVersion:string;stageId:string};
const running=(job:CheckJob|null)=>!!job&&['queued','running','cancelling','awaiting_runner'].includes(job.status);
export function BrowserWorkspace({context,onJobChange,onContinue,nextHref}:{nextHref?:string;nextLabel?:string;verifyRef?:React.RefObject<(()=>Promise<void>)|null>;context:Context;onJobChange?:(job:CheckJob|null,identity:string,token?:string,submissionId?:string)=>void;onContinue?:()=>void}){
 const legacyStorageKey='cs-browser-'+[context.courseId,context.courseVersion,context.stageId].join('-');
 const storageKey='cs-browser-project-'+[context.courseId,context.courseVersion].join('-');
 const [draft,setDraft]=useState<Draft|null>(null),[files,setFiles]=useState<Files>({}),[selected,setSelected]=useState(''),[job,setJob]=useState<CheckJob|null>(null),[submissionId,setSubmissionId]=useState<string>();
 const [error,setError]=useState(''),[status,setStatus]=useState('正在准备网页工作区…'),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[conflict,setConflict]=useState(false),[retry,setRetry]=useState(0),[line,setLine]=useState<number>();
 const current=useRef<Files>({}),revision=useRef(0),token=useRef(''),saved=useRef(''),paused=useRef(false),loaded=useRef(false),alive=useRef(true),queue=useRef<Promise<unknown>>(Promise.resolve()),draftRef=useRef<Draft|null>(null);
 const output=useRef<HTMLDivElement>(null),requestedRun=useRef(false);
 const [resultsOpen,setResultsOpen]=useState(true);
 const [newFileKind,setNewFileKind]=useState<'java'|'test'|null>(null),[newFileName,setNewFileName]=useState('');
 useEffect(()=>{if(requestedRun.current&&job&&!running(job)&&job.report){requestedRun.current=false;setResultsOpen(true);requestAnimationFrame(()=>{output.current?.focus({preventScroll:true});output.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})})}},[job?.status]);
 const cache=useCallback((next:Files,isDirty:boolean)=>{try{localStorage.setItem(storageKey+'-draft',JSON.stringify({files:next,baseRevision:revision.current,dirty:isDirty}))}catch{setError('浏览器恢复副本无法保存，请保持服务连接并确认服务器保存成功。')}},[storageKey]);
 useEffect(()=>{let active=true;alive.current=true;loaded.current=false;
  void (async()=>{let key=localStorage.getItem(storageKey+'-key');if(!key){key=localStorage.getItem(legacyStorageKey+'-key')||crypto.randomUUID();localStorage.setItem(storageKey+'-key',key)}token.current=key;
   const value=await learningRequest<Draft>('/browser-workspaces',{...context,clientKey:key});if(!active)return;
   draftRef.current=value;setDraft(value);revision.current=value.revision;
   let next=Object.fromEntries(value.files.map(f=>[f.path,f.content]));saved.current=JSON.stringify(next);let restore=false;
   try{const raw=localStorage.getItem(storageKey+'-draft')||localStorage.getItem(legacyStorageKey+'-draft');if(raw){const local=JSON.parse(raw);if(local.dirty&&JSON.stringify(local.files)!==saved.current){next=local.files;restore=true;if(local.baseRevision!==value.revision){paused.current=true;setConflict(true);setError('恢复副本与服务器版本不同，请选择保留的版本。')}}}}catch{setError('本机恢复副本无法读取，已读取服务器草稿。')}
   current.current=next;setFiles(next);setSelected(Object.keys(next).find(p=>p.endsWith('.java')&&!p.endsWith('Application.java'))||Object.keys(next).find(p=>p.endsWith('.java'))||Object.keys(next)[0]);setDirty(restore);loaded.current=true;setStatus(restore?'已恢复尚未保存的修改':'已恢复本项目代码');
   if(value.jobId){setSubmissionId(value.submissionId||undefined);setJob(await learningRequest<CheckJob>('/jobs/'+value.jobId,undefined,key))}
  })().catch(e=>{if(active){setError(e.message);setStatus('工作区未连接')}});
  return()=>{active=false;alive.current=false};
 },[storageKey,context.stageId,retry]);
 function edit(next:Files){current.current=next;setFiles(next);const changed=JSON.stringify(next)!==saved.current;setDirty(changed);setLine(undefined);cache(next,changed);setStatus(changed?'有修改待保存':'已保存到服务器')}
 const save=useCallback(async()=>{
  const task=queue.current.catch(()=>{}).then(async()=>{if(paused.current)throw new Error('请先解决版本冲突。');const workspace=draftRef.current;if(!workspace)throw new Error('工作区尚未连接。');const snapshot=current.current;const encoded=JSON.stringify(snapshot);if(encoded===saved.current)return workspace;
   setStatus('正在保存…');
   try{const value=await learningRequest<Draft>('/browser-workspaces/'+workspace.id+'/draft',{expectedRevision:revision.current,files:snapshot},token.current);
    revision.current=value.revision;saved.current=encoded;draftRef.current=value;if(alive.current){setDraft(value);const changed=JSON.stringify(current.current)!==encoded;setDirty(changed);cache(current.current,changed);setStatus(changed?'有修改待保存':'已保存到服务器');setError('')}return value;
   }catch(e){const message=(e as Error).message;if(message.includes('其他页面')){paused.current=true;setConflict(true)}setError(message);setStatus('保存未完成 · 本机恢复副本已保留');throw e}
  });queue.current=task;return task;
 },[cache]);
 useEffect(()=>{if(!dirty||!loaded.current||conflict)return;const timer=setTimeout(()=>void save().catch(()=>{}),800);return()=>clearTimeout(timer)},[files,dirty,conflict,save]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(loaded.current&&JSON.stringify(current.current)!==saved.current){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[]);
 const changedSinceReport=dirty||conflict||!!(job?.report&&draft&&job.report.snapshotDigest!==draft.digest);
 useEffect(()=>{onJobChange?.(job?{...job,stale:job.stale||changedSinceReport,freshness:changedSinceReport?'changed' as const:job.freshness}:null,context.courseVersion+context.stageId,token.current,submissionId)},[job,changedSinceReport,onJobChange,submissionId]);
 useEffect(()=>{if(!job)return;let active=true,polling=false;async function poll(){if(polling)return;polling=true;try{const next=await learningRequest<CheckJob>('/jobs/'+job!.id,undefined,token.current);if(active)setJob(next)}catch(e){if(active)setError((e as Error).message)}finally{polling=false}}const timer=setInterval(()=>{if(running(job))void poll()},1000);const focus=()=>void poll();window.addEventListener('focus',focus);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus)}},[job?.id,job?.status]);
 async function perform(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function run(){await perform(async()=>{const value=await save();const submission=await learningRequest<Submission>('/submissions',{bindingId:value.id,expectedDigest:value.digest},token.current);setSubmissionId(submission.id);const next=await learningRequest<CheckJob>('/check-jobs',{submissionId:submission.id,idempotencyKey:'web-'+submission.id},token.current);requestedRun.current=true;setResultsOpen(true);setJob(next);setStatus('代码快照已提交到隔离运行环境')})}
 async function resolve(keepLocal:boolean){await perform(async()=>{const server=await learningRequest<Draft>('/browser-workspaces/'+draft!.id,undefined,token.current);revision.current=server.revision;draftRef.current=server;saved.current=JSON.stringify(Object.fromEntries(server.files.map(f=>[f.path,f.content])));paused.current=false;setConflict(false);if(keepLocal){await save()}else{const next=Object.fromEntries(server.files.map(f=>[f.path,f.content]));current.current=next;setFiles(next);setDirty(false);setDraft(server);cache(next,false);setStatus('已读取服务器版本')}})}
 function exportFile(){const url=URL.createObjectURL(new Blob([files[selected]||''],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=selected.split('/').pop()||'source.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function createFile(kind:'java'|'test'|'notes',nameInput?:string){
  if(kind!=='notes'&&nameInput===undefined){setNewFileKind(kind);setNewFileName('');return}
  const input=kind==='notes'?'RUN':nameInput?.trim();if(!input)return;
  if(!/^[A-Za-z][A-Za-z0-9]*$/.test(input)){setError('类名须为英文字母开头，只含字母和数字。');return}
  const name=kind==='test'&&!input.endsWith('Test')?input+'Test':input;
  const path=kind==='notes'?'RUN.md':`src/${kind==='test'?'test':'main'}/java/dev/codesomething/lab/${name}.java`;
  if(current.current[path]===undefined)edit({...current.current,[path]:kind==='notes'?'# 项目运行说明\n\n':`package dev.codesomething.lab;\n\npublic class ${name} {\n\n}\n`});setSelected(path);setNewFileKind(null);setNewFileName('');setError('');
 }
 const report=job?{...job,stale:job.stale||changedSinceReport,freshness:changedSinceReport?'changed' as const:job.freshness}:null;
 const locations=[...new Set((job?.report?.log||'').match(/(?:[\w/]+\.java):\d+/g)||[])];
 return <section className="browser-workspace" aria-label="网页编程工作区"><header className="workspace-toolbar"><div><h3><FileCode2 size={20} aria-hidden="true"/>代码</h3></div><div className="workspace-status" role="status"><Cloud size={15} aria-hidden="true"/><span>{status}</span>{draft&&<span>版本 {draft.revision}</span>}</div><div className="workspace-primary-actions"><details className="workspace-options"><summary>工程操作</summary><div className="workspace-actions"><LocalDirectorySave files={files} disabled={busy}/><button className="text-button" disabled={busy||!dirty||conflict} onClick={()=>void perform(async()=>{await save()})}>立即保存</button><button className="text-button" onClick={exportFile}><Download size={14} aria-hidden="true"/>导出当前文件</button>{running(job)&&<button className="button secondary" disabled={busy||job?.status==='cancelling'} onClick={()=>void perform(async()=>setJob(await learningRequest('/jobs/'+job!.id+'/cancel',{},token.current)))}><Square size={14} aria-hidden="true"/>停止运行</button>}{job&&!running(job)&&<button className="text-button" onClick={()=>void perform(async()=>setJob(await learningRequest('/jobs/'+job.id,undefined,token.current)))}><RefreshCw size={14} aria-hidden="true"/>刷新结果</button>}</div></details><button className="button primary" disabled={busy||!draft||conflict||running(job)} onClick={()=>void run()}><Play size={16} aria-hidden="true"/>{busy?'正在提交…':running(job)?'正在运行…':'运行并检查'}</button></div></header>
{job?.report&&<button type="button" className="workspace-result-link text-button" onClick={()=>{setResultsOpen(true);output.current?.focus({preventScroll:true})}}>查看我的运行效果 · {job.status==='passed'?'功能通过':'查看反馈'}</button>}
 {error&&<div className="workspace-error" role="alert"><p>{error}</p>{conflict?<div className="button-row"><button className="button secondary" onClick={()=>void resolve(false)}>读取服务器版本</button><button className="button secondary" onClick={()=>void resolve(true)}>保留本页代码并保存</button></div>:<button className="button secondary" onClick={()=>draft?void perform(async()=>{await save()}):setRetry(n=>n+1)}>重试连接与保存</button>}</div>}
 {draft&&<><div className="workspace-files" role="group" aria-label="工作区文件">{Object.keys(files).map(path=><button key={path} className={path===selected?'active':''} aria-pressed={path===selected} onClick={()=>{setSelected(path);setLine(undefined)}} title={path}><FileCode2 size={14} aria-hidden="true"/>{path.split('/').pop()}</button>)}{context.courseId!=='http-json-basics'&&<><button onClick={()=>createFile('java')}>＋ Java文件</button><button onClick={()=>createFile('test')}>＋ JUnit测试</button><button onClick={()=>createFile('notes')}>＋ 运行说明</button></>}</div>
 {newFileKind&&<form className="workspace-new-file" onSubmit={e=>{e.preventDefault();createFile(newFileKind,newFileName)}}><label>{newFileKind==='test'?'测试类名':'Java类名'}<input autoFocus required value={newFileName} onChange={e=>setNewFileName(e.target.value)} placeholder={newFileKind==='test'?'TaskServiceTest':'HealthController'} autoComplete="off" spellCheck={false}/></label><p>文件将放入当前工程的{newFileKind==='test'?'src/test':'src/main'}/java/dev/codesomething/lab目录。</p><div className="button-row"><button className="btn button primary" type="submit">创建并编辑</button><button type="button" className="button secondary" onClick={()=>setNewFileKind(null)}>取消</button></div></form>}
 <CodeEditor path={selected} value={files[selected]||''} onChange={value=>edit({...current.current,[selected]:value})} readOnly={selected==='pom.xml'} line={line}/>
 
 {locations.length>0&&<div className="workspace-locations">{locations.map(location=><button key={location} className="text-button" onClick={()=>{const [path,line]=location.split(':');const match=Object.keys(files).find(p=>p===path||p.split('/').pop()===path.split('/').pop());if(match){setSelected(match);setLine(Number(line))}}}>定位 {location.split('/').pop()}</button>)}</div>}
 <section className="workspace-results" data-expanded={resultsOpen}><button type="button" className="workspace-results-toggle" aria-expanded={resultsOpen} aria-controls={"results-"+context.stageId} onClick={()=>setResultsOpen(v=>!v)}><span>运行结果</span><span>{running(job)?'正在运行…':report?report.stale?'旧结果':report.status==='passed'?'功能通过':'查看反馈':'尚未运行'} · {resultsOpen?'收起':'展开'}</span></button><div ref={output} id={"results-"+context.stageId} className="workspace-output" tabIndex={-1} aria-label="本次运行结果" hidden={!resultsOpen}>{report?<CheckJobReport job={report}/>:<p className="workspace-result-empty">{running(job)?'正在本机隔离环境中编译运行…':'运行代码后，在这里查看实际响应与检查反馈。'}</p>}<CodeCompletion job={report} token={token.current} context={context} nextHref={nextHref}/>{report?.status==='passed'&&!report.stale&&onContinue&&<button className="text-button" onClick={onContinue}>补充巩固理解（可选）</button>}</div></section>
 </>}
 </section>;
}

import {useEffect,useRef,useState} from 'react';
import {learningRequest,type Binding,type Preview,type Submission,type CheckJob} from '../../../api/learning-api';
import {CheckJobReport,isChecking} from './CheckJobReport';
import {handoffFailure} from '../../../api/ide-handoff';
import {CodeCompletion} from './CodeCompletion';

export function WorkspaceSubmission({context={courseId:'http-json-basics',courseVersion:'1.0.0',stageId:'json-task-response'},evidence,onJobChange,nextHref}:{nextHref?:string;evidence?:{submissionId:string;jobId:string};context?:{courseId:string;courseVersion:string;stageId:string};onJobChange?:(job:CheckJob|null,identity:string,token?:string,submissionId?:string)=>void}={}){
 const legacy=context.courseId==='http-json-basics'&&context.courseVersion==='1.0.0';const bindingKey=legacy?'cs-workspace-http-json':'cs-workspace-'+context.courseId+'-'+context.courseVersion+'-'+context.stageId;const submissionKey=legacy?'cs-submission-http-json':'cs-submission-'+context.courseId+'-'+context.courseVersion+'-'+context.stageId;
 const [directory,setDirectory]=useState('');const [binding,setBinding]=useState<Binding|null>(null);const [preview,setPreview]=useState<Preview|null>(null);
 const [submission,setSubmission]=useState<Submission|null>(null);const [job,setJob]=useState<CheckJob|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState(()=>new URLSearchParams(window.location.search).has('ide-handoff-error')?(handoffFailure()||'网页交接未完成，请从IDE重新打开报告，并允许当前标签页保存会话。'):'');
 const attemptKey=useRef('');
 const [sources,setSources]=useState<Record<string,string>>({}),[sourcePath,setSourcePath]=useState('');
 const directoryKey='cs-local-project-directory-'+context.courseId;
 useEffect(()=>{try{setDirectory(localStorage.getItem(directoryKey)||'')}catch{}},[directoryKey]);
 useEffect(()=>{onJobChange?.(job,context.courseVersion+context.stageId,binding?.token,submission?.id)},[job,onJobChange,context.courseVersion,context.stageId,binding?.token,submission?.id]);
 const errorRef=useRef<HTMLParagraphElement>(null);useEffect(()=>{if(error)errorRef.current?.focus()},[error]);
 useEffect(()=>{let active=true;try{const saved=evidence?sessionStorage.getItem('cs-submission-auth-'+evidence.submissionId)||sessionStorage.getItem(bindingKey):sessionStorage.getItem(bindingKey);if(saved){const value=JSON.parse(saved) as Binding;setBinding(value);setDirectory(value.directory);const submissionId=evidence?.submissionId||sessionStorage.getItem(submissionKey);if(submissionId)void learningRequest<Submission>('/submissions/'+submissionId,undefined,value.token).then(async record=>{if(active)setSubmission(record);const jobs=await learningRequest<CheckJob[]>('/submissions/'+record.id+'/jobs',undefined,value.token);if(active)setJob((evidence?jobs.find(j=>j.id===evidence.jobId):jobs[0])??null)}).catch(()=>{if(active)setError('上次提交暂时无法读取，可重新预览或重试。')})}}catch{};return()=>{active=false}},[]);
 useEffect(()=>{if(!binding||!job)return;let active=true;let timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh(){try{const next=await learningRequest<CheckJob>('/jobs/'+job!.id,undefined,binding!.token);if(active){setJob(next);setError('');if(isChecking(next))timer=setTimeout(refresh,900)}}catch{if(active)setError('检查状态暂时无法读取；作业仍会继续，可点击刷新状态。')}}
  if(isChecking(job))timer=setTimeout(refresh,700);
  const onFocus=()=>{if(!isChecking(job))void refresh()};window.addEventListener('focus',onFocus);
  return()=>{active=false;clearTimeout(timer);window.removeEventListener('focus',onFocus)};
 },[binding?.id,job]);
 async function action(run:()=>Promise<void>){setError('');setBusy(true);try{await run()}catch(e){setError(e instanceof Error?e.message:'无法连接本机服务，请重试。')}finally{setBusy(false)}}
 async function inspect(){await action(async()=>{setPreview(null);setSources({});const next=binding?await learningRequest<Preview>(`/workspace-bindings/${binding.id}/preview`,undefined,binding.token):await learningRequest<Preview>('/workspace-previews',{directory,...context});setPreview(next);if(binding)await readSources(binding,next.digest)})}
 async function readSources(value:Binding,digest?:string){const data=await learningRequest<{files:Record<string,string>}>(`/workspace-bindings/${value.id}/sources`+(digest?'?expectedDigest='+encodeURIComponent(digest):''),undefined,value.token);setSources(data.files);setSourcePath(Object.keys(data.files)[0]||'')}
 async function pair(){if(!preview)return;await action(async()=>{const next=await learningRequest<Binding>('/workspace-bindings',{previewId:preview.id,pairingCode:preview.pairingCode});setBinding(next);try{sessionStorage.setItem(bindingKey,JSON.stringify(next));localStorage.setItem(directoryKey,next.directory)}catch{};setPreview(null);await readSources(next)})}
 async function submit(){if(!binding||!preview)return;await action(async()=>{const saved=await learningRequest<Submission>('/submissions',{bindingId:binding.id,expectedDigest:preview.digest},binding.token);setSubmission(saved);setJob(null);attemptKey.current="";setPreview(null);try{sessionStorage.setItem(submissionKey,saved.id);sessionStorage.setItem('cs-submission-auth-'+saved.id,JSON.stringify(binding))}catch{}})}
 async function check(retry=false){if(!binding||!submission)return;await action(async()=>{if(retry&&!attemptKey.current)attemptKey.current='retry-'+crypto.randomUUID();const result=job&&!retry?await learningRequest<CheckJob>('/jobs/'+job.id,undefined,binding.token):await learningRequest<CheckJob>('/check-jobs',{submissionId:submission.id,idempotencyKey:attemptKey.current||'check-'+submission.id},binding.token);setJob(result);attemptKey.current=''})}
 async function cancel(){if(!binding||!job)return;await action(async()=>{setJob(await learningRequest<CheckJob>('/jobs/'+job.id+'/cancel',{},binding.token))})}
 function disconnect(){setBinding(null);setPreview(null);setSubmission(null);setJob(null);setSources({});setError('');try{sessionStorage.removeItem(bindingKey);sessionStorage.removeItem(submissionKey)}catch{}}
 return <section className="workspace-submission" aria-labelledby="workspace-title"><h3 id="workspace-title">本地项目与提交</h3>
 <p>{['boot-foundations','task-manager','collaboration'].includes(context.courseId)?'复制固定pom.xml、声明包的Java源码及本关测试/运行说明，范围以预览清单为准。':'仅复制TaskServer.java。'}原文件保持在你的练习目录。</p>
 <form onSubmit={e=>{e.preventDefault();void inspect()}}><label htmlFor="practice-directory">练习目录的绝对路径</label><input id="practice-directory" name="directory" type="text" autoComplete="off" spellCheck={false} value={directory} onChange={e=>{setDirectory(e.target.value);setPreview(null)}} disabled={busy||!!binding} required placeholder={context.courseId==='http-json-basics'?'D:\\practice\\http-json':'D:\\practice\\'+context.courseId} aria-describedby={error?'workspace-status workspace-error':'workspace-status'}/>
 <div className="button-row"><button className="button secondary" disabled={busy||!directory.trim()} type="submit">{busy?'处理中…':binding?'重新读取本地文件':'读取文件范围'}</button>{binding&&<button className="button secondary" type="button" disabled={busy} onClick={disconnect}>更换目录</button>}</div></form>
 <p id="workspace-status" role="status">{binding?'目录已配对 · 当前标签页可提交':'先预览文件范围，再确认配对。'}</p>
 {preview&&<div className="snapshot-preview"><h4>{binding?'本次快照预览':'确认允许读取的文件'}</h4><ul>{preview.files.map(file=><li key={file.path}><code>{file.path}</code> · {file.bytes} 字节</li>)}</ul><p className="snapshot-digest">SHA-256 <code>{preview.digest}</code></p>
 {!binding?<><p>预览有效期5分钟。确认后仅授权本关上述文件的快照提交。</p><button className="button primary" disabled={busy} onClick={()=>void pair()}>确认范围并配对</button></>:<button className="button primary" disabled={busy} onClick={()=>void submit()}>保存这份快照</button>}</div>}
 {error&&<p className="inline-feedback" role="alert" id="workspace-error" tabIndex={-1} ref={errorRef}>{error}</p>}
 {Object.keys(sources).length>0&&<section className="local-source-reader" aria-label="本地源码只读查看"><h4>本地文件 · 只读快照</h4><label>查看文件<select name="source-path" value={sourcePath} onChange={e=>setSourcePath(e.target.value)}>{Object.keys(sources).map(path=><option key={path} value={path}>{path}</option>)}</select></label><pre className="local-source-view" tabIndex={0} role="region" aria-label={sourcePath}>{sources[sourcePath]}</pre><p>请在IDE保存修改后重新读取。当前内容是读取时的副本。</p></section>}
 {submission&&<div className="snapshot-preview"><h4>快照已保存</h4><p className="snapshot-digest">提交编号 <code>{submission.id}</code></p><p className="snapshot-digest">代码摘要 <code>{submission.digest}</code></p><p>后续代码改动需要重新预览、保存；此记录始终对应上面的代码版本。</p><button className="button secondary" disabled={busy} onClick={()=>void check()}>{job?'刷新检查状态':'运行代码检查'}</button>{job&&<><div className="button-row">{isChecking(job)?<button className="button secondary" disabled={busy||job.status==="cancelling"} onClick={()=>void cancel()}>取消检查</button>:<button className="button secondary" disabled={busy} onClick={()=>void check(true)}>重新检查此快照</button>}</div><CheckJobReport job={job}/></>}</div>}
 {job&&<CodeCompletion job={job} token={binding?.token} context={context} nextHref={nextHref}/>}
 </section>
}



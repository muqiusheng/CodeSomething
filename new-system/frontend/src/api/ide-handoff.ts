type Transfer = {
 binding:{id:string;directory:string;token:string};
 courseId:string;courseVersion:string;stageId:string;submissionId:string;jobId:string;
};
let lastFailure='';
export const handoffFailure=()=>lastFailure;

export async function receiveIdeHandoff(
 location:Pick<Location,'href'>,
 history:Pick<History,'replaceState'>,
 storage:Pick<Storage,'setItem'>,
 request:(path:string,body:unknown)=>Promise<Transfer>,
):Promise<string|null>{
 const url=new URL(location.href);
 if(!url.hash.startsWith('#ide-handoff='))return null;
 lastFailure='';
 const code=url.hash.slice('#ide-handoff='.length);
 url.hash='';history.replaceState(null,'',url.pathname+url.search);
 try{
  const value=await request('/ide-handoffs/consume',{code});
  const {binding,courseId,courseVersion,stageId,submissionId,jobId}=value;
  if(!['http-json-basics','boot-foundations','task-manager','collaboration'].includes(courseId)||
   !/^[a-z0-9-]+$/.test(stageId)||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(courseVersion))throw new Error('交接课程无效，请从IDE重新打开报告。');
  const legacy=courseId==='http-json-basics'&&courseVersion==='1.0.0';
  const suffix=legacy?'http-json':`${courseId}-${courseVersion}-${stageId}`;
  storage.setItem('cs-workspace-'+suffix,JSON.stringify(binding));
  storage.setItem('cs-submission-'+suffix,submissionId);
  storage.setItem('cs-submission-auth-'+submissionId,JSON.stringify(binding));
  const path=courseId==='http-json-basics'?`/learn/http-json/${courseVersion.slice(0,-2)}/${stageId}`:
   `/learn/${courseId}/${courseVersion.slice(0,-2)}/${stageId}`;
  history.replaceState(null,'',path+`?tab=${encodeURIComponent('任务')}&submission=${encodeURIComponent(submissionId)}&job=${encodeURIComponent(jobId)}`);
  return null;
 }catch(error){
  history.replaceState(null,'',url.pathname+'?tab='+encodeURIComponent('任务')+'&ide-handoff-error=1');
  lastFailure=error instanceof Error?error.message:'网页交接未完成，请从IDE重新打开报告。';
  return lastFailure;
 }
}

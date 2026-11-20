import fs from 'node:fs';
const base='http://127.0.0.1:5179/api/v1/tutor/requests',report={checks:[]};
function assert(value,label){if(!value)throw new Error(label);report.checks.push(label)}
try{
 const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:'http-json-basics',courseVersion:'1.1.0',stageId:'json',level:'example',question:'请给一个只含completed布尔字段的Java文本块JSON局部示例，用两句话解释。不要给完整服务程序。',includeLesson:false,idempotencyKey:'example-'+crypto.randomUUID()})});
 let answer=await response.json();if(!response.ok)throw new Error(answer.message);
 for(let i=0;i<200;i++){answer=await (await fetch(base+'/'+answer.id)).json();if(!['queued','running','cancelling'].includes(answer.status))break;await new Promise(r=>setTimeout(r,200))}
 assert(answer.status==='completed','Real example help completes');assert(answer.level==='example','Example level remains attached to the answer');
 assert(answer.contextManifest===''&&answer.submissionId===null&&answer.jobId===null,'Deselected lesson sends no lesson, code or report context');
 assert(answer.answer.includes('false')&&answer.answer.includes('completed'),'Example demonstrates the requested boolean field');
 assert(!answer.answer.includes('public static void main')&&!answer.answer.includes('class TaskServer'),'Example stays a local snippet rather than a complete submission');
 report.answer=answer;report.result='passed';
}catch(e){report.result='failed';report.error=e.message;throw e}finally{fs.writeFileSync('new-system/docs/acceptance/R2.5/example-checks.json',JSON.stringify(report,null,2))}

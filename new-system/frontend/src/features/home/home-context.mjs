const projects={
 'http-json-basics':{title:'HTTP / JSON 基础',project:'backend-foundations',prefix:'/learn/http-json/1.1/',development:'在本地IDE继续同一份Java工程；网页连接源码、保存并检查。'},
 'sql-foundations':{title:'任务数据实验室',project:'sql-foundations',prefix:'/learn/sql/1.0/',development:'在本地继续SQL脚本，保存后导入本章文件；网页试运行与正式检查分开。'},
 'boot-foundations':{title:'接口启动实验室',project:'boot-foundations',prefix:'/learn/boot-foundations/1.0/'},
 'task-manager':{title:'个人任务管理',project:'task-manager',prefix:'/learn/task-manager/1.0/'},
 collaboration:{title:'学习计划与任务协作',project:'collaboration',prefix:'/learn/collaboration/1.0/'},
};
export function homeContext(resume, lesson){
 const session=resume?.session, courseId=session?.courseId||'http-json-basics';
 const formalTime=Date.parse(session?.updatedAt)||0;
 if(lesson&&(!session||lesson.updatedAt>formalTime)){
  return {courseId:lesson.courseId,title:lesson.title,href:lesson.href,action:lesson.working?'继续本节实操':'继续第 '+lesson.number+' 节',location:'第 '+lesson.number+' 节',development:lesson.outcome||'',projectHref:projects[lesson.courseId]?'/projects/'+projects[lesson.courseId].project:'/path',links:[],firstVisit:false};
 }
 if(!session&&!resume?.progress?.completedCount&&resume?.progress?.passedPractices?.includes('workspace')){
  const hasHttp=resume.progress.passedPractices.includes('workspace-http-text');
  return {courseId,title:hasHttp?'看见浏览器发来了请求':'让浏览器显示你写的文字',href:hasHttp?'/learn/journey/03':'/learn/journey/02',action:hasHttp?'继续第 3 节':'继续第 2 节',location:'HTTP / JSON 基础',development:'沿用已经通过检查的 Java 工程。',projectHref:'/projects/backend-foundations',links:[],firstVisit:false};
 }
 if(!session&&!resume?.progress?.completedCount&&!resume?.progress?.passedPractices?.length){
  return {courseId,title:'让 Java 打印你的第一句话',href:'/learn/journey/01',action:'开始第 1 节',location:'HTTP / JSON 基础',development:'在自己的 Java 工程里运行第一份程序。下一节，让浏览器显示你写的文字。',projectHref:'/projects/backend-foundations',links:[],firstVisit:true};
 }
 const project=projects[courseId];
 if(!project)return {courseId,title:'选择学习项目',href:'/projects',action:'查看项目',location:'此项目请从项目目录继续',development:'在项目页查看当前开发与检查方式。',projectHref:'/projects',links:[]};
 const projectHref='/projects/'+project.project;
 const base=session?(courseId==='http-json-basics'&&session.courseVersion==='1.0.0'?'/learn/http-json/1.0/json-response':project.prefix+session.stageId):null;
 const tab=({teaching:'教学',task:'任务',report:'检查报告',understanding:'理解验证'})[session?.step]||'任务';
 const finished=resume?.progress?.projectCompleted;
 const links=base&&!finished?['教学','任务','检查报告'].map(title=>({title,to:base+'?tab='+encodeURIComponent(title)})):[];
 return {courseId,title:project.title,projectHref,development:project.development||'在本地IDE创建与开发同一工程；网页连接原文件，保存后检查本章功能。',
  href:finished||!base?projectHref:base+'?tab='+encodeURIComponent(tab),action:finished?'查看项目总结':!base?'打开入门项目':tab==='检查报告'?'继续查看报告':tab==='教学'?'继续阅读':tab==='理解验证'?'继续概念巩固':'继续当前任务',
  location:finished?'本项目编码记录已完成':session?.stageId||'从最小Java工程开始',links};
}

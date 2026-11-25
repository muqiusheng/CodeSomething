import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,BookOpen,Terminal,Layers3,Trophy} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {Accordion,AccordionItem,AccordionTrigger,AccordionContent} from '../../components/ui/accordion';
import {JourneyEntry} from '../learning/journey/Journey';
import {JourneyDirectory} from '../learning/journey/JourneyDirectory';
import {modulesForCourse} from '../learning/journey/catalog';

const phases=[
 {title:'HTTP / JSON 基础',course:'http-json-basics',kind:'基础项目',count:'8章',outcome:'用同一个Java接口，逐步读懂、运行、修复并迁移。',entry:'已学过 Java 基础',icon:BookOpen,href:'/projects/backend-foundations',units:[['第1—4章 · 建立直觉','开发准备、HTTP请求、响应与JSON'],['第5—6章 · 运行与追踪','启动真实程序，把请求对应到代码分支'],['第7—8章 · 修改与迁移','修复接口，换成笔记业务独立完成'],['任务数据实验室','数据库与SQL六章已开放；Spring Boot四章已开放']]},
 {title:'任务数据实验室',course:'sql-foundations',kind:'SQL基础',count:'6章',outcome:'用真实MySQL完成建表、查询、写入、分页和迁移。',entry:'建议先完成HTTP/JSON实验室',icon:BookOpen,href:'/projects/sql-foundations',units:[['连接与建模','识别数据库、主键和字段约束'],['查询与写入','WHERE筛选与安全增改删'],['分页与迁移','稳定排序、分页和书签数据']]},
 {title:'接口启动实验室',course:'boot-foundations',kind:'Boot基础',count:'4章',outcome:'从Maven启动到分层，再连接真实MySQL。',entry:'HTTP/JSON基础；JDBC还需SQL写入证据',icon:BookOpen,href:'/projects/boot-foundations',units:[['启动与HTTP','健康接口、路由参数与DTO'],['组件与数据库','构造器注入、分层与参数化JDBC']]},
 {title:'第一个后端项目',course:'task-manager',kind:'项目 A',count:'6 个关卡',outcome:'做出连接数据库的个人任务管理系统。',entry:'完成 HTTP、SQL 与 Spring Boot 基础模块',icon:Terminal,href:'/projects/task-manager',units:[['启动与接口','启动项目、参数与校验'],['数据与功能','建模与 SQL、数据访问、CRUD'],['质量与扩展','分页筛选、统一错误、自动化测试']]},
 {title:'完整业务项目',course:'collaboration',kind:'项目 B',count:'8 个关卡',outcome:'完成支持登录、权限与部署的业务系统。',entry:'能独立完成项目 A 的 CRUD，并解释数据流',icon:Layers3,href:'/projects/collaboration',units:[['用户与权限','登录、角色与越权检查'],['业务可靠性','事务、日志、统一异常与测试'],['运行与部署','部署服务，用配套前端演示业务']]},
 {title:'Tlias教务管理实战',kind:'项目 B · 可选实战',count:'14章 · 56小节',outcome:'结合本机详细资料，从最小工程开发部门、员工、班级学员、认证、日志、前端和部署。',entry:'完成项目A的CRUD；MyBatis在本项目学习',icon:Layers3,href:'/projects/tlias',units:[['基础承接','SQL基础篇补约束、多表与事务；从最小Boot工程起步'],['完整业务','部门、员工经历、报表、登录、日志、班级和学员'],['联调与交付','Vue页面、测试与索引、Docker；当前为资料实战，尚无自动判题']]},
 {title:'独立作品',course:'portfolio',kind:'作品 C',count:'自主选题',outcome:'从需求到上线，独立完成并讲清一个作品。',entry:'完成项目 B，能独立复现主要业务',icon:Trophy,href:'/projects/independent',units:[['设计','明确业务、数据模型与接口'],['实现','从最小工程完成编码、测试与部署'],['讲解','说明技术取舍，完成新情境下的修改']]},
];

export function LearningPath(){
 const [expanded,setExpanded]=useState<number[]>([]);
 const [entryStage,setEntryStage]=useState<number|null>(null);
 const allExpanded=expanded.length===phases.length;
 return <div className="page path-page">
  <div className="page-title path-title">
   <h1>课外拓展路线</h1>
   <button className="btn path-expand" type="button" aria-expanded={allExpanded} onClick={()=>setExpanded(allExpanded?[]:phases.map((_,i)=>i))}>{allExpanded?'收起全部':'展开全部'}</button>
  </div>
  <div className="journey-entry"><JourneyEntry/></div>
  <ol className="phase-list">
   {phases.map((phase,index)=>{
    const lessonModules=phase.course?modulesForCourse(phase.course):[];
    return <li key={phase.title} className={index===0?'phase phase-current':'phase'}>
     <div className="phase-rail" aria-hidden="true"><span>{index+1}</span></div>
     <section className="phase-surface" data-pointer-surface="hover" aria-labelledby={`phase-${index}`}>
      <div className="phase-header"><div className="phase-heading"><phase.icon size={20} aria-hidden="true"/><h2 id={`phase-${index}`}>{phase.title}</h2><span className="phase-kind">{phase.kind}</span></div><span className="phase-count">{phase.count}</span></div>
      <p className="phase-outcome">{phase.outcome}</p>
      <Accordion type="single" collapsible value={expanded.includes(index)?'curriculum':''} onValueChange={value=>setExpanded(previous=>value?Array.from(new Set([...previous,index])):previous.filter(item=>item!==index))}>
       <AccordionItem value="curriculum">
        <AccordionTrigger>学习内容</AccordionTrigger>
        <AccordionContent>
         <ol className="curriculum">{phase.units.map(([name,description],i)=><li key={name}><span className="unit-order">{String(i+1).padStart(2,'0')}</span><div><h4>{name}</h4><p>{description}</p></div></li>)}</ol>
         {lessonModules.length>0&&<div className="path-journey-lessons"><h3>逐课练习</h3><JourneyDirectory selection={lessonModules} label={phase.title+'逐课练习'}/></div>}
        </AccordionContent>
       </AccordionItem>
      </Accordion>
      <div className="phase-footer">
       {index===0&&<span className="phase-resume"><span className="tiny-dot"/>8章递进 · 可自由查看</span>}
       {index<=2?<Link className="btn button primary" to={phase.href}>查看目录<ArrowRight size={15} aria-hidden="true"/></Link>:<button className="btn button secondary" type="button" aria-haspopup="dialog" onClick={()=>setEntryStage(index)}>查看目录<ArrowRight size={15} aria-hidden="true"/></button>}
      </div>
     </section>
    </li>;
   })}
  </ol>
  <Modal open={entryStage!==null} onOpenChange={open=>{if(!open)setEntryStage(null)}} title="开始前提醒" description={phases[entryStage??1].entry+'。'} className="project-entry-reminder">
   <div className="reminder-actions"><button className="btn button secondary" type="button" onClick={()=>setEntryStage(null)}>取消</button><Link className="btn button primary" to={phases[entryStage??1].href} onClick={()=>setEntryStage(null)}>继续查看</Link></div>
  </Modal>
 </div>;
}

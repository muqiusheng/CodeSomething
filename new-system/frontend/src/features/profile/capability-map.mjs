export const capabilityGroups=[
 {id:'http',title:'HTTP / JSON',description:'让请求得到正确响应',skills:[{title:'启动接口',stages:['run-server']},{title:'响应契约',stages:['fix-response']},{title:'情境迁移',stages:['transfer']}]},
 {id:'sql',title:'SQL与数据',description:'存储、查询与修改数据',skills:[{title:'数据库连接',stages:['db-connect']},{title:'关系建模',stages:['db-model']},{title:'数据查询',stages:['sql-read','sql-page']},{title:'安全写入',stages:['sql-write']},{title:'数据迁移',stages:['sql-transfer']}]},
 {id:'boot',title:'Spring Boot',description:'搭建分层后端服务',skills:[{title:'服务启动',stages:['boot-start']},{title:'请求映射',stages:['boot-http']},{title:'分层设计',stages:['boot-layers']},{title:'数据库访问',stages:['boot-jdbc']}]},
 {id:'business',title:'业务开发',description:'把需求变成可用功能',skills:[{title:'增删改查',stages:['a-read','a-create','a-update-delete']},{title:'输入校验',stages:['a-validation']},{title:'分页接口',stages:['a-pagination']},{title:'独立迁移',stages:['a-transfer']}]},
 {id:'engineering',title:'工程实践',description:'让系统可靠运行',skills:[{title:'身份与权限',stages:['b-login','b-roles']},{title:'协作数据',stages:['b-plans','b-pagination']},{title:'事务一致性',stages:['b-transaction']},{title:'异常与日志',stages:['b-errors-logs']},{title:'集成测试',stages:['b-tests']},{title:'部署交付',stages:['b-deploy']}]},
];
export function summarizeCapability(capability,knowledge){
 const sources=knowledge.filter(k=>capability.stages.includes(k.skill.stageId));
 const states=sources.map(k=>k.state);
 let state='unverified';
 if(states.includes('disputed'))state='disputed';
 else if(states.includes('needs-review'))state='needs-review';
 else if(sources.length===capability.stages.length&&states.every(s=>['verified','assisted'].includes(s)))state=states.includes('assisted')?'assisted':'verified';
 else if(states.some(s=>['verified','assisted'].includes(s))||sources.some(s=>s.evidence.some(e=>e.type==='business'||e.type==='review')))state='in-progress';
 return {state,sources};
}

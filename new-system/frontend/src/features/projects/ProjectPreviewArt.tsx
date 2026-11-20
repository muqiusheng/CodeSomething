const examples:Record<string,{title:string;body:string;outcome:string}>={
 'backend-foundations':{title:'HTTP · 请求与响应',body:'GET /api/tasks/1\n\n{ "completed": false }',outcome:'在同一个Java工程实现任务接口'},
 'sql-foundations':{title:'SQL · 查询任务',body:'SELECT id, title\nFROM tasks\nWHERE completed = 0;',outcome:'从建表到分页，完成任务数据脚本'},
 'boot-foundations':{title:'Boot · 健康接口',body:'GET /api/health\n\nController → Service → JDBC',outcome:'从启动工程到连接MySQL'},
 'task-manager':{title:'REST · 个人任务管理',body:'GET    /api/tasks\nPOST   /api/tasks\nDELETE /api/tasks/1',outcome:'实现CRUD、校验、分页与测试'},
 'collaboration':{title:'REST · 学习计划与协作',body:'POST /api/auth/login\nGET  /api/plans\n\n登录 → 权限 → 业务操作',outcome:'完成鉴权、事务、测试与部署'},
 'tlias':{title:'Tlias · 教务管理',body:'GET  /depts\nGET  /emps?page=1\nPOST /login',outcome:'部门、员工与认证；本地运行自查'},
 'independent':{title:'独立作品 · 自主设计',body:'需求与数据模型\n        ↓\n接口实现 → 测试与讲解',outcome:'围绕自选需求完成并讲清一个作品'},
};
/** Course examples describe the target artifact; they are not live results. */
export function ProjectPreviewArt({kind}:{kind:string}) {
 const example=examples[kind]||examples.independent;
 return <div className="project-cover course-artifact" aria-hidden="true"><div className="artifact-heading"><span>{example.title}</span><span>课程示例</span></div><pre>{example.body}</pre><p>{example.outcome}</p></div>;
}

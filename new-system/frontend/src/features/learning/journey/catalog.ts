import {foundations, type LessonText} from './foundations.ts';
import {projects} from './projects.ts';
import {javaPractice, webPractice, collaborationPractice} from './electives.ts';

type Reference = readonly [label: string, url: string];
export const milestoneLabels = [
 'Milestone 0.1 · 骨架起步',
 'Milestone 0.2 · 网络连通',
 'Milestone 0.3 · REST契约',
 'Milestone 0.4 · 数据持久',
] as const;

type Module = {name: string; count: number; goal: string; references: readonly Reference[]};

export const modules: readonly Module[] = [
 {name:milestoneLabels[0],count:6,goal:'在 IDEA 运行你的 Java 代码，在浏览器看到自己写的一句话。',references:[['菜鸟教程 · Java 方法','https://m.runoob.com/java/java-methods.html'],['HTTP 消息结构','https://www.runoob.com/http/http-messages.html']]},
 {name:milestoneLabels[1],count:8,goal:'让任务和笔记接口返回可核对的成功与错误结果。',references:[['菜鸟教程 · HTTP 请求方法','https://m.runoob.com/http/http-methods.html'],['HTTP 状态码','https://m.runoob.com/http/http-status-codes.html'],['JSON 语法','https://m.runoob.com/json/json-syntax.html']]},
 {name:'MySQL 与 SQL',count:8,goal:'在同一个数据库工程里练习建表、增改删、查询与分页。',references:[['菜鸟教程 · WHERE','https://m.runoob.com/mysql/mysql-where-clause.html'],['插入数据','https://m.runoob.com/mysql/mysql-insert-query.html']]},
 {name:milestoneLabels[2],count:8,goal:'用 Boot 重做熟悉的接口，再加入请求参数和构造器注入。',references:[['菜鸟教程 · Spring Boot','https://m.runoob.com/java/java-springboot-framework.html'],['Maven','https://m.runoob.com/maven/maven-tutorial.html'],['Spring 官方 · REST 服务','https://spring.io/guides/gs/rest-service/']]},
 {name:milestoneLabels[3],count:8,goal:'把已有 SQL 接进接口，亲手完成查、写、读回和重启验证。',references:[['菜鸟教程 · Java 连接 MySQL','https://www.runoob.com/mysql/mysql-java-intro.html'],['Spring 官方 · JdbcTemplate','https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html']]},
 {name:'项目 A · 个人任务管理',count:10,goal:'独立启动并实现真实数据库上的任务增删改查、分页和测试。',references:[['菜鸟教程 · RESTful API','https://m.runoob.com/restfulapi/restful-api-tutorial.html'],['JUnit','https://www.runoob.com/java/java-junit-lib.html']]},
 {name:'项目 B · 学习计划与任务协作',count:10,goal:'用多人场景理解登录、访问边界、事务和真实集成测试。',references:[['菜鸟教程 · MySQL 事务','https://m.runoob.com/mysql/mysql-transaction.html'],['Spring Security 官方 · 密码存储','https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/password-encoder.html']]},
 {name:'工程交付与部署',count:6,goal:'在项目 B 中练习打包、配置、部署、重启与复现。',references:[['菜鸟教程 · Git 基本操作','https://www.runoob.com/git/git-basic-operations.html'],['Docker Compose','https://m.runoob.com/docker/docker-compose.html'],['Docker 官方 · Compose','https://docs.docker.com/compose/gettingstarted/']]},
 {name:'作品 C · 独立作品',count:8,goal:'自己设定需求、交付可运行作品，再完成一次陌生改动。',references:[]},
 {name:'Java 基础补练',count:6,goal:'在卡住的地方练方法、类、集合、读报错和断点。',references:[['菜鸟教程 · 方法','https://m.runoob.com/java/java-methods.html'],['异常处理','https://m.runoob.com/java/java-exceptions.html']]},
 {name:'看懂前后端如何接起来',count:6,goal:'在项目 A 放一个网页，直接调用亲手写出的接口。',references:[['菜鸟教程 · HTML 表单','https://m.runoob.com/html/html-forms.html'],['DOM 事件','https://www.runoob.com/js/js-htmldom-events.html'],['MDN · Fetch','https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch']]},
 {name:'项目 B 综合补练',count:6,goal:'用新的输入、身份和运行配置复验协作行为。',references:[['菜鸟教程 · MySQL 事务','https://m.runoob.com/mysql/mysql-transaction.html'],['Spring 官方 · 测试','https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html']]},
];

export type JourneyLesson = {
 id: string;
 number: number;
 module: number;
 title: string;
 stage: string;
 courseId: string;
 file: string;
 start: string;
 action: string;
 run: string;
 result: string;
 troubleshoot: string;
 elective: boolean;
};

const sqlStages = new Set(['db-connect','db-model','sql-read','sql-write','sql-page','sql-transfer']);
function courseFor(module: number, stage: string) {
 if(module===8)return 'portfolio';
 if(sqlStages.has(stage))return 'sql-foundations';
 if(stage.startsWith('boot-'))return 'boot-foundations';
 if(stage.startsWith('a-'))return 'task-manager';
 if(stage.startsWith('b-'))return 'collaboration';
 return 'http-json-basics';
}

function lessonFrom(row: LessonText, id: string, number: number, module: number): JourneyLesson {
 const [title,stage,file,start,action,run,result,troubleshoot]=row;
 return {id,number,module,title,stage,courseId:courseFor(module,stage),file,start,action,run,result,troubleshoot,elective:module>=9};
}

const main = [...foundations,...projects];
let offset=0;
const mainGroups = modules.slice(0,9).map(({count},module)=>{
 const lessons=main.slice(offset,offset+count).map((row,index)=>{
  const number=offset+index+1;
  return lessonFrom(row,String(number).padStart(2,'0'),number,module);
 });
 offset+=count;
 return lessons;
});
const electiveGroups = [javaPractice,webPractice,collaborationPractice].map((rows,module)=>
 rows.map((row,index)=>lessonFrom(row,`${['java','web','team'][module]}-${index+1}`,index+1,module+9)));

export const groupedLessons = [...mainGroups,...electiveGroups];
export const mainLessons = mainGroups.flat();
export const allLessons = groupedLessons.flat();
export const lessonById = new Map(allLessons.map(lesson=>[lesson.id,lesson]));
export function nextMainLesson(search:URLSearchParams,courseId:string,stage:string){
 const current=lessonById.get(search.get('journey')||'');
 if(current&&!current.elective&&current.courseId===courseId&&current.stage===stage)return mainLessons[current.number];
}
export const journeyRoot = '/learn/journey';
export const lessonHref = (id: string, from?: string) => `${journeyRoot}/${id}${from?`?from=${encodeURIComponent(from)}`:''}`;
export const journeyPositionKey = 'cs-journey-position-v1';

const courseModules: Record<string,readonly number[]> = {
 'http-json-basics':[0,1,9],
 'sql-foundations':[2],
 'boot-foundations':[3,4],
 'task-manager':[5,10],
 collaboration:[6,7,11],
 portfolio:[8],
};

export function modulesForCourse(courseId:string){return Object.hasOwn(courseModules,courseId)?courseModules[courseId]:[];}

export function keepJourney(search: URLSearchParams, changes: Record<string,string>) {
 const next=new URLSearchParams(changes);
 for(const key of ['journey','from']){
  const value=search.get(key);
  if(value)next.set(key,value);
 }
 return next;
}

export function workspaceHref(lesson: JourneyLesson, from?: string) {
 const search = new URLSearchParams({tab:'任务',journey:lesson.id});
 if(from)search.set('from',from);
 switch(lesson.courseId){
  case 'http-json-basics': return `/learn/http-json/1.1/${lesson.stage}?${search}`;
  case 'sql-foundations': return `/learn/sql/1.0/${lesson.stage}?${search}`;
  case 'portfolio': {
   const step=lesson.number<67?'design':lesson.number===72?'explain':'practice';
   search.delete('tab');
   search.set('step',step);
   return `/projects/independent?${search}`;
  }
  default: return `/learn/${lesson.courseId}/1.0/${lesson.stage}?${search}`;
 }
}

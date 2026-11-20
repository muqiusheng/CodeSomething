import type {Chapter} from '../../../api/learning-api';
/** Presentation adapter: immutable 1.1.0 course packages and past evidence retain their identity. */
export function webChapter(chapter:Chapter):Chapter{
 if(chapter.stageId==='workspace')return {...chapter,title:'从零写出第一个任务接口',goal:'从最小启动文件开始，在同一工程中逐步实现任务接口',concepts:[
  {title:'在IDE开发，在网站查看与检查',body:'先按网站指引在IDEA创建Java工程；在本地编写保存后，网站读取允许文件并展示真实编译与接口检查反馈。',items:['本地IDE：创建、编写与保存源码','网站：读取查看源码并保存提交快照','检查运行：优先使用本机JDK，环境不可用时回退本机Docker；网页编辑写回同一工程']},
  {title:'整个项目共用一份工程',body:'每章继续自己的本地目录，承接已经写好的源码并添加功能。返回旧章节不会重置工程；网站记住项目目录，重新读取后查看最新文件。',example:'同一项目目录\n└── TaskServer.java'},
  {title:'保存、读取与运行是三个动作',body:'在IDE保存后，网页自动同步；提交验证时会重新读取磁盘并创建检查快照。报告只对应提交时的源码；修改后需重新读取和检查。',items:['IDE编写 → 保存所有文件','网页连接工程 → 提交验证 → 查看真实结果','功能通过 → 完成本关编码 → 可选概念巩固']},
 ]};
 if(chapter.stageId==='run-server')return {...chapter,title:'运行并验证第一个接口',taskSummary:'先在IDE保存自己逐步写好的TaskServer.java，回到网站读取并保存源码快照，运行检查，再追踪响应是怎样产生的。',concepts:[
  {...chapter.concepts[0],items:['文件：TaskServer.java','入口：public static void main','运行方式：本地运行；网站读取、保存快照后运行代码检查']},
  {title:'从编译到接口响应',body:'点击提交验证后，系统优先在本机编译Java、启动本次快照程序并发送请求；本机环境不可用时使用备用隔离环境。编译问题显示文件与行号，接口检查显示预期与实际结果。'},
  {title:'观察请求与响应',body:'先看状态码，再看响应头和JSON内容。页面结果来自真实Java程序；修改源码后重新运行，比较变化。',example:'请求：GET /api/tasks/1\n观察：状态码、Content-Type、JSON响应'},
 ]};
 if(chapter.mode==='code')return {...chapter,taskSummary:chapter.stageId==='fix-response'?'在IDE修复JSON类型和找不到任务时的状态码，保存后在网站重新读取并检查。':chapter.stageId==='transfer'?'在当前工程中扩展笔记资源，复用请求、分支和JSON处理的方法；保留前面实现的任务接口。':chapter.taskSummary};
 return chapter;
}

/** Filenames observed in the user's open Netdisk course directory on 2026-11-16.
 * Bilibili part links follow the same numbered 2025 course (41/80/29 cross-checked
 * in official indexed pages); constructed part links are not claimed as played. */
export const courseMaterial={share:'https://pan.baidu.com/s/1LxIxcHDO7SYB96SE-GZfuQ',code:'dor4',video:'https://www.bilibili.com/video/BV1yGydYEE3H',directory:'2026最新版-Java学习路线图/第2阶段—Java Web(含数据库+H5+js+vue)/2025最新版JavaWeb+AI/视频'};
const titles:Record<number,string>={
21:'JS-核心语法-自定义对象&JSON',31:'Maven-课程介绍',32:'Maven-概述-介绍&安装',35:'单元测试-概述&入门',36:'单元测试-断言&常见注解',37:'单元测试-企业开发规范&AI生成生成单元测试',40:'Web基础-课程安排',41:'Web基础-SpringBootWeb入门-入门程序',42:'Web基础-SpringBootWeb入门-入门解析',43:'Web基础-HTTP协议-概述',44:'Web基础-HTTP协议-请求协议',45:'Web基础-HTTP协议-响应协议',46:'Web基础-SpringBootWeb案例',47:'Web基础-分层解耦-三层架构',48:'Web基础-分层解耦-IOC与DI入门',49:'Web基础-分层解耦-IOC&DI详解',50:'MySQL-课程介绍',51:'MySQL-概述-安装&数据模型',52:'MySQL-SQL-DDL-数据库操作&图形化工具',53:'MySQL-SQL-DDL-表操作-创建表',54:'MySQL-SQL-DDL-表操作-数据类型',55:'MySQL-SQL-DDL-表操作-设计表案例',57:'MySQL-SQL-DML-insert&update&delete',58:'MySQL-SQL-DQL-基本查询',59:'MySQL-SQL-DQL-条件查询',61:'MySQL-SQL-DQL-排序查询&分页查询',62:'JDBC-入门程序',63:'JDBC-执行DQL语句',64:'JDBC-预编译SQL',75:'准备工作-开发规范-Restful',76:'准备工作-工程搭建',77:'部门管理-列表查询-接口开发',78:'部门管理-列表查询-结果封装',79:'部门管理-列表查询-前后端联调测试',80:'部门管理-删除部门-接口开发',81:'部门管理-新增部门-接口开发',82:'部门管理-修改部门-查询回显',83:'部门管理-修改部门-修改数据',84:'日志技术-Logback入门程序',85:'日志技术-Logback配置文件&日志级别',86:'多表关系-一对多',87:'多表关系-一对一&多对多',88:'多表关系-多表设计案例',94:'员工管理-分页查询-原理分析',95:'员工管理-分页查询-代码实现',97:'员工管理-条件分页查询-基本实现',98:'员工管理-条件分页查询-程序优化',99:'员工管理-新增员工-保存员工基本信息',100:'员工管理-新增员工-批量保存员工工作经历',101:'事务管理-介绍与操作',102:'事务管理-Spring事务管理-介绍',103:'事务管理-Spring事务管理-进阶&事务四大特性',115:'全局异常处理器',120:'登录认证-登录功能-实现',125:'登录认证-登录校验-JWT-生成与校验',126:'登录认证-登录校验-JWT-登录成功后下发令牌',128:'登录认证-登录校验-Filter-令牌校验Filter',130:'登录认证-登录校验-Interceptor-入门',139:'SpringAOP-案例-记录操作日志',181:'Tlias案例-打包部署',190:'Linux-项目部署',198:'Docker-部署-服务端&前端部署',199:'Docker-部署-DockerCompose',
};
const parts:Record<string,number[]>={
workspace:[43,41,45],request:[44,43],response:[45],json:[21,45],'run-server':[41,42],trace:[42,46],'fix-response':[45,21],transfer:[46,75],
'db-connect':[50,51,52],'db-model':[53,54,55],'sql-read':[58,59],'sql-write':[57],'sql-page':[61],'sql-transfer':[55,57,61],
'boot-start':[31,32,41,42],'boot-http':[44,45,46],'boot-layers':[47,48,49],'boot-jdbc':[62,63,64],
'a-read':[76,77,78,79],'a-create':[81,99],'a-update-delete':[80,82,83],'a-validation':[115,46],'a-pagination':[94,95,97,98],'a-transfer':[35,36,75],
'b-login':[120,125,126],'b-roles':[128,130],'b-plans':[86,87,88],'b-pagination':[94,95,97],'b-transaction':[100,101,102,103],'b-errors-logs':[84,85,115,139],'b-tests':[35,36,37],'b-deploy':[181,190,198,199],
read:[76,77,78],validate:[81,115],core:[75,76,86,102],
};
export function referencesFor(course:string,stage:string){const ids=course==='portfolio'&&stage==='transfer'?[100,102,103,36]:course==='generated'&&stage==='transfer'?[75,81,36]:parts[stage]||[];return ids.map(part=>({part,title:titles[part],filename:`${part}. ${titles[part]}.mp4`,url:courseMaterial.video+'?p='+part,path:courseMaterial.directory+`/${part}. ${titles[part]}.mp4`}))}

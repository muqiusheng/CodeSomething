# 运行项目B
Java21、Maven3.9、Docker与隔离MySQL。工程固定pom.xml，构建mvn package；环境变量SPRING_DATASOURCE_URL、SPRING_DATASOURCE_USERNAME、SPRING_DATASOURCE_PASSWORD由deploy-r7.ps1注入。打开http://127.0.0.1:5196。users与plans通过memberships形成多对多关系，任务外键约束分配者属于计划。PlanService.batch的public事务方法把任务与审计一起提交；RuntimeException向外抛出导致整体回滚。用mvn test验证API权限、回滚和注销；安装、端口与数据库连接错误单列环境问题。部署脚本start/stop/status保留独立数据卷。教学账号密码仅用于本机隔离练习。

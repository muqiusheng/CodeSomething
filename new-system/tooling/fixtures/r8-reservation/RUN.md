# 工程验收夹具：摄影设备借用

本目录用于隔离检查器正反例验收，不是学习者课程参考。Java21、Spring Boot、MySQL，连接通过SPRING_DATASOURCE_URL、SPRING_DATASOURCE_USERNAME、SPRING_DATASOURCE_PASSWORD配置。mvn test执行真实API测试；mvn package后java -jar target/boot-lab.jar运行，浏览器打开8080端口。

users与sessions管理身份，resources提供库存，reservations关联用户和资源。事务内条件扣减防止超卖，取消时锁定预约行防止重复恢复；批量由外层事务统一提交或回滚。单节点部署持久化MySQL；真实部署需自行配置密码、备份和网络。测试采用HTTP接口，401/403/404/409区分身份、权限和业务错误。

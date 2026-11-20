# 书签服务
Java21与Maven3.9.14。设置SPRING_DATASOURCE_URL/USERNAME/PASSWORD后运行Application。
mvn test；mvn package；java -jar target/boot-lab.jar。
Controller读取请求并映射Input，Service校验并组织业务，Repository通过JdbcTemplate绑定SQL值，MySQL持久化，返回对象序列化为JSON。

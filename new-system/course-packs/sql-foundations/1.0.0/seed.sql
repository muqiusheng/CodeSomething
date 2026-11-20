CREATE TABLE tasks (id INT PRIMARY KEY, title VARCHAR(100) NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0);
INSERT INTO tasks VALUES (1,'学习HTTP',0),(2,'配置数据库',1),(3,'练习SQL',0),(4,'复习JSON',1),(5,'编写接口',0),(6,'完成分页',0);

CREATE TABLE tasks (id INT PRIMARY KEY, title VARCHAR(100) NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0);
INSERT INTO tasks VALUES (8,'新任务八',0),(3,'已完成三',1),(12,'新任务十二',0),(1,'已完成一',1),(7,'新任务七',0),(4,'新任务四',0);

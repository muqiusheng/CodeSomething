-- Synthetic practice records. This seed is used only by the coursework sandbox.
CREATE TABLE student (
  Sno CHAR(8) PRIMARY KEY,
  Sname VARCHAR(20) NOT NULL,
  Sex CHAR(2) NOT NULL DEFAULT '男',
  Birth DATE NOT NULL,
  Classno CHAR(3) NOT NULL,
  Entrance_date DATE NOT NULL,
  Home_addr VARCHAR(40),
  Sdept VARCHAR(20) NOT NULL,
  Postcode CHAR(6),
  CONSTRAINT chk_student_dates CHECK (Entrance_date > Birth),
  CONSTRAINT chk_student_postcode CHECK (Postcode IS NULL OR Postcode REGEXP '^[0-9]{6}$')
);
CREATE TABLE course (
  Cno CHAR(3) PRIMARY KEY,
  Cname VARCHAR(30) NOT NULL,
  Total_perior SMALLINT CHECK (Total_perior > 0),
  Credit TINYINT CHECK (Credit BETWEEN 1 AND 6)
);
CREATE TABLE sc (
  Sno CHAR(8) NOT NULL,
  Cno CHAR(3) NOT NULL,
  Grade TINYINT CHECK (Grade BETWEEN 0 AND 100),
  PRIMARY KEY (Sno, Cno),
  CONSTRAINT fk_sc_student FOREIGN KEY (Sno) REFERENCES student(Sno),
  CONSTRAINT fk_sc_course FOREIGN KEY (Cno) REFERENCES course(Cno)
);
INSERT INTO student VALUES
('20110001','张虹','男','1992-09-01','051','2011-09-01','南京','计算机系','200413'),
('20110002','林红','女','1991-11-12','051','2011-09-01','北京','计算机系','100010'),
('20110103','赵青','男','1993-05-11','061','2011-09-01','上海','软件工程','200013'),
('20110004','陈岚','女','1992-03-02','051','2011-09-01','苏州','计算机系',NULL),
('20110005','许宁','男','1991-01-01','061','2011-09-01','杭州','软件工程','310000'),
('20110006','周琪','女','1993-08-17','051','2011-09-01','无锡','计算机系','214000'),
('20110007','张晨','女','1992-05-09','061','2011-09-01','宁波','软件工程','315000'),
('20110008','王泽','男','1990-10-01','062','2011-09-01','合肥','软件工程','230000');
INSERT INTO course VALUES
('001','高数',96,6),('002','C语言程序设计',80,5),('003','JAVA语言程序设计',48,3),
('004','Visual_Basic',48,4),('005','数据结构',64,4),('006','数据库原理',64,4),('007','操作系统',48,3);
INSERT INTO sc VALUES
('20110001','001',89),('20110001','002',78),('20110001','003',89),('20110001','005',82),('20110001','006',90),
('20110002','002',60),('20110002','003',80),('20110002','006',88),('20110002','007',90),
('20110103','001',80),('20110103','003',79),('20110103','005',59),('20110103','007',79),
('20110004','002',91),('20110004','003',75),('20110004','005',70),
('20110005','001',89),('20110005','002',NULL),('20110005','003',92),('20110005','007',81),
('20110006','001',77),('20110006','002',85),('20110006','006',87),
('20110007','001',65),('20110007','005',88),('20110007','007',58);

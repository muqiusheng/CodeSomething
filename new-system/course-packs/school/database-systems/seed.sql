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

-- Extra student-course cases for full-set and query-boundary exercises.
INSERT INTO student VALUES
('20110998','陈虹','女','1993-10-11','061','2011-09-01','上海','软件工程','200120');
INSERT INTO sc VALUES
('20110998','001',70),('20110998','002',63),('20110998','003',68),
('20110998','004',71),('20110998','005',66),('20110998','006',79),('20110998','007',75);

-- SampleDB (chapter 3). Independent, synthetic repair-project fixtures.
CREATE TABLE Salvaging (
  prj_num CHAR(8) PRIMARY KEY,
  prj_name VARCHAR(50) NOT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  prj_status BIT NOT NULL DEFAULT b'0',
  CONSTRAINT chk_salvaging_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE Stock (
  mat_num CHAR(4) PRIMARY KEY,
  mat_name VARCHAR(50) NOT NULL,
  speci VARCHAR(20) NOT NULL,
  warehouse VARCHAR(20),
  amount INT CHECK (amount > 0),
  unit DECIMAL(18,2) CHECK (unit >= 0),
  total DECIMAL(18,2) GENERATED ALWAYS AS (amount * unit) STORED,
  CONSTRAINT chk_stock_number CHECK (mat_num REGEXP '^m[0-9]{3}$')
);
CREATE TABLE Out_stock (
  prj_num CHAR(8),
  mat_num CHAR(4),
  amount INT NOT NULL CHECK (amount >= 0),
  get_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  department VARCHAR(20) NOT NULL,
  PRIMARY KEY (prj_num, mat_num),
  FOREIGN KEY (prj_num) REFERENCES Salvaging(prj_num),
  FOREIGN KEY (mat_num) REFERENCES Stock(mat_num)
);
CREATE TABLE Prj_cost (
  prj_num CHAR(8) PRIMARY KEY,
  cost DECIMAL(18,2) NOT NULL
);
INSERT INTO Salvaging VALUES
('20110001','南桥站配电抢修','2011-03-01','2011-03-04',b'1'),
('20110002','海湾站电缆抢修','2011-03-02','2011-03-08',b'0'),
('20110003','观澜站光缆抢修','2011-03-02','2011-03-07',b'0'),
('20110004','浦东站开关检修','2011-03-06','2011-03-09',b'1'),
('20110005','滨江线路巡检','2011-03-08',NULL,b'0');
INSERT INTO Stock (mat_num,mat_name,speci,warehouse,amount,unit) VALUES
('m001','电力电缆','YJV-35','供电局 1# 仓库',80,45.50),
('m002','绝缘护套','BVV-35','供电局 1# 仓库',40,27.00),
('m003','光缆','GYTA-24','供电局 2# 仓库',90,55.00),
('m004','电缆接头','YJV-35','供电局 2# 仓库',20,80.00),
('m005','接线端子','DT-16','供电局 1# 仓库',50,50.00),
('m006','断路器','DZ-32','供电局 3# 仓库',30,115.00),
('m007','接地线','JDX-25',NULL,12,31.00);
INSERT INTO Out_stock VALUES
('20110001','m001',4,'2011-03-01','工程 1 部'),
('20110001','m002',3,'2011-03-02','工程 1 部'),
('20110002','m001',5,'2011-03-02','工程 1 部'),
('20110002','m004',2,'2011-03-03','工程 2 部'),
('20110003','m001',2,'2011-03-03','工程 1 部'),
('20110003','m003',6,'2011-03-04','工程 2 部'),
('20110004','m001',1,'2011-03-06','工程 3 部'),
('20110004','m006',4,'2011-03-06','工程 3 部');

-- A previously settled cost. The cost-aggregation question clears its own copy.
INSERT INTO Prj_cost VALUES ('20110004',505.50);

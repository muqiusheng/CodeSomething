const entities = [
  /\bstudents?\b|学生/i,
  /\bcourses?\b|课程/i,
  /\bsc\b|选课|成绩/i,
];

export function isConnectionTask(question) {
  return /确认.*(?:连接|数据库)|字符集|创建数据库/.test(question.title);
}

export function matchSourceTables(tables, question) {
  if (isConnectionTask(question)) return [];

  const text = [question.title, question.requirement, question.originalText].join(' ');
  const structureTask = /建表|表结构|约束|新增列|删除列|默认值|索引|外键/.test(question.title + ' ' + question.requirement)
    || /建表|表结构|约束/.test(question.originalText ?? '');
  const dataTask = /查询|检索|插入|录入|修改数据|删除记录|删除选课|更新|均分|平均分/.test(question.title);
  return tables.filter(table => {
    const entity = entities.find(keyword => keyword.test(table.title.split('·').at(-1)));
    const referenceFormat = /参考格式/.test(table.title);
    if (referenceFormat) return /各系.*平均分|按系汇总平均成绩/.test(text);
    if (!entity?.test(text)) return false;
    const structure = /表结构|约束/.test(table.title);
    return structure === (structureTask && !dataTask);
  });
}

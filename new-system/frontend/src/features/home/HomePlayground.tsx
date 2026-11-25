import {useState} from 'react';

const modes = [
  {id:'all',label:'全部记录',line:'SELECT Sno, Cno, Grade',from:'FROM sc;'},
  {id:'where',label:'WHERE 筛选',line:'SELECT Sno, Cno, Grade',from:'FROM sc',clause:'WHERE Grade >= 80;'},
  {id:'group',label:'GROUP BY 分组',line:'SELECT Cno, COUNT(*) AS enrolled',from:'FROM sc',clause:'GROUP BY Cno;'},
  {id:'order',label:'ORDER BY 排序',line:'SELECT Sno, Cno, Grade',from:'FROM sc',clause:'ORDER BY Grade DESC;'},
] as const;
const records = [
  {student:'240101',course:'001',grade:78},
  {student:'240102',course:'002',grade:91},
  {student:'240103',course:'001',grade:86},
  {student:'240104',course:'002',grade:73},
];

export function HomePlayground() {
  const [id,setId] = useState<(typeof modes)[number]['id']>('all');
  const mode = modes.find(candidate=>candidate.id===id)!;
  const grouped = id==='group';
  const selected = id==='where' ? records.filter(row=>row.grade>=80)
    : id==='order' ? [...records].sort((a,b)=>b.grade-a.grade) : records;
  const counts = new Map<string,number>();
  if (grouped) records.forEach(row=>counts.set(row.course,(counts.get(row.course) ?? 0)+1));

  return <div className="home-sandbox">
    <div className="sandbox-states" role="group" aria-label="SQL 查询方式">
      {modes.map(option=><button key={option.id} className="btn button secondary" type="button"
        aria-pressed={id===option.id} onClick={()=>setId(option.id)}>{option.label}</button>)}
    </div>
    <div className="home-example-flow">
      <div className="home-code-card sandbox-sql">
        <pre aria-label="示例 SQL"><code><span data-active={id==='all'}>{mode.line}</span>{'\n'}{mode.from}
          {'clause' in mode && <>{'\n'}<span data-active="true">{mode.clause}</span></>}</code></pre>
      </div>
      <div className="sandbox-sql-results">
        <div className="section-heading"><strong>查询结果</strong><span role="status">示例数据 · {grouped ? counts.size : selected.length} 行</span></div>
        <table className="table table-xs" aria-label="选课表查询结果">
          <thead><tr>{(grouped ? ['课程号','选课人数'] : ['学号','课程号','成绩']).map(column=><th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{grouped ? [...counts].map(([course,count])=><tr key={course}><td>{course}</td><td>{count}</td></tr>)
            : selected.map(row=><tr key={row.student}><td>{row.student}</td><td>{row.course}</td><td>{row.grade}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  </div>;
}

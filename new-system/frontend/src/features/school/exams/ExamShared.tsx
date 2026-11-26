import {ArrowLeft, BookOpen, ChevronRight, Download, Printer} from 'lucide-react';
import {Fragment, useContext, useState, type ComponentProps, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Modal} from '../../../components/ui/modal';
import {PageSkeleton} from '../../../components/shared/LoadingState';
import {ExpandedResults} from '../WorkbenchControls';
import {WorkbenchResultGrid} from '../WorkbenchResultGrid';
import {QuestionSolution,SqlPreview} from '../QuestionSolution';
import {resultMarkdown} from '../result-grid.mjs';
import {kindNames,kinds,stateNames,type Item,type Kind,type Summary} from './exam-api';
import {isDuplicateSqlErrorCheck,primaryQueryPreview,sqlItemDiagnostic} from './exam-state.mjs';
import '../../../styles/school-exam.css';

export function shortPaperTitle(title:string) {
  const separator = title.indexOf('·');
  return separator < 0 ? title : title.slice(separator+1).trim();
}

const sqlTerms = /(\x60[^\x60\n]+\x60|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*(?:[ \t]*\((?:[^()\n]|\([^()\n]*\))*\))?(?:[ \t]+[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*(?:[ \t]*\((?:[^()\n]|\([^()\n]*\))*\))?)*|>=|<=|<>|!=)/g;

export function questionHeading(text:string) {
  return text.split('\n\n### 涉及数据表：', 1)[0];
}

export function TableDisclosure({name,meaning,columnCount,note,children}: {
  name:string; meaning?:string; columnCount:number; note?:string; children:ReactNode;
}) {
  return <details className="school-table-disclosure">
    <summary className="school-reference-row"><ChevronRight size={14} aria-hidden="true"/>
      <span><code>{name}</code>（{meaning ? meaning + ' · ' : ''}{columnCount} 列）{note}</span>
    </summary>
    <div>{children}</div>
  </details>;
}

export function QuestionTables({text}:{text:string}) {
  const sections = text.split('\n\n### 涉及数据表：').slice(1);
  return sections.length > 0 && <div className="exam-question-tables">
    {sections.map(section=>{
      const [title, ...lines] = section.trim().split('\n');
      const blocks = lines.join('\n').trim().split(/\n\s*\n/).filter(Boolean);
      const [name, meaning, note] = /^([^（]+)（([^）]+)）(.*)$/.exec(title)?.slice(1) ?? [title];
      const columnCount = Math.max(0, (blocks[0]?.match(/^\|/gm)?.length ?? 0)-2);
      const rendered = blocks.map(block=>{
        const rows = block.split('\n').filter(line=>line.startsWith('|')).map(line=>
          line.slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim().replaceAll('\\|','|')));
        const caption = block.split('\n').find(line=>line.startsWith('**'))?.replace(/^\*\*|\*\*$/g,'');
        if (!rows.length) return <p key={block}>{caption ?? block}</p>;
        const [headers,,...data] = rows;
        return <div key={block} className="exam-question-table-scroll" tabIndex={0} role="region" aria-label={caption ?? title}>
          <table className="table table-sm" data-table-kind={caption ? 'sample' : 'schema'}>
            {caption && <caption>{caption}</caption>}
            <thead><tr>{headers.map((header,i)=><th key={i} scope="col">{header}</th>)}</tr></thead>
            <tbody>{(caption ? data.slice(0,2) : data).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>
              {cell.startsWith('`') && cell.endsWith('`') ? <code>{cell.slice(1,-1)}</code> : cell}
            </td>)}</tr>)}</tbody>
          </table>
        </div>;
      });
      return <TableDisclosure key={title} name={name} meaning={meaning} columnCount={columnCount} note={note}>
        {rendered}
      </TableDisclosure>;
    })}
  </div>;
}

export function QuestionText({text}:{text:string}) {
  return text.split(sqlTerms).map((chunk,index)=>index%2
    ? <code key={index}>{chunk.replace(/^\x60|\x60$/g,'')}</code> : chunk);
}

// Fields from the two schemas used by the database-systems papers.
const examFields = {
  student: 'Sno Sname Sex Birth Classno Entrance_date Home_addr Sdept Postcode',
  course: 'Cno Cname Total_perior Credit',
  sc: 'Sno Cno Grade',
  Salvaging: 'prj_num prj_name start_date end_date prj_status',
  Stock: 'mat_num mat_name speci warehouse amount unit total',
  Out_stock: 'prj_num mat_num amount get_date department',
  Prj_cost: 'prj_num cost',
};

export function BlankTableFields({text}:{text:string}) {
  const words = new Set((text.toLowerCase().match(/[a-z_][a-z0-9_$]*/g) ?? []));
  const tables = Object.entries(examFields).filter(([name])=>words.has(name.toLowerCase()));
  if (!tables.length) return null;
  return <section className="exam-field-reference" aria-label="数据表字段速览">
    <h3>字段速览</h3>
    <dl>{tables.map(([name, fields])=><div key={name}><dt><code>{name}</code></dt>
      <dd>{fields.split(' ').map(field=><code key={field}>{field}</code>)}</dd></div>)}</dl>
  </section>;
}

const summaryKindNames: Record<Kind,string> = {choice:'选择',boolean:'判断',blank:'填空',sql:'编程'};

export function ExamHeader({title,back,backLabel='返回备考大厅',summary,questionCounts,children}: {
  title:string; back:string;backLabel?:string;summary?:string;questionCounts?:Partial<Record<Kind,number>>;children?:ReactNode;
}) {
  return <header className="exam-header">
    <Link className="exam-back" to={back}><ArrowLeft size={16} aria-hidden="true"/>{backLabel}</Link>
    <div className="exam-header-row"><div><h1>{title}</h1>{summary && <p>{summary}
      {kinds.filter(kind=>questionCounts?.[kind]).map(kind=><Fragment key={kind}>
        {' '}<span className="whitespace-nowrap">· {summaryKindNames[kind]} {questionCounts?.[kind]}</span>
      </Fragment>)}</p>}</div>
      {children && <div className="exam-actions">{children}</div>}</div>
  </header>;
}

export function ExamReadState({error,reload,label}: {error?:string|null;reload?:()=>void;label:string}) {
  return error ? <div className="note" role="alert"><p>{error}</p>
    {reload && <button type="button" className="button secondary" onClick={reload}>重试</button>}</div>
    : <PageSkeleton variant="cards" label={label}/>;
}

export function DiscardDraftButton({onDiscard,disabled=false}:{onDiscard:()=>Promise<void>;disabled?:boolean}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  return <>
    <button type="button" className="button secondary" disabled={disabled} onClick={()=>{setError('');setOpen(true);}}>放弃当前草稿并重新开始</button>
    {open && <Modal open={open} onOpenChange={next=>{if(!busy)setOpen(next);}} title="放弃当前草稿？"
      description="此草稿中的作答和标记将被清除。已经交卷的成绩仍可查阅。">
      <div className="exam-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>保留草稿</button>
        <button type="button" className="button danger" disabled={busy} onClick={async()=>{
          setBusy(true);setError('');
          try {await onDiscard();setOpen(false);}
          catch (error) {setError(error instanceof Error?error.message:'暂时无法放弃草稿。');}
          finally {setBusy(false);}
        }}>{busy?'正在放弃…':'确认放弃'}</button>
      </div>
      {error && <p role="alert" className="note">{error}</p>}
    </Modal>}
  </>;
}

export function SyntaxGuide() {
  const [open,setOpen] = useState(false);
  return <><button type="button" className="button secondary exam-screen" onClick={()=>setOpen(true)}>
    <BookOpen size={16} aria-hidden="true"/>语法速查</button>
    {open && <Modal open={open} title="MySQL 考前语法速查" description="选课数据字段和常用语句模板" onOpenChange={setOpen}>
      <div className="exam-guide">
        <h3>课程三表</h3>
        <dl><dt>student</dt><dd>Sno、Sname、Sex、Birth、Classno、Entrance_date、Home_addr、Sdept、Postcode</dd>
          <dt>course</dt><dd>Cno、Cname、Total_perior、Credit</dd><dt>sc</dt><dd>Sno、Cno、Grade</dd></dl>
        <h3>查询、变更与对象</h3>
        <pre>{'SELECT Cno, COUNT(Grade)\nFROM sc WHERE Grade IS NOT NULL\nGROUP BY Cno HAVING COUNT(Grade) >= 2\nORDER BY Cno;\n\nSELECT s.Sno, x.Grade FROM student s\nLEFT JOIN sc x ON x.Sno = s.Sno AND x.Cno = ?;\n\nALTER TABLE t ADD COLUMN note VARCHAR(40);\nSTART TRANSACTION;\nUPDATE t SET note = ? WHERE id = ?;\nROLLBACK;\n\nCREATE VIEW v AS SELECT Cno, Credit FROM course\nWHERE Credit >= 4 WITH CHECK OPTION;\n\nDELIMITER $$\nCREATE PROCEDURE p(IN p_cno CHAR(3), OUT p_count INT)\nBEGIN\n  SELECT COUNT(*) INTO p_count FROM sc WHERE Cno = p_cno;\nEND$$\nDELIMITER ;\nCALL p(?, @n);\nSELECT @n;'}</pre>
        <p>用 IS NULL 判断空值。触发器用 OLD 与 NEW 读取行镜像，<code>&lt;=&gt;</code> 可做 NULL 安全比较。</p>
      </div>
    </Modal>}
  </>;
}

export function HistoryList({history,base}: {history:Summary[];base:string}) {
  if (!history.length) return <p className="exam-muted">还没有交卷记录。</p>;
  const full = history.filter(record=>record.maxScore===100);
  const comparable = full.length ? full : history.filter(record=>record.maxScore===history[0].maxScore);
  return <><p className="exam-muted">首次 {comparable.at(-1)?.score} · 最高 {Math.max(...comparable.map(x=>x.score))} · 最近 {comparable[0].score} · 共 {history.length} 次</p>
    <ol className="exam-history">
      {history.map(record=><li key={record.id}>
        <Link to={base+'/'+record.paperId+'/attempts/'+record.id}>{new Date(record.submittedAt).toLocaleString('zh-CN')}</Link>
        <strong>{record.score}/{record.maxScore}</strong>
        <span>{record.mode==='exam'?'考场':'练习'} · {record.level}</span>
      </li>)}
    </ol>
  </>;
}

const genericCheckLabels = new Set([
  '核对数据或对象状态','核对变式数据或对象状态','核对对象与数据状态',
  '变式数据与边界验证','核对结果集','基础结果与对象状态','变式数据','查询结果','变式查询结果',
  '基础数据与对象状态','种子数据结果','变更数据后仍符合题意','变式数据校验','基础查询结果',
]);

const preciseCheckLabels: Record<string,string> = {
  '成绩范围、可空与外键': '字段约束检查（成绩范围、是否允许为空、外键）',
  '列、类型与复合主键': '字段名称、类型与复合主键符合要求',
  '新增字段类型和可空属性': '新增字段的类型和是否允许为空符合要求',
  '拒绝不存在的选课组合': '外键拒绝不存在的学生或课程',
  '合法边界可写、超限不可写': '允许写入边界值，拒绝超出范围的值',
  '视图数据和投影': '视图返回要求的行和列',
  '新课程及缺考后按基表更新': '新增课程或缺考记录后，视图随原表更新',
  '同一会话获取两个 OUT': '在同一会话中读出两个输出参数',
  '空课程返回两个零': '课程无人选修时，两个输出参数均为零',
  '及格与不及格边界': '及格分数附近的成绩分类正确',
  'NULL 分支': '缺考成绩（NULL）得到正确处理',
  '触发器时机和目标表': '触发器绑定正确的表和操作，在指定时机执行',
  '只记录变化，包括 NULL 转数值': '只记录有变化的成绩，也记录从缺考改为有分数',
  '审计记录随事务回滚': '撤销成绩修改时一并撤销对应的审计记录',
  '更新父键同步到子表': '更新主表编号后，相关记录的外键同步更新',
  '只修改指定课号': '只修改指定课程的记录',
  '计划记录正确': '写入的计划记录符合要求',
  '允许改姓名，禁止改出院系': '允许修改姓名，拒绝把学生改到视图范围以外的院系',
  '聚合视图结果': '视图中的分组统计结果正确',
  '保留合法边界并拦截低分': '允许达到最低分数的成绩，拒绝低于下限的成绩',
  '筛选条件和列顺序': '返回符合筛选条件的记录，列顺序正确',
  '允许合法更新，拒绝越界写入': '允许符合范围的更新，拒绝超出范围的值',
  '删除课程清除对应选课，学生仍存在': '删除课程时一并删除对应选课记录，保留学生信息',
  '过程返回正确的审计计数': '过程返回正确的审计日志条数',
  '更新指定记录并接受 NULL 和重复值': '更新指定记录，允许空值和重复值',
  '缺少选课时拒绝且保留成绩': '没有选课记录时拒绝操作，保留原有成绩',
  '不存在的学号被触发器拒绝': '触发器拒绝不存在的学号',
  '不存在的课号被触发器拒绝': '触发器拒绝不存在的课程号',
  '变式中仍触发相同约束': '更换数据后仍会报出同类错误',
};

function checkCopy(item:Item, check:Item['checks'][number]) {
  const prompt = questionHeading(item.question.prompt);
  const changedInput = /变式|变更数据/.test(check.label);
  let label = preciseCheckLabels[check.label] ?? check.label;
  let detail = '检查实际结果是否满足「'+label+'」这一项要求。';

  if (check.kind==='execution' || /执行成功|完整执行|完整执行 SQL/.test(check.label)) {
    label = 'SQL 语句可以正常执行';
    detail = '运行提交的 SQL，检查每条语句能否执行完成。';
  } else if (check.kind==='expected_error' || /运行原实验语句|预期错误/.test(check.label)) {
    label = changedInput ? '更换数据后仍会报出同类错误' : '执行时出现题目要求的错误';
    detail = '执行指定操作，并核对 MySQL 报出的错误类型是否符合题意。';
  } else if (check.kind==='negative_check' && !preciseCheckLabels[check.label]
      && (genericCheckLabels.has(check.label) || /约束边界/.test(check.label))) {
    label = changedInput ? '更换数据后仍能拒绝不合规的值' : '字段约束能区分合法和不合法的数据';
    detail = '用符合条件的值和违反约束的值测试，核对数据库是否接受或拒绝这些操作。';
  } else if (genericCheckLabels.has(check.label)) {
    if (check.kind==='result_set' || /结果集|查询结果/.test(check.label)) {
      label = changedInput ? '换一组数据，查询结果仍然正确' : '查询结果与预期一致';
      detail = '比较 SQL 返回的行和列。题目指定列名或排序时，也会核对相应要求。';
    } else if (/触发器/.test(prompt)) {
      label = changedInput ? '换一组数据，触发器仍按要求执行' : '触发器的设置与执行结果符合要求';
      detail = '执行题目指定的操作，检查触发器及它对数据产生的结果。';
    } else if (/过程|函数|游标|PROCEDURE|CALL\s/i.test(prompt)) {
      label = changedInput ? '更换输入后，过程或函数仍按要求工作' : '过程或函数的操作结果符合要求';
      detail = '按题意核对过程或函数的创建、删除、参数、返回值或数据结果。';
    } else if (/视图/.test(prompt)) {
      label = changedInput ? '换一组数据，视图仍按要求工作' : '视图定义或查询结果符合要求';
      detail = '核对题目要求的视图设置，或比较视图返回的数据。';
    } else if (/建表|创建[^。；\n]{0,36}表|主键|外键|约束|新增字段|修改字段|列类型|表结构|ALTER\s+TABLE/i.test(prompt)
        && check.kind!=='post_query') {
      label = changedInput ? '换一组数据，表结构仍符合要求' : '表结构符合题目要求';
      detail = '查看表的字段、类型、键和约束，核对题目指定的结构。';
    } else if (check.kind==='post_query' || /插入|删除|更新|写入|新增|修改/.test(prompt)) {
      label = changedInput ? '换一组数据，变更结果仍然正确' : '数据变更结果正确';
      detail = '运行 SQL 后查看受影响的记录，核对哪些数据应当变化，以及变更后的值。';
    } else if (/数据库/.test(prompt)) {
      label = '数据库的名称和设置符合要求';
      detail = '核对操作后数据库的名称、字符集或题目指定的设置。';
    } else {
      label = '操作后的结果符合题目要求';
      detail = '查看执行后的结果，并与题目要求逐项比较。';
    }
    if (changedInput) detail += ' 本项使用另一组样例数据。';
  } else if (check.label==='成绩范围、可空与外键') {
    detail = '检查成绩能否留空，超出规定范围时是否被拒绝，并核对学号与课程号是否引用已有记录。';
  }

  const message = check.diff && check.message==='查询结果或对象状态与要求不符。'
    ? '本次输出与预期有差异，可对照下面的结果。' : check.message;
  return {label,detail,message};
}

function checkSummary(check: Item['checks'][number], message: string) {
  const {diff} = check;
  if (!diff) return check.advice || message;
  const differences = [
    diff.missing.length ? `缺失 ${diff.missing.length} 行` : '',
    diff.extra.length ? `多余 ${diff.extra.length} 行` : '',
    diff.columnsDiffer ? '列名或列数不同' : '',
    diff.orderDiffers ? '行顺序不同' : '',
  ].filter(Boolean);
  return differences.join('，') || check.advice || message;
}

export function ItemFeedback({item, compact = false, solution}: {
  item:Item; compact?:boolean; solution?:Omit<ComponentProps<typeof QuestionSolution>,'placement'>;
}) {
  const expanded = useContext(ExpandedResults);
  const condensed = compact && !expanded;
  const option = item.question.options.findIndex(value=>value.id===item.correct[0]);
  const correct = item.question.kind==='choice' && option>=0
    ? String.fromCharCode(65+option)+' · '+item.question.options[option].text
    : item.correct.map(value=>value==='true'?'对':value==='false'?'错':value).join('、');
  const diagnostic = sqlItemDiagnostic(item);
  const preview = primaryQueryPreview(item);
  const failed = item.checks.find(check=>check.status!=='passed');
  const previewTables = condensed ? preview?.actual.slice(0,2) : preview?.actual;
  return <div className="exam-feedback">
    <p role="status"><strong className={item.score===item.question.points?'badge badge-success exam-score-pass':undefined}>{stateNames[item.status] ?? item.status} · {item.score}/{item.question.points} 分</strong></p>
    {diagnostic && <div className="exam-sql-diagnostic" data-compact={condensed} role="alert">
      <p><strong>{diagnostic.line>0?'第 '+diagnostic.line+' 行':'SQL 执行出错'}</strong>
        {diagnostic.advice && <> · {diagnostic.advice}</>}</p>
      {diagnostic.raw && diagnostic.raw!==diagnostic.advice && (condensed
        ? <details><summary>MySQL 原始报错</summary><pre>{diagnostic.raw}</pre></details>
        : <pre>{diagnostic.raw}</pre>)}
    </div>}
    {preview && <div className="exam-result-preview">
      <div className="exam-result-preview-head">
        <strong>本次查询结果（{checkCopy(item,preview).label}）</strong>
        <span className="exam-muted">共 {preview.actual.reduce((sum,table)=>sum+table.rows.length,0)} 行</span>
      </div>
      {previewTables?.map((table,i)=>table.columns.length
        ? <WorkbenchResultGrid key={i} table={condensed ? {...table,rows:table.rows.slice(0,8)} : table} index={i}/>
        : <p key={i}>查询返回 0 行。</p>)}
      {condensed && (preview.actual.length > 2 || preview.actual.some(table=>table.rows.length>8)) &&
        <p className="exam-muted">预览最多 2 个结果集，每组最多 8 行。放大查看完整结果。</p>}
    </div>}
    {!diagnostic && failed && <p>{checkSummary(failed,checkCopy(item,failed).message)} <span className="exam-muted">（展开检查点查看明细）</span></p>}
    {item.checks.map((check,index)=>{
      const repeated = isDuplicateSqlErrorCheck(check, diagnostic);
      const copy = checkCopy(item,check);
      return <details key={index}>
        <summary>{copy.label} <span className={check.status==='passed'?'exam-check-pass':''}>· {check.status==='passed'?'通过':'未通过'}（{check.score}/{check.points} 分）</span>{check.status!=='passed' && !repeated && check.diff && <small> · {checkSummary(check,copy.message)}</small>}</summary>
        <p>{copy.detail}</p>
        {check.status!=='passed' && (repeated
          ? <p className="exam-muted">因上方 SQL 执行出错，未能执行本检查点。</p>
          : <>
            <p>{copy.message}</p>
            {check.advice && check.advice!==copy.message && <p className="exam-muted">{check.advice}</p>}
          </>)}
        {check.status!=='passed' && check.diff && <p>缺失 {check.diff.missing.length} 行 · 多余 {check.diff.extra.length} 行
          {check.diff.columnsDiffer && ' · 列名或列数不同'}{check.diff.orderDiffers && ' · 行顺序不同'}</p>}
        {check.diff && (check.diff.missing.length>0 || check.diff.extra.length>0) &&
          <div className="exam-paired">
            <div><h4>缺失行</h4><pre>{check.diff.missing.map(row=>row.map(cell=>cell??'NULL').join(' | ')).join('\n') || '无'}</pre></div>
            <div><h4>多余行</h4><pre>{check.diff.extra.map(row=>row.map(cell=>cell??'NULL').join(' | ')).join('\n') || '无'}</pre></div>
          </div>}
        <div className="exam-paired">
          {check.expected.length>0 && <div><h4>期望结果</h4>{check.expected.map((table,i)=><WorkbenchResultGrid key={i} table={table} index={i}/>)}</div>}
          {check.actual.length>0 && <div><h4>实际结果</h4>{check.actual.map((table,i)=><WorkbenchResultGrid key={i} table={table} index={i}/>)}</div>}
        </div>
      </details>;
    })}
    {correct && <p>正确答案　{correct}</p>}
    {!!item.acceptedBlanks.length && <ol>{item.acceptedBlanks.map((answers,i)=><li key={i}><code>{answers.join(' ／ ')}</code></li>)}</ol>}
    {item.explanation && (compact
      ? <details><summary>题目解析</summary><p>{item.explanation}</p></details>
      : <p>{item.explanation}</p>)}
    {solution ? <QuestionSolution {...solution} placement="results"/>
      : item.referenceSql && <details><summary>参考答案</summary><SqlPreview key={item.referenceSql} sql={item.referenceSql}/></details>}
  </div>;
}

function fenced(text:string,language='') {
  const count = Math.max(3,...(text.match(/\u0060+/g)??[]).map(run=>run.length+1));
  const fence = '\u0060'.repeat(count);
  return fence+language+'\n'+text+'\n'+fence;
}

export function itemMarkdown(item:Item) {
  const kind = item.question.kind;
  const lines = ['### '+kindNames[kind]+' · '+item.score+'/'+item.question.points+' 分',item.question.prompt,
    '知识点　'+item.question.tags.join('、')];
  if (item.question.options.length) {
    item.question.options.forEach((option,index)=>lines.push('- '+String.fromCharCode(65+index)+'. '+option.text));
  }
  if (item.question.template) lines.push(fenced(item.question.template,'sql'));
  const display = (value:string) => kind==='boolean' ? value==='true'?'对':'错'
    : kind==='choice' ? item.question.options.find(o=>o.id===value)?.text??value : value;
  lines.push('作答',fenced(item.answer.map(display).join('\n') || '未作答',kind==='sql'?'sql':''));
  if (item.correct.length) lines.push('正确答案　'+item.correct.map(display).join('、'));
  if (item.acceptedBlanks.length) lines.push('标准填空　'+item.acceptedBlanks.map(blank=>blank.join(' ／ ')).join('；'));
  lines.push('解析　'+item.explanation);
  if (item.referenceSql) lines.push('参考 SQL',fenced(item.referenceSql,'sql'));
  const diagnostic = sqlItemDiagnostic(item);
  if (diagnostic) {
    lines.push((diagnostic.line>0?'SQL 执行出错（第 '+diagnostic.line+' 行）':'SQL 执行出错')
      +(diagnostic.advice?'：'+diagnostic.advice:''), ...(diagnostic.raw && diagnostic.raw!==diagnostic.advice ? [fenced(diagnostic.raw)] : []));
  }
  for (const check of item.checks) {
    const repeated = isDuplicateSqlErrorCheck(check, diagnostic);
    const copy = checkCopy(item,check);
    lines.push('- '+copy.label+' '+check.score+'/'+check.points+' · '+copy.detail+(check.status==='passed'?'': ' '+(repeated?'因 SQL 执行出错未执行':copy.message)));
    if (check.diff) lines.push('缺失 '+check.diff.missing.length+' 行，多余 '+check.diff.extra.length+' 行'
      +(check.diff.columnsDiffer?'，列名或列数不同':'')+(check.diff.orderDiffers?'，行顺序不同':''));
    if (check.expected.length) lines.push('期望结果',...check.expected.map(table=>resultMarkdown(table.columns,table.rows)));
    if (check.actual.length) lines.push('实际结果',...check.actual.map(table=>resultMarkdown(table.columns,table.rows)));
  }
  return lines.join('\n\n');
}

export function ExportActions({name,content}: {name:string;content:()=>string}) {
  function download() {
    const url = URL.createObjectURL(new Blob([content()],{type:'text/markdown;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href=url; anchor.download=name+'.md'; anchor.hidden=true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
  }
  return <><button type="button" className="button secondary exam-screen" onClick={download}><Download size={16} aria-hidden="true"/>导出 Markdown</button>
    <button type="button" className="button secondary exam-screen" onClick={()=>window.print()}><Printer size={16} aria-hidden="true"/>打印</button></>;
}

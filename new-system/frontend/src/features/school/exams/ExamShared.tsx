import {ArrowLeft, BookOpen, Download, Printer} from 'lucide-react';
import {Fragment, useState, type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Modal} from '../../../components/ui/modal';
import {PageSkeleton} from '../../../components/shared/LoadingState';
import {WorkbenchResultGrid} from '../WorkbenchResultGrid';
import {resultMarkdown} from '../result-grid.mjs';
import {kindNames,kinds,stateNames,type Item,type Kind,type Summary} from './exam-api';
import {isDuplicateSqlErrorCheck,primaryQueryPreview,sqlItemDiagnostic} from './exam-state.mjs';
import '../../../styles/school-exam.css';

export function shortPaperTitle(title:string) {
  const separator = title.indexOf('·');
  return separator < 0 ? title : title.slice(separator+1).trim();
}

const sqlTerms = /(\x60[^\x60\n]+\x60|[A-Za-z_]\w*(?:\s*\((?:[^()\n]|\([^()\n]*\))*\))|[\w]+\.[A-Za-z_]\w*|[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+|\b(?:WITH CHECK OPTION|GROUP BY|ORDER BY|LEFT JOIN|INNER JOIN|IS NOT NULL|IS NULL|NOT EXISTS|PRIMARY KEY|FOREIGN KEY|START TRANSACTION|DELIMITER|ROLLBACK|SELECT|HAVING|UNION ALL|EXPLAIN|ALTER TABLE|CREATE DATABASE|CREATE TABLE|CREATE VIEW|CREATE PROCEDURE|CREATE TRIGGER|COUNT\(\*\)|student|course|sc|Sno|Sname|Sex|Birth|Classno|Entrance_date|Home_addr|Sdept|Postcode|Cno|Cname|Total_perior|Credit|Grade|Salvaging|Out_stock|Stock|Prj_cost|mat_num|mat_name|prj_num|prj_name|prj_status|start_date|end_date|get_date|warehouse|department|amount|speci|unit|DATEDIFF|REGEXP)\b|>=|<=|<>)/gi;

export function questionHeading(text:string) {
  return text.split('\n\n### 涉及数据表：', 1)[0];
}

export function QuestionTables({text}:{text:string}) {
  const sections = text.split('\n\n### 涉及数据表：').slice(1);
  return sections.length > 0 && <div className="exam-question-tables">
    {sections.map(section=>{
      const [title, ...lines] = section.trim().split('\n');
      const rendered = lines.join('\n').trim().split(/\n\s*\n/).filter(Boolean).map(block=>{
        const rows = block.split('\n').filter(line=>line.startsWith('|')).map(line=>
          line.slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim().replaceAll('\\|','|')));
        const caption = block.split('\n').find(line=>line.startsWith('**'))?.replace(/^\*\*|\*\*$/g,'');
        if (!rows.length) return <p key={block}>{caption ?? block}</p>;
        const [headers,,...data] = rows;
        return <div key={block} className="exam-question-table-scroll" tabIndex={0} role="region" aria-label={caption ?? title}>
          <table className="table table-sm" data-table-kind={caption ? 'sample' : 'schema'}>
            {caption && <caption>{caption}</caption>}
            <thead><tr>{headers.map((header,i)=><th key={i} scope="col">{header}</th>)}</tr></thead>
            <tbody>{data.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>
              {cell.startsWith('`') && cell.endsWith('`') ? <code>{cell.slice(1,-1)}</code> : cell}
            </td>)}</tr>)}</tbody>
          </table>
        </div>;
      });
      return <section key={title}><h3>{title}</h3>{rendered}</section>;
    })}
  </div>;
}

export function QuestionText({text}:{text:string}) {
  return text.split(sqlTerms).map((chunk,index)=>index%2
    ? <code key={index}>{chunk.replace(/^\x60|\x60$/g,'')}</code> : chunk);
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

export function ItemFeedback({item}: {item:Item}) {
  const option = item.question.options.findIndex(value=>value.id===item.correct[0]);
  const correct = item.question.kind==='choice' && option>=0
    ? String.fromCharCode(65+option)+' · '+item.question.options[option].text
    : item.correct.map(value=>value==='true'?'对':value==='false'?'错':value).join('、');
  const diagnostic = sqlItemDiagnostic(item);
  const preview = primaryQueryPreview(item);
  return <div className="exam-feedback">
    <p role="status"><strong className={item.score===item.question.points?'badge badge-success exam-score-pass':undefined}>{stateNames[item.status] ?? item.status} · {item.score}/{item.question.points} 分</strong></p>
    {diagnostic && <div className="exam-sql-diagnostic" role="alert">
      <strong>{diagnostic.line>0?'第 '+diagnostic.line+' 行':'SQL 执行出错'}</strong>
      {diagnostic.advice && <p>{diagnostic.advice}</p>}
      {diagnostic.raw && diagnostic.raw!==diagnostic.advice && <pre>{diagnostic.raw}</pre>}
    </div>}
    {correct && <p>正确答案　{correct}</p>}
    {!!item.acceptedBlanks.length && <ol>{item.acceptedBlanks.map((answers,i)=><li key={i}><code>{answers.join(' ／ ')}</code></li>)}</ol>}
    {item.explanation && <p>{item.explanation}</p>}
    {preview && <div className="exam-result-preview">
      <div className="exam-result-preview-head">
        <strong>本次查询结果（{preview.label}）</strong>
        <span className="exam-muted">共 {preview.actual.reduce((sum,table)=>sum+table.rows.length,0)} 行</span>
      </div>
      {preview.actual.map((table,i)=><WorkbenchResultGrid key={i} table={table} index={i}/>)}
    </div>}
    {item.referenceSql && <details><summary>参考 SQL</summary><pre>{item.referenceSql}</pre></details>}
    {item.checks.map((check,index)=>{
      const repeated = isDuplicateSqlErrorCheck(check, diagnostic);
      return <details key={index} ref={current=>{if(current && !current.dataset.initialized){current.open=check.status!=='passed' && !repeated;current.dataset.initialized='true';}}}>
        <summary>{check.label} <span className={check.status==='passed'?'exam-check-pass':''}>· {check.status==='passed'?'通过':'未通过'}（{check.score}/{check.points} 分）</span></summary>
        {check.status!=='passed' && (repeated
          ? <p className="exam-muted">因上方 SQL 执行出错，未能执行本检查点。</p>
          : <>
            <p>{check.message}</p>
            {check.advice && check.advice!==check.message && <p className="exam-muted">{check.advice}</p>}
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
    lines.push('- '+check.label+' '+check.score+'/'+check.points+' · '+(repeated?'因 SQL 执行出错未执行':check.message));
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

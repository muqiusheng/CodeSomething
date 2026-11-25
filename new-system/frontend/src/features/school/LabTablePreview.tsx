import {useCallback} from 'react';
import {useScopedRead} from '../../hooks/useScopedRead';
import type {Debug, Table} from './exams/exam-api';
import {schoolRequest, type Question} from './school-api';
import {TableDisclosure} from './exams/ExamShared';
import {isConnectionTask} from './source-tables.mjs';

const tableTerms: Record<string, RegExp> = {
  student: /\bstudent\b|学生|学号|姓名|同学|男生|女生/i,
  course: /\bcourse\b|课程|课名|学分/i,
  sc: /\bsc\b|选课|成绩|分数/i,
};
const tableNames: Record<string, string> = {
  student: '学生表', course: '课程表', sc: '选课表', student_other: '学生副本表',
  salvaging: '电力抢修工程表', stock: '配电物资库存记录表', out_stock: '出库领用记录表',
};
const schemaHeaders: Record<string, string> = {
  Field: '字段', Type: '类型', Null: '可空', Key: '键', Default: '默认值', Extra: '附加',
};

export function LabTablePreview({url, question}: {url: string; question: Question}) {
  const endpoint = url + '/questions/' + encodeURIComponent(question.id) + '/tables'
    + (question.gradingRevision ? '?revision=' + encodeURIComponent(question.gradingRevision) : '');
  const request = useCallback(async () => {
    const result = await schoolRequest<Debug>(endpoint);
    if (result.status !== 'ok') throw new Error(result.error?.advice ?? '暂时无法读取初始数据。');
    return result;
  }, [endpoint]);
  const connection = isConnectionTask(question);
  const {data, error, reload} = useScopedRead(connection ? null : endpoint, request, {staleTime: Infinity});
  const previews = (data?.steps ?? []).flatMap((step, index, steps) => {
    const match = /^DESCRIBE (.+)$/i.exec(step.summary.trim());
    if (!match || !step.tables[0]) return [];
    const name = match[1].replace(/^`|`$/g, '');
    return [{name, schema: step.tables[0], sample: steps[index + 1]?.tables[0]}];
  });
  const description = question.title + ' ' + question.requirement;
  const mentioned = previews.filter(({name}) => {
    const key = name.toLowerCase();
    return (tableTerms[key]?.test(description) ?? description.toLowerCase().includes(key));
  });
  const tables = [...new Set([
    ...mentioned,
    ...Object.keys(tableTerms).flatMap(key => previews.filter(table => table.name.toLowerCase() === key)),
  ])];

  if (connection) return null;
  return <section className="school-lab-data" aria-label="本题初始数据">
    <h3>本题初始数据</h3>
    {error ? <p role="alert">{error} <button type="button" className="button secondary" onClick={reload}>重试</button></p>
      : !data ? <p role="status">正在读取表结构与样例…</p>
      : !tables.length ? <p>本题的目标表等待创建。</p>
      : tables.map(({name,schema,sample})=><TableDisclosure key={name} name={name}
        meaning={tableNames[name.toLowerCase()]} columnCount={schema.rows.length}>
        <PreviewTable table={schema} caption={name + ' · 表结构'} schema/>
        {sample && <PreviewTable table={{...sample, rows: sample.rows.slice(0,2)}} caption={name + ' · 样例数据'}/>}
      </TableDisclosure>)}
  </section>;
}

function PreviewTable({table, caption, schema = false}: {table: Table; caption: string; schema?: boolean}) {
  const columns = table.columns.flatMap((name, index) =>
    schema && name === 'Extra' && table.rows.every(row => !row[index]?.trim()) ? [] : [{name, index}]);
  return <div className="exam-question-table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table className="table table-sm" data-table-kind={schema ? "lab-schema" : "sample"}>
      <caption>{schema ? '表结构' : '样例数据'}</caption>
      <thead><tr>{columns.map(({name, index}) => <th key={index} scope="col">{schema ? schemaHeaders[name] ?? name : name}</th>)}</tr></thead>
      <tbody>{table.rows.length ? table.rows.map((row, index) => <tr key={index}>
        {columns.map(({index}) => <td key={index}>{row[index] ?? <code>NULL</code>}</td>)}
      </tr>) : <tr><td colSpan={columns.length}>暂无记录</td></tr>}</tbody>
    </table>
  </div>;
}

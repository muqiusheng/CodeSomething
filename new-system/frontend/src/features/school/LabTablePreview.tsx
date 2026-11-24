import {useCallback, useState} from 'react';
import {useScopedRead} from '../../hooks/useScopedRead';
import type {Debug, Table} from './exams/exam-api';
import {schoolRequest, type Question} from './school-api';
import {isConnectionTask} from './source-tables.mjs';

const tableTerms: Record<string, RegExp> = {
  student: /\bstudent\b|学生|学号|姓名|同学|男生|女生/i,
  course: /\bcourse\b|课程|课名|学分/i,
  sc: /\bsc\b|选课|成绩|分数/i,
};
const schemaHeaders: Record<string, string> = {
  Field: '字段', Type: '类型', Null: '可空', Key: '键', Default: '默认值', Extra: '附加',
};

export function LabTablePreview({url, question}: {url: string; question: Question}) {
  const [selected, setSelected] = useState<string>();
  const endpoint = url + '/questions/' + encodeURIComponent(question.id) + '/tables';
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
  const available = tables.length ? tables : previews;
  const current = available.find(table => table.name === selected) ?? available[0];

  if (connection) return null;
  return <section className="school-lab-data" aria-label="本题初始数据">
    <h3>本题初始数据</h3>
    {error ? <p role="alert">{error} <button type="button" className="button secondary" onClick={reload}>重试</button></p>
      : !data ? <p role="status">正在读取表结构与样例…</p>
      : !current ? <p>本题初始库没有数据表。</p>
      : <>
        <div className="school-table-tabs" role="group" aria-label="初始库数据表">
          {available.map(table => <button key={table.name} type="button" className="btn btn-sm school-table-tab"
            aria-pressed={current.name === table.name} onClick={() => setSelected(table.name)}>{table.name}</button>)}
        </div>
        <PreviewTable table={current.schema} caption={current.name + ' · 表结构'} schema/>
        {current.sample && <PreviewTable table={current.sample} caption={current.name + ' · 样例数据'}/>}
      </>}
  </section>;
}

function PreviewTable({table, caption, schema = false}: {table: Table; caption: string; schema?: boolean}) {
  return <div className="exam-question-table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table className="table table-sm" data-table-kind={schema ? "lab-schema" : "sample"}>
      <caption>{caption}</caption>
      <thead><tr>{table.columns.map((column, index) => <th key={index} scope="col">{schema ? schemaHeaders[column] ?? column : column}</th>)}</tr></thead>
      <tbody>{table.rows.length ? table.rows.map((row, index) => <tr key={index}>
        {row.map((cell, column) => <td key={column}>{cell ?? <code>NULL</code>}</td>)}
      </tr>) : <tr><td colSpan={table.columns.length}>暂无记录</td></tr>}</tbody>
    </table>
  </div>;
}

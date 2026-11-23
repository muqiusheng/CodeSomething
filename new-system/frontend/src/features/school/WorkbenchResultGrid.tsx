import {useState} from 'react';
import {Download} from 'lucide-react';
import {filterRows, resultCsv, resultMarkdown} from './result-grid.mjs';
import type {RunResult} from './school-api';

export function WorkbenchResultGrid({table, index}: {table: RunResult['tables'][number]; index: number}) {
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const rows = filterRows(table.rows, query);

  async function copy() {
    try {
      await navigator.clipboard.writeText(resultMarkdown(table.columns, rows));
      setNotice('已复制 Markdown 表格。');
    } catch {
      setNotice('浏览器未允许访问剪贴板。');
    }
  }

  return <div className="school-result-grid">
    <div className="school-workbench-controls">
      <input className="input" type="search" aria-label={`Filter Rows · 结果 ${index + 1}`} placeholder="Filter Rows"
        value={query} onChange={event => {setQuery(event.target.value); setNotice('');}}/>
      <details className="school-grid-export">
        <summary className="button secondary"><Download size={14} aria-hidden="true"/>Export</summary>
        <div className="school-actions">
          <a className="button secondary" download={`query-result-${index + 1}.csv`}
            href={'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + resultCsv(table.columns, rows))}>下载 CSV</a>
          <button className="button secondary" type="button" onClick={() => void copy()}>复制 Markdown</button>
        </div>
      </details>
      {query.trim() && <span role="status">{rows.length}/{table.rows.length} 行</span>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {rows.length ? <div className="school-table-scroll" tabIndex={0} role="region" aria-label={`结果表 ${index + 1}`}>
      <table className="table table-sm" aria-label={`查询结果 ${index + 1}`}>
        <thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell ?? <em>NULL</em>}</td>)}</tr>)}</tbody>
      </table>
    </div> : <p>没有匹配的行。</p>}
  </div>;
}

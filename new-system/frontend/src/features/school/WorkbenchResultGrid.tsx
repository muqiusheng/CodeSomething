import {useState} from 'react';
import {filterRows} from './result-grid.mjs';
import type {RunResult} from './school-api';

export function WorkbenchResultGrid({table, index}: {table: RunResult['tables'][number]; index: number}) {
  const [query, setQuery] = useState('');
  const filterable = table.rows.length > 15;
  const rows = filterable ? filterRows(table.rows, query) : table.rows;

  return <div className="school-result-grid">
    {filterable && <div className="school-workbench-controls">
      <input className="input" type="search" name={'filter-result-'+index} autoComplete="off" aria-label={`筛选结果 ${index + 1}`} placeholder="筛选结果行"
        value={query} onChange={event => setQuery(event.target.value)}/>
      {query.trim() && <span role="status">{rows.length}/{table.rows.length} 行</span>}
    </div>}
    {table.columns.length > 0 ? <div className="school-table-scroll" tabIndex={0} role="region" aria-label={`结果表 ${index + 1}`}>
      <table className="table table-sm" aria-label={`查询结果 ${index + 1}`}>
        <thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell ?? <em>NULL</em>}</td>)}</tr>)}{!rows.length && <tr><td colSpan={table.columns.length}>{query.trim() && filterable ? '没有匹配的行。' : '查询返回 0 行。'}</td></tr>}</tbody>
      </table>
    </div> : <p>查询返回 0 行。</p>}
  </div>;
}

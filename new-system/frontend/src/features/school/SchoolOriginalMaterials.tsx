import {useEffect, useState} from 'react';
import {Check, Copy, Database, Download, FileText, X} from 'lucide-react';
import type {LabDetails, Question} from './school-api';
import {isConnectionTask, matchSourceTables} from './source-tables.mjs';

export function SchoolOriginalMaterials({
  lab,
  question,
  onClose,
  isPanel = false,
}: {
  lab: LabDetails['lab'];
  question: Question;
  onClose?: () => void;
  isPanel?: boolean;
}) {
  const [download, setDownload] = useState<string>();
  const [copiedTable, setCopiedTable] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!lab.fixtureSql) return;
    const url = URL.createObjectURL(new Blob([lab.fixtureSql], {type: 'text/plain;charset=utf-8'}));
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [lab.fixtureSql]);

  const tables = lab.sourceTables ?? [];
  const hasContent = Boolean(question.originalText || lab.originalNotes || tables.length || download);
  if (!hasContent) return null;

  async function copyColumns(tableName: string, columns: string[]) {
    try {
      await navigator.clipboard.writeText(columns.join(', '));
      setCopiedTable(tableName);
      setTimeout(() => setCopiedTable(null), 1800);
    } catch {
      // Clipboard API may be blocked in some iframe contexts
    }
  }

  const matchedTables = matchSourceTables(tables, question);
  const displayedTables = showAll ? tables : matchedTables;
  const showLabNotes = !tables.length || showAll || displayedTables.some(table => /初始数据|参考格式/.test(table.title));

  const content = (
    <div className="school-inspector-body">
      {question.originalText && (
        <section className="school-inspector-section school-original-section">
          <div className="school-inspector-subtitle">
            <FileText size={14} aria-hidden="true" />
            <h3>本题原题材料</h3>
          </div>
          <div className="school-original-box">
            <p className="school-original-text">{question.originalText}</p>
          </div>
        </section>
      )}

      {showLabNotes && lab.originalNotes && (
        <p className="school-source-note">{lab.originalNotes}</p>
      )}

      {showLabNotes && download && (
        <div className="school-download-wrap">
          <a className="btn button secondary school-download-btn" href={download} download="database-systems-original-data.sql">
            <Download size={14} aria-hidden="true" />
            下载表 5–7 原始数据 SQL
          </a>
        </div>
      )}

      {tables.length > 0 && (
        <section className="school-inspector-section school-tables-section">
          <div className="school-table-tabs" role="group" aria-label="数据表筛选">
            <button type="button" aria-pressed={!showAll}
              className={`school-table-tab ${!showAll ? 'active' : ''}`} onClick={() => setShowAll(false)}>
              本题涉及 ({matchedTables.length})
            </button>
            <button type="button" aria-pressed={showAll}
              className={`school-table-tab ${showAll ? 'active' : ''}`} onClick={() => setShowAll(true)}>
              全部表 ({tables.length})
            </button>
          </div>
          {!showAll && matchedTables.length === 0 && <div className="school-table-empty">
            <p>{isConnectionTask(question)
              ? '本题聚焦于系统连接与环境指令，无需参考业务数据表。'
              : '本题暂无关联的数据表。'}</p>
            <button type="button" className="school-link-btn" onClick={() => setShowAll(true)}>查看本实验全部数据表</button>
          </div>}

          <div className="school-tables-list">
            {displayedTables.map((table) => {
              const isCopied = copiedTable === table.title;
              return (
                <div className="school-table-card" key={table.title}>
                  <div className="school-table-card-head">
                    <span className="school-table-card-title">{table.title}</span>
                    <button
                      type="button"
                      className="button secondary school-copy-cols-btn"
                      onClick={() => void copyColumns(table.title,
                        table.columns[0] === '列名称' ? table.rows.map(row => row[0]) : table.columns)}
                      title="复制本表所有字段名，方便粘贴在 SQL 中"
                    >
                      {isCopied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                      <span>{isCopied ? '已复制字段' : '复制字段'}</span>
                    </button>
                  </div>
                  <div
                    className="school-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label={table.title}
                  >
                    <table className="table table-sm school-preview-table">
                      <thead>
                        <tr>
                          {table.columns.map((column) => (
                            <th key={column} scope="col">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, index) => (
                          <tr key={index}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );

  if (isPanel) {
    return (
      <aside className="school-pane school-inspector-panel" aria-label="实验数据与参考材料">
        <div className="school-inspector-head">
          <div className="school-inspector-title">
            <Database size={16} aria-hidden="true" />
            <h2>实验数据与参考</h2>
          </div>
          {onClose && (
            <button
              type="button"
              className="icon-button school-inspector-close"
              aria-label="收起实验数据面板"
              onClick={onClose}
              title="收起数据面板"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {content}
      </aside>
    );
  }

  return (
    <details className="school-source" open>
      <summary>原题与实验数据 ({tables.length > 0 ? `${tables.length} 张表` : '原文'})</summary>
      {content}
    </details>
  );
}

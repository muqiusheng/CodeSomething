import {useCallback, useEffect, useId, useRef, useState} from 'react';
import {ChevronRight, Copy} from 'lucide-react';
import {loadEditor} from '../../components/code/CodeEditor';
import {Modal} from '../../components/ui/modal';
import {useScopedRead} from '../../hooks/useScopedRead';
import {schoolRequest} from './school-api';

type Solution = {
  explanation: string;
  referenceSql?: string | null;
  correct?: string[];
  acceptedBlanks?: string[][];
};

export function SqlPreview({sql}: {sql: string}) {
  const [formatted, setFormatted] = useState<string>();
  const code = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    void import('./reference-sql.mjs').then(({formatReferenceSql}) => {
      if (active) setFormatted(formatReferenceSql(sql));
    }).catch(() => undefined);
    return () => {active = false;};
  }, [sql]);
  const display = formatted ?? sql;
  useEffect(() => {
    let active = true;
    void loadEditor().then(async monaco => {
      // Monaco escapes the supplied SQL before producing highlighting markup.
      const highlighted = await monaco.editor.colorize(display, 'sql', {tabSize: 2});
      if (active && code.current) code.current.innerHTML = highlighted;
    }).catch(() => undefined);
    return () => {active = false;};
  }, [display]);
  return <pre className="school-solution-sql" tabIndex={0} aria-label="参考 SQL"><code key={display} ref={code}>{display}</code></pre>;
}

export function QuestionSolution({endpoint, options, value, onFill, disabled}: {
  endpoint: string;
  options?: {id: string; text: string}[];
  value?: string;
  onFill?: (sql: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useCallback(() => schoolRequest<Solution>(endpoint), [endpoint]);
  const {data, error, reload} = useScopedRead(open ? endpoint : null, request, {staleTime: Infinity});
  const sql = data?.referenceSql;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('参考 SQL 已复制。');
    } catch {
      setNotice('剪贴板不可用，可选中代码手动复制。');
    }
  }

  return <div className="school-solution">
    <button type="button" className="btn btn-ghost school-reference-row school-solution-toggle" aria-expanded={open} aria-controls={id}
      onClick={() => {setOpen(!open); setNotice('');}}>
      <ChevronRight size={14} aria-hidden="true"/>{open ? '收起参考答案' : '查看参考答案'}
    </button>
    <div id={id} hidden={!open}>
      {open && (error ? <p role="alert">{error} <button type="button" className="button secondary" onClick={reload}>重试</button></p>
        : !data ? <p role="status">正在读取参考答案…</p>
        : <section className="card school-solution-card" aria-label="参考答案与解析">
          {sql && <SqlPreview key={sql} sql={sql}/>}
          {data.correct?.map(answer => {
            const index = options?.findIndex(option => option.id === answer) ?? -1;
            const label = answer === 'true' ? '对' : answer === 'false' ? '错'
              : index >= 0 ? String.fromCharCode(65 + index) + ' · ' + options![index].text : answer;
            return <p key={answer}>{label}</p>;
          })}
          {!!data.acceptedBlanks?.length && <ol>
            {data.acceptedBlanks.map((answers, index) => <li key={index}>
              <span>第 {index + 1} 空 </span><code>{answers.join(' ／ ')}</code>
            </li>)}
          </ol>}
          {sql && onFill && <div className="school-solution-actions">
            <button type="button" className="btn btn-ghost btn-sm school-solution-action" onClick={() => void copy(sql)}>
              <Copy size={14} aria-hidden="true"/>复制参考 SQL
            </button>
            <button type="button" className="btn btn-ghost btn-sm school-solution-action" disabled={disabled} onClick={() => {
              if (value?.trim() && value !== sql) setConfirm(true);
              else onFill(sql);
            }}>填入编辑器试运行</button>
          </div>}
          {notice && <p role="status">{notice}</p>}
          <h3>解题思路</h3>
          <p>{data.explanation}</p>
        </section>)}
    </div>
    {confirm && sql && onFill && <Modal open={confirm} onOpenChange={setConfirm} title="覆盖当前 SQL？"
      description="填入参考 SQL 后，当前编辑器中的代码将被替换。">
      <div className="school-solution-actions">
        <button type="button" className="button secondary" onClick={() => setConfirm(false)}>保留当前代码</button>
        <button type="button" className="button primary" disabled={disabled} onClick={() => {onFill(sql);setConfirm(false);}}>
          确认填入
        </button>
      </div>
    </Modal>}
  </div>;
}

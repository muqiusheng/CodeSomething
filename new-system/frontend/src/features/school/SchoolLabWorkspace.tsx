import {useScopedRead} from '../../hooks/useScopedRead';
import {refreshLearning} from '../../api/learning-api';
import {PageSkeleton} from '../../components/shared/LoadingState';
import {sessionState} from '../../api/browser-state.mjs';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, Check, ChevronRight, Database, FileText, ListTree, Play, RotateCcw, Save, TextQuote} from 'lucide-react';
import {Link, useParams} from 'react-router-dom';
import {CodeEditor, type CodeEditorHandle} from '../../components/code/CodeEditor';
import {Modal} from '../../components/ui/modal';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '../../components/ui/tabs';
import {ReportExportModal} from './ReportExportModal';
import {SchoolOriginalMaterials} from './SchoolOriginalMaterials';
import {WorkbenchNavigator} from './WorkbenchNavigator';
import {WorkbenchResultGrid} from './WorkbenchResultGrid';
import {isConnectionTask} from './source-tables.mjs';
import {errorMessage, labUrl, schoolRequest, type LabDetails, type RunResult, type Work} from './school-api';
import '../../styles/school.css';

export function SchoolLabWorkspace() {
  const {courseId = '', labId = ''} = useParams();
  const url = labUrl(courseId, labId);
  const request=useCallback(()=>schoolRequest<LabDetails>(url),[url]);
  const {data:details,error,reload,setData}=useScopedRead(url,request);
  if (details) return <LabWorkspace key={url} details={details} url={url}
    updateWork={work=>setData({...details,work})}/>;
  return <div className="page school-workspace">
    <Link to="/school" className="back-link">返回课内实战</Link>
    {error ? <div className="note" role="alert"><p>{error}</p><button className="button secondary" onClick={reload}>重试</button></div> : <PageSkeleton variant="course" label="正在读取实验…"/>}
  </div>;
}

function recover(url: string, work: Work) {
  try {
    const draft = JSON.parse(sessionState.getItem(url) || 'null') as Work | null;
    if (draft?.revision === work.revision) return draft.drafts;
  } catch { /* The saved server draft remains available. */ }
  return work.drafts;
}

function LabWorkspace({details, url, updateWork}: {details: LabDetails; url: string; updateWork: (value: Work) => void}) {
  const {lab, course, outline} = details;
  const [work, setWork] = useState(details.work);
  const [drafts, setDrafts] = useState(() => recover(url, details.work));
  const [selected, setSelected] = useState(lab.questions.find(question => details.work.executions[question.id]?.result.status !== 'ok')?.id || lab.questions[0].id);
  const [busy, setBusy] = useState('');
  const active = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [lengthError, setLengthError] = useState(false);
  const [batch, setBatch] = useState<string[]>([]);
  const [schemaRevision, setSchemaRevision] = useState(0);
  const databaseKey = 'cs-school-database-' + course.id;
  const [database, setDatabase] = useState(() => {
    try {return sessionState.getItem(databaseKey) ?? details.database ?? '';}
    catch {return details.database ?? '';}
  });
  const [selectionRun, setSelectionRun] = useState<{questionId: string; sql: string; result: RunResult}>();
  const [resultRevision, setResultRevision] = useState(0);
  const editor = useRef<CodeEditorHandle>(null);
  const [report, setReport] = useState(false);
  const [reset, setReset] = useState(false);
  const [toolsOpen,setToolsOpen] = useState(false);
  const [wide] = useState(() => matchMedia('(min-width:821px)').matches);
  const [inspectorOpen, setInspectorOpen] = useState(() => matchMedia('(min-width:1200px)').matches);
  const question = lab.questions.find(item => item.id === selected)!;
  const value = drafts[selected] ?? '';
  const mysql = course.engine === 'mysql';
  const dirty = JSON.stringify(drafts) !== JSON.stringify(work.drafts);
  const payload = {revision: work.revision, drafts};
  const resultFor = (id: string) => {
    const execution = work.executions[id];
    return execution?.sql === drafts[id] ? execution?.result : undefined;
  };
  const preview = selectionRun?.questionId === selected && selectionRun.sql === value ? selectionRun.result : undefined;
  const result = preview ?? resultFor(selected);
  const required = lab.questions.filter(item => !item.optional);
  const executed = required.filter(item => resultFor(item.id)?.status === 'ok').length;
  const complete = mysql && required.length > 0 && executed === required.length;
  const percent = required.length ? Math.floor(executed * 100 / required.length) : 0;
  const labIndex = course.labs.findIndex(item => item.id === outline.id);
  const nextLab = labIndex >= 0 ? course.labs[labIndex + 1] : undefined;
  const completion = useRef<HTMLDivElement>(null);
  const wasComplete = useRef(complete);

  useEffect(() => {
    if (complete && !wasComplete.current) completion.current?.scrollIntoView({block: 'nearest'});
    wasComplete.current = complete;
  }, [complete]);

  useEffect(() => {
    if (!lengthError) return;
    const timer = window.setTimeout(() => setLengthError(false), 5000);
    return () => window.clearTimeout(timer);
  }, [lengthError]);

  useEffect(() => {
    try {sessionState.setItem(url, JSON.stringify({revision: work.revision, drafts}));}
    catch { /* Save remains available when browser storage is unavailable. */ }
  }, [url, work.revision, drafts]);

  useEffect(() => {
    try {sessionState.setItem(databaseKey, database);}
    catch { /* The selected database still applies in this workspace. */ }
  }, [database, databaseKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function act(action: string, apply: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(action); setNotice(''); setError('');
    try {await apply();}
    catch (error) {setError(errorMessage(error));}
    finally {active.current = false; setBusy('');}
  }

  useEffect(() => {
    if (!dirty && !busy && details.work.revision > work.revision) {
      setWork(details.work);
      setDrafts(details.work.drafts);
    }
  }, [details.work, work.revision, dirty, busy]);

  function applyWork(next: Work) {
    updateWork(next);
    setWork(next);
    setDrafts(next.drafts);
  }

  async function save() {
    applyWork(await schoolRequest<Work>(url + '/save', payload));
    setNotice('草稿已保存。');
  }

  function openReport() {
    void act('正在准备报告…', async () => {
      if (dirty) await save();
      setReport(true);
    });
  }

  function run(all: boolean) {
    const selection = all ? '' : editor.current?.getSelectedText() ?? '';
    const useSelection = Boolean(selection.trim());
    void act(all ? '正在运行全部作答…' : useSelection ? '正在运行 SQL 选区…' : '正在运行当前题…', async () => {
      setSelectionRun(undefined);
      const response = await schoolRequest<{work: Work; results: Record<string, RunResult>}>(url + '/run',
        {...payload, questionId: all ? null : selected, selection: useSelection ? selection : null, database});
      const lastSuccess = Object.values(response.results).reverse().find(result => result.status === 'ok');
      if (lastSuccess) setDatabase(lastSuccess.database ?? '');
      setSchemaRevision(value => value + 1);
      setResultRevision(value => value + 1);
      if (useSelection) {
        setBatch([]);
        const result = response.results[selected];
        if (result) setSelectionRun({questionId: selected, sql: value, result});
        return;
      }
      applyWork(response.work);
      refreshLearning('school');
      const ids = lab.questions.filter(item => response.results[item.id]).map(item => item.id);
      setBatch(all ? ids : []);
      if (all) {
        const passed = ids.filter(id => response.results[id].status === 'ok').length;
        const written = Object.values(drafts).filter(text => text.trim()).length;
        setNotice('已运行 ' + ids.length + '/' + written + ' 题，其中 ' + passed + ' 题执行成功。');
        if (!response.results[selected] && ids[0]) setSelected(ids[0]);
      }
    });
  }

  function formatSql() {
    void act('正在格式化 SQL…', async () => {
      if (/^\s*DELIMITER\s/im.test(value)) throw new Error('带 DELIMITER 的过程或触发器脚本请手动排版。');
      const {formatDialect, mysql} = await import('sql-formatter');
      let formatted: string;
      try { formatted = formatDialect(value, {dialect: mysql, keywordCase: 'upper', tabWidth: 2}); }
      catch { throw new Error('无法格式化这段 SQL，请检查语法或分隔符。'); }
      edit(formatted);
    });
  }

  function resetDatabase(empty: boolean) {
    setReset(false);
    void act('正在重置练习库…', async () => {
      const response = await schoolRequest<{message: string}>(url + '/reset', {empty});
      setSchemaRevision(value => value + 1);
      setSelectionRun(undefined);
      setNotice(response.message + ' 草稿和历史运行记录已保留。');
    });
  }

  function edit(text: string) {
    if (text.length > 8192) {
      setLengthError(true);
      return;
    }
    setLengthError(false);
    setDrafts({...drafts, [selected]: text});
  }

  const next = lab.questions[lab.questions.indexOf(question) + 1];
  const hasOriginalData = Boolean(
    question.originalText ||
    lab.originalNotes ||
    (lab.sourceTables && lab.sourceTables.length > 0) ||
    lab.fixtureSql
  );

  return <div className={`page school-workspace ${hasOriginalData && inspectorOpen ? 'workspace-wide' : ''}`}>
    <Link to="/school" className="back-link"><ArrowLeft size={15} aria-hidden="true"/>{course.title}</Link>
    <div className="school-lab-heading"><h1>{outline.title}</h1>
      {mysql && <span className="badge school-badge">必做 {executed}/{required.length}</span>}
    </div>
    <div className={`school-grid ${hasOriginalData && inspectorOpen ? 'has-inspector' : ''}`}>
      <section className="school-pane school-brief" aria-label="实验资料与数据库对象">
        <Tabs defaultValue="questions">
          {mysql && <TabsList className="school-workbench-tabs" aria-label="工作台导航">
            <TabsTrigger value="questions">实验题目</TabsTrigger>
            <TabsTrigger value="schema"><ListTree size={14} aria-hidden="true"/>对象浏览 (SCHEMAS)</TabsTrigger>
          </TabsList>}
          <TabsContent value="questions">
        <details open={wide}><summary>实验目的与要求</summary><p className="school-original-text">{lab.originalObjective || lab.objective}</p><p>{lab.requirements}</p></details>
        <details open={wide} className="school-question-menu">
          <summary><h2>题目目录</h2>{complete && <span className="badge badge-success school-badge">已通关</span>}</summary>
          {mysql && required.length > 0 && <div className="school-outline-progress">
            <progress className="progress progress-success" max={required.length} value={executed} aria-label="必做题进度"/>
            <span>{percent}%</span>
          </div>}
          <ol className="school-questions" aria-label="实验题目">
          {lab.questions.map(item => {
            const outcome = resultFor(item.id);
            const status = outcome?.status === 'ok' ? '已运行' : outcome ? '有运行反馈' : drafts[item.id]?.trim() ? '有草稿' : '待作答';
            return <li key={item.id}><button aria-current={selected === item.id ? 'step' : undefined}
              disabled={!!busy} onClick={() => setSelected(item.id)}>
              <span>{item.title}{item.optional && <small> · 选做</small>}</span>
              <span className="school-question-status">{outcome?.status === 'ok' && <Check size={14} aria-hidden="true"/>}{status}</span>
            </button></li>;
          })}
          </ol>
        </details>
          </TabsContent>
          {mysql && <TabsContent value="schema"><WorkbenchNavigator courseId={course.id} revision={schemaRevision}
            database={database} onDatabaseChange={setDatabase} busy={!!busy}/></TabsContent>}
        </Tabs>
      </section>
      <div className="school-editor-column">
        <section className="school-pane school-editor-pane" aria-labelledby="school-question">
          <div className="school-question-header">
            <h2 id="school-question">{question.title}</h2>
          </div>
          <p className="school-question-requirement">{question.requirement}</p>
          {(question.hint || details.database) && <details className="school-hint"><summary>考点提示</summary>
            {question.hint && <p>{question.hint}</p>}
            {mysql && <p>当前库 {database ? <code>{database}</code> : '未选择数据库'}</p>}
            {mysql && isConnectionTask(question) && <p>
              用 <code>SHOW DATABASES;</code> 列出可见数据库。在对象浏览新建或切换数据库，也可在这里运行
              {' '}<code>CREATE DATABASE student_info;</code>，再用 <code>USE student_info;</code> 选中它。
            </p>}
          </details>}
          <div className="school-actions school-tools">
            {mysql && <button className="btn button primary school-run-current" disabled={!!busy || !value.trim()} onClick={() => run(false)} title="Ctrl+Enter · 优先运行选中 SQL"><Play aria-hidden="true" size={15}/>运行当前题</button>}
            <button className="btn button secondary" disabled={!!busy} aria-label={dirty ? '保存（有未保存修改）' : '保存'}
              onClick={() => void act('正在保存…', save)}><Save aria-hidden="true" size={15}/>保存
              {dirty && <span className="school-dirty-dot" aria-hidden="true"/>}
            </button>
            <button type="button" className="button secondary school-tool-toggle" aria-expanded={toolsOpen}
              aria-controls="school-extra-tools" onClick={() => setToolsOpen(!toolsOpen)}>更多操作<ChevronRight size={14} aria-hidden="true"/></button>
            <div id="school-extra-tools" className="school-extra-tools" data-open={toolsOpen}>
            {mysql && <button className="btn button secondary" disabled={!!busy || !Object.values(drafts).some(text => text.trim())} onClick={() => run(true)}>运行全部</button>}
            {mysql && <button className="btn button secondary" disabled={!!busy || !value.trim()} onClick={formatSql}>
              <TextQuote size={15} aria-hidden="true"/>格式化 SQL
            </button>}
            {hasOriginalData && (
              <button
                type="button"
                className={`btn button secondary ${inspectorOpen ? 'active' : ''}`}
                disabled={!!busy}
                onClick={() => setInspectorOpen(!inspectorOpen)}
                aria-expanded={inspectorOpen}
                title={inspectorOpen ? "收起右侧实验数据面板" : "展开右侧实验数据面板"}
              >
                <Database aria-hidden="true" size={15}/>
                <span>实验数据</span>
              </button>
            )}
            {mysql && <button className="btn button secondary" disabled={!!busy} onClick={() => setReset(true)}><RotateCcw aria-hidden="true" size={15}/>重置练习库</button>}
            {!complete && <button className="btn button secondary" disabled={!!busy} onClick={openReport}>
              <FileText aria-hidden="true" size={15}/>导出实验报告
            </button>}
            </div>
          </div>
          {mysql ? <div className="school-monaco" onKeyDownCapture={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.repeat) {
              event.preventDefault(); event.stopPropagation();
              if (!busy && value.trim()) run(false);
            }
          }}>
            <CodeEditor path={selected + '.sql'} value={value} onChange={edit} readOnly={!!busy} selectionRef={editor}/>
          </div> : <textarea className="textarea school-notes" aria-label="作答草稿" value={value} disabled={!!busy}
            onChange={event => edit(event.target.value)} maxLength={8192}/>}
          <div className="school-editor-foot">
            {mysql && <div className="school-snippets">
              {question.starterSql && <button className="button secondary" disabled={!!busy || !!value.trim()} onClick={() => edit(question.starterSql)}>插入本题模板</button>}
              <select className="select" aria-label="插入常用 SQL" disabled={!!busy} value="" onChange={event => {
                if (event.target.value) edit(value + (value && !value.endsWith('\n') ? '\n' : '') + event.target.value);
              }}><option value="">插入常用 SQL…</option><option value={'SELECT 列名\nFROM 表名\nWHERE 条件;\n'}>SELECT / WHERE</option>
                <option value={'SELECT 分组列, COUNT(*)\nFROM 表名\nGROUP BY 分组列;\n'}>GROUP BY</option>
                <option value={'DELIMITER $$\nCREATE PROCEDURE 过程名()\nBEGIN\n    SELECT 1;\nEND$$\nDELIMITER ;\n'}>存储过程</option></select>
            </div>}
            {next && <button className="button secondary" disabled={!!busy} onClick={() => setSelected(next.id)}>下一题<ChevronRight size={15} aria-hidden="true"/></button>}
          </div>
        </section>
        {(complete || busy || error || notice || result || batch.length > 0) && <section className="school-pane school-results" aria-labelledby="school-results">
          <h2 id="school-results">{mysql ? '执行结果' : '作答状态'}</h2>
          {complete && <div className="school-completion" ref={completion}>
            <span className="school-completion-icon"><Check size={24} aria-hidden="true"/></span>
            <div>
              <h3 role="status">恭喜！你已完成本实验所有必做题目（{executed}/{required.length}）</h3>
              <p>实验数据与 SQL 作答已完整记录，可直接导出符合学校格式的实验报告。</p>
              <div className="school-actions">
                <button className="btn button primary" disabled={!!busy} onClick={openReport}>
                  <FileText size={16} aria-hidden="true"/>一键导出实验报告
                </button>
                {nextLab && !busy && <Link className="btn button secondary"
                  to={`/school/${encodeURIComponent(course.id)}/${encodeURIComponent(nextLab.id)}`}>
                  进入下一实验<ChevronRight size={16} aria-hidden="true"/>
                </Link>}
              </div>
            </div>
          </div>}
          {(busy || notice) && <p role="status">{busy || notice}</p>}
          {error && <p className="school-error-panel school-result-message" role="alert">{error}</p>}
          {batch.length > 0 && <div className="school-actions" aria-label="批量运行结果">{batch.map(id =>
            <button className="button secondary" key={id} onClick={() => setSelected(id)} aria-pressed={id === selected} disabled={!!busy}>
              {lab.questions.find(item => item.id === id)?.title} · {resultFor(id)?.status === 'ok' ? '成功' : resultFor(id) ? '有反馈' : '已编辑'}
            </button>)}</div>}
          {preview && <p>选区运行结果</p>}
          {result && <LabResult key={selected + ':' + resultRevision} result={result} database={details.database}/>}
        </section>}
      </div>
      {hasOriginalData && inspectorOpen && (
        <SchoolOriginalMaterials
          key={selected}
          lab={lab}
          question={question}
          isPanel
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </div>
    {lengthError && <div className="toast school-toast"><div className="alert school-error-panel" role="alert">每题最多 8192 字符，请缩短 SQL 后重试。</div></div>}
    {report && <ReportExportModal url={url + '/export'} student={details.student} onClose={() => setReport(false)}/>}
    {reset && <Modal open onOpenChange={open => setReset(open)} title="重置这门课的练习库"
      description="重置会清理课程预置库中的表和数据。自建数据库、SQL 草稿与历史结果会保留。">
      <div className="school-actions"><button className="button secondary" onClick={() => setReset(false)}>取消</button>
        <button className="button secondary" onClick={() => resetDatabase(true)}>重置为空库</button>
        <button className="button primary" onClick={() => resetDatabase(false)}>恢复预置数据</button></div>
    </Modal>}
  </div>;
}

function LabResult({result, database}: {result: RunResult; database: string | null}) {
  const rows = result.tables.reduce((count, table) => count + table.rows.length, 0);
  const rowSummary = result.tables.length ? ` · ${rows} 行数据`
    : (result.affectedRows ?? 0) > 0 ? ` · 影响 ${result.affectedRows} 行` : '';
  const deniedDatabase = /^ERROR 1044\b[^\r\n]*\bto database '([^']+)'/i.exec(result.message ?? '')?.[1];
  return <div className="school-result-content">
    {result.status === 'ok' ? <>
      <p className="school-result-ok" role="status"><Check size={16} aria-hidden="true"/>执行成功{rowSummary} ({result.elapsedMs}ms)</p>
      {result.message && <p className="school-result-message">{result.message}</p>}
    </> : <div className="alert school-error-panel school-result-message" role="alert">
      <div>{result.message || 'SQL 执行失败。'}</div>
      {database && deniedDatabase && deniedDatabase !== database && <div>
        请在对象浏览确认库名和权限。可用 <code>SHOW DATABASES;</code> 查看当前课程账号可见的库。
      </div>}
    </div>}
    {result.tables.map((table, index) => table.columns.length > 0 &&
      <WorkbenchResultGrid key={index} table={table} index={index}/>)}
  </div>;
}

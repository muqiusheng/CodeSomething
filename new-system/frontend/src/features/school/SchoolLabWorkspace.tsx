import {useScopedRead} from '../../hooks/useScopedRead';
import {refreshLearning} from '../../api/learning-api';
import {PageSkeleton} from '../../components/shared/LoadingState';
import {localState, sessionState} from '../../api/browser-state.mjs';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, Check, ChevronRight, Database, FileText, ListTree, PanelLeftClose, PanelLeftOpen, Play, RotateCcw, Save, ScanLine, TextQuote} from 'lucide-react';
import {Link, useParams} from 'react-router-dom';
import {CodeEditor, type CodeEditorHandle} from '../../components/code/CodeEditor';
import {Modal} from '../../components/ui/modal';
import {ReportExportModal} from './ReportExportModal';
import {QuestionSolution} from './QuestionSolution';
import {LabTablePreview} from './LabTablePreview';
import {SchoolOriginalMaterials} from './SchoolOriginalMaterials';
import {WorkbenchNavigator} from './WorkbenchNavigator';
import {WorkbenchResultGrid} from './WorkbenchResultGrid';
import {WorkbenchDebugResult} from './WorkbenchDebugResult';
import {splitStyle,useWorkbenchSplit,WorkbenchMenu,WorkbenchResizer,WorkbenchResults} from './WorkbenchControls';
import type {Debug} from './exams/exam-api';
import {ItemFeedback, questionHeading, QuestionTables, QuestionText} from './exams/ExamShared';
import {sqlErrorLine} from './exams/exam-state.mjs';
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
  const directoryKey = 'cs-school-lab-directory-open';
  const [directoryOpen, setDirectoryOpen] = useState(() => {
    try {return localState.getItem(directoryKey) === 'true';}
    catch {return false;}
  });
  const promptWidth = useWorkbenchSplit('lab-prompt', 28, 22, 49);
  const editorHeight = useWorkbenchSplit('lab-rows', 55, 25, 75);
  const activeDrafts = (scripts: Work['drafts'])=>Object.fromEntries(
    lab.questions.flatMap(({id})=>typeof scripts[id]==='string' ? [[id,scripts[id]]] : []));
  const [work, setWork] = useState(details.work);
  const [drafts, setDrafts] = useState(() => activeDrafts(recover(url, details.work)));
  const firstUnfinished = () => lab.questions.find(question => details.grading
    ? details.work.executions[question.id]?.grade?.status !== 'correct'
    : details.work.executions[question.id]?.result.status !== 'ok')?.id ?? lab.questions[0].id;
  const [selectedId, setSelected] = useState(firstUnfinished);
  const selected = lab.questions.some(question => question.id === selectedId) ? selectedId : firstUnfinished();
  const [busy, setBusy] = useState('');
  const active = useRef(false);
  const [resetFeedback, setResetFeedback] = useState<string>();
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
  const [labDebug, setLabDebug] = useState<{questionId:string; sql:string; mode:'run'|'selection'|'trace'; result:Debug}>();
  const [activeStep, setActiveStep] = useState(0);
  const [resultRevision, setResultRevision] = useState(0);
  const editor = useRef<CodeEditorHandle>(null);
  const [report, setReport] = useState(false);
  const [reset, setReset] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const question = lab.questions.find(item => item.id === selected)!;
  const prompt = questionHeading(question.requirement);
  const hasTableSpecs = prompt !== question.requirement;
  const value = drafts[selected] ?? '';
  const mysql = course.engine === 'mysql';
  const currentDrafts = activeDrafts(drafts);
  const dirty = JSON.stringify(currentDrafts) !== JSON.stringify(activeDrafts(work.drafts));
  const payload = {revision: work.revision, drafts: currentDrafts};
  const resultFor = (id: string) => {
    const execution = work.executions[id];
    return execution?.sql === drafts[id] ? execution?.result : undefined;
  };
  const debug = labDebug?.questionId === selected && labDebug.sql === value ? labDebug : undefined;
  const traceStep = debug?.mode==='trace' ? debug.result.steps[activeStep] : undefined;
  const preview = selectionRun?.questionId === selected && selectionRun.sql === value ? selectionRun.result : undefined;
  const gradeFor = (id: string) => {
    const grade = resultFor(id) ? work.executions[id]?.grade : undefined;
    const revision = lab.questions.find(item=>item.id===id)?.gradingRevision;
    return revision && grade?.question.id !== `${outline.id}-${id}-${revision}` ? undefined : grade;
  };
  const passed = (id: string) => details.grading ? gradeFor(id)?.status === 'correct' : resultFor(id)?.status === 'ok';
  const grade = !preview && !debug && resetFeedback !== selected ? gradeFor(selected) : undefined;
  const result = preview ?? (!details.grading ? resultFor(selected) : undefined);
  const required = lab.questions.filter(item => !item.optional);
  const executed = required.filter(item => passed(item.id)).length;
  const complete = mysql && required.length > 0 && executed === required.length;
  const percent = required.length ? Math.floor(executed * 100 / required.length) : 0;
  const labIndex = course.labs.findIndex(item => item.id === outline.id);
  const nextLab = labIndex >= 0 ? course.labs[labIndex + 1] : undefined;
  const feedback = useRef<HTMLElement>(null);
  useEffect(() => {
    if (feedback.current) feedback.current.scrollTop = 0;
  }, [selected, busy, resultRevision]);

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

  function run(all: boolean, selection = '') {
    const useSelection = Boolean(selection.trim());
    const previewSql = useSelection ? selection : null;
    void act(previewSql ? '试运行中…' : details.grading ? '判分中…' : '正在运行 SQL…', async () => {
      setResetFeedback(undefined);
      setSelectionRun(undefined);
      setLabDebug(undefined);
      const response = await schoolRequest<{work: Work; results: Record<string, RunResult>}>(url + (details.grading ? '/grade' : '/run'),
        {...payload, questionId: all ? null : selected, selection: previewSql, database,
          offset: useSelection ? (editor.current?.getSelectionStartLine() ?? 1)-1 : 0});
      const lastSuccess = Object.values(response.results).reverse().find(result => result.status === 'ok');
      if (!details.grading && lastSuccess) setDatabase(lastSuccess.database ?? '');
      if (!details.grading) setSchemaRevision(value => value + 1);
      setResultRevision(value => value + 1);
      if (previewSql) {
        setBatch([]);
        const result = response.results[selected];
        if (result) setSelectionRun({questionId: selected, sql: value, result});
        return;
      }
      applyWork(response.work);
      refreshLearning('school');
      if (Object.values(response.results).some(result=>result.status==='unavailable')) setError('隔离 MySQL 不可用，已保留作答，请稍后重试。');
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

  function debugSql(mode: 'run'|'selection'|'trace') {
    if (!details.grading) {
      const selection=editor.current?.getSelectedText() ?? '';
      if (selection.trim()) run(false, selection);
      else setError('请先在编辑器里选中要运行的 SQL。');
      return;
    }
    const sql = mode==='selection' ? editor.current?.getSelectedText() ?? '' : value;
    if (!sql.trim()) {
      setError(mode==='selection' ? '请先在编辑器里选中要运行的 SQL。' : '请先输入 SQL。');
      return;
    }
    const offset = mode==='selection' ? (editor.current?.getSelectionStartLine() ?? 1)-1 : 0;
    void act(mode==='trace' ? '正在跟踪 SQL…' : '试运行中…', async () => {
      setSelectionRun(undefined);
      setLabDebug(undefined);
      setBatch([]);
      const result = await schoolRequest<Debug>(url+'/questions/'+encodeURIComponent(selected)+'/debug',{sql,mode,offset});
      setActiveStep(Math.max(0,result.steps.length-1));
      setLabDebug({questionId:selected,sql:value,mode,result});
      setResultRevision(value=>value+1);
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
      setDatabase(details.database ?? '');
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

  const groups: {optional: boolean; offset: number; items: typeof lab.questions}[] = [];
  lab.questions.forEach((item, index) => {
    const previous = groups.at(-1);
    if (previous?.optional === !!item.optional) previous.items.push(item);
    else groups.push({optional: !!item.optional, offset: index, items: [item]});
  });
  const next = lab.questions[lab.questions.indexOf(question) + 1];
  const hasOriginalData = Boolean(
    question.originalText ||
    lab.originalNotes ||
    (lab.sourceTables && lab.sourceTables.length > 0) ||
    lab.fixtureSql
  );

  return <div className="page school-workspace school-practice-workspace">
    <header className="school-lab-heading">
      <Link to="/school" className="back-link"><ArrowLeft size={16} aria-hidden="true"/>{course.title}</Link>
      <h1>{outline.title}</h1>
      {mysql && <span className="badge school-badge">必做 {executed}/{required.length}</span>}
    </header>
    <div className="school-practice-grid" data-directory-open={directoryOpen}
      style={splitStyle({'prompt-size':promptWidth.value,'lab-code-size':100-promptWidth.value})}>
      <aside className="school-pane school-brief" aria-label="实验题目">
        <div className="school-outline-title">
          {directoryOpen && <h2>题目目录</h2>}
          <button type="button" className="btn btn-ghost school-directory-toggle"
            aria-expanded={directoryOpen} aria-controls="school-directory-questions"
            aria-label={directoryOpen ? '收起题目目录' : '展开题目目录'}
            title={directoryOpen ? '收起题目目录' : '展开题目目录'}
            onClick={()=>{
              setDirectoryOpen(!directoryOpen);
              try {localState.setItem(directoryKey, String(!directoryOpen));} catch { /* This tab retains the change. */ }
            }}>
            {directoryOpen ? <PanelLeftClose size={18} aria-hidden="true"/> : <PanelLeftOpen size={18} aria-hidden="true"/>}
          </button>
        </div>
        {directoryOpen && mysql && required.length > 0 && <div className="school-outline-progress">
          <progress className="progress progress-success" max={required.length} value={executed} aria-label="必做题进度"/>
          <span>{complete ? '已通关' : percent+'%'}</span>
        </div>}
        <div id="school-directory-questions">
          {groups.map(group=>{
            const label = group.optional ? '选做题' : '必做题';
            return <div className="school-question-group" key={group.offset}>
              {directoryOpen && <h3>{label}</h3>}
              <ol className="school-questions" aria-label={label} start={group.offset+1}>
                {group.items.map((item, index) => {
                  const outcome = resultFor(item.id);
                  const isPassed = passed(item.id);
                  const status = isPassed ? (details.grading ? '已通过' : '已运行') : gradeFor(item.id) ? '待订正' : outcome && !details.grading ? '有运行反馈' : drafts[item.id]?.trim() ? '有草稿' : '待作答';
                  const title = item.title + ' · ' + status;
                  const number = group.offset+index+1;
                  return <li key={item.id} data-passed={isPassed} data-optional={item.optional}>
                    <button type="button" aria-current={selected === item.id ? 'step' : undefined}
                      aria-label={number + ' ' + title} disabled={!!busy} onClick={() => setSelected(item.id)} title={title}>
                      <span className="badge badge-sm school-question-index">{number}</span>
                      {directoryOpen && <span className="school-question-label">{item.title}{item.optional &&
                        <small className="badge badge-sm school-optional">选做</small>}</span>}
                      {isPassed && <span className="school-question-status"><Check size={14} aria-hidden="true"/></span>}
                    </button>
                  </li>;
                })}
              </ol>
            </div>;
          })}
        </div>
      </aside>
      <section className="sql-practice-reference school-pane school-practice-prompt" aria-labelledby="school-question" tabIndex={0}
        key={selected}>
        <div className="school-question-header">
          <h2 id="school-question"><QuestionText text={question.title}/></h2>
          {next && <button type="button" className="btn btn-ghost sql-practice-quiet school-question-next" disabled={!!busy} onClick={() => setSelected(next.id)}>
            下一题<ChevronRight size={15} aria-hidden="true"/>
          </button>}
        </div>
        <p className="school-question-requirement"><QuestionText text={prompt}/></p>
        {hasTableSpecs && <div className="school-table-specs"><QuestionTables text={question.requirement}/></div>}
        {(question.hint || mysql && !details.grading) && <details className="school-hint"><summary>考点提示</summary>
          {question.hint && <p><QuestionText text={question.hint}/></p>}
          {mysql && !details.grading && <p>当前库 {database ? <code>{database}</code> : '未选择数据库'}</p>}
          {mysql && !details.grading && isConnectionTask(question) && <p>
            用 <code>SHOW DATABASES;</code> 列出可见数据库。在对象浏览新建或切换数据库，也可运行
            {' '}<code>CREATE DATABASE student_info;</code>，再用 <code>USE student_info;</code> 选中。
          </p>}
        </details>}
        {details.grading && !hasTableSpecs && <LabTablePreview url={url} question={question}/>}
        {details.grading && <QuestionSolution endpoint={url+'/questions/'+encodeURIComponent(selected)+'/solution'}
          value={value} onFill={edit} disabled={!!busy}/>}
        {hasOriginalData && <SchoolOriginalMaterials lab={lab} question={question} collapsed={!!details.grading}/>}
      </section>
      <WorkbenchResizer split={promptWidth} axis="x" label="调整实验题干与作答区宽度"/>
      <div className="school-practice-sql" style={splitStyle({'editor-size':editorHeight.value,'result-size':100-editorHeight.value})}>
        <div className="sql-practice-editor-card">
          {mysql ? <div className="sql-practice-editor" onKeyDownCapture={event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.repeat) {
              event.preventDefault(); event.stopPropagation();
              if (busy) return;
              if (event.shiftKey) debugSql('selection');
              else if (value.trim()) run(false, details.grading ? '' : editor.current?.getSelectedText() ?? '');
            }
          }}>
            <CodeEditor path={selected + '.sql'} value={value} onChange={edit} readOnly={!!busy} selectionRef={editor}
              sqlWorkbench wordWrap={false} errorLine={debug?.result.error?.line || (grade ? sqlErrorLine(grade) : undefined)}
              traceRange={traceStep?.status==='ok' ? {start:traceStep.startLine,end:traceStep.endLine} : undefined}/>
          </div> : <textarea className="textarea school-notes" aria-label="作答草稿" value={value} disabled={!!busy}
            onChange={event => edit(event.target.value)} maxLength={8192}/>}
          <div className="sql-practice-tools">
            {mysql && <button type="button" className="btn btn-primary sql-practice-run" disabled={!!busy || !value.trim()}
              aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => run(false)}>
              <Play aria-hidden="true" size={15}/>{busy === '判分中…' ? busy : details.grading ? '运行并判分' : '运行当前题'}
              {busy !== '判分中…' && <kbd aria-hidden="true">Ctrl+Enter</kbd>}
            </button>}
            {details.grading &&
              <button type="button" className="btn btn-outline sql-practice-trial" disabled={!!busy || !value.trim()}
                onClick={() => debugSql(editor.current?.getSelectedText()?.trim() ? 'selection' : 'run')}>
                {busy === '试运行中…' ? busy : '试运行'}
              </button>}
            <div className="sql-practice-utilities">
              {details.grading && <button type="button" className="btn btn-ghost sql-practice-quiet sql-practice-reset" disabled={!!busy} onClick={() => {
                setSelectionRun(undefined); setLabDebug(undefined); setResetFeedback(selected); setError('');
                setNotice('本题已恢复初始数据，SQL 草稿已保留。');
                if (feedback.current) feedback.current.scrollTop = 0;
              }}><RotateCcw aria-hidden="true" size={15}/>重置本题数据</button>}
              <WorkbenchMenu>
                {mysql && <button type="button" disabled={!!busy} aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
                  onClick={()=>debugSql('selection')}><ScanLine size={15} aria-hidden="true"/>运行选中代码 <kbd aria-hidden="true">Ctrl+Shift+Enter</kbd></button>}
                {details.grading && <button type="button" disabled={!!busy || !value.trim()}
                  onClick={()=>debugSql('trace')}><ListTree size={15} aria-hidden="true"/>单步跟踪</button>}
                {mysql && <hr/>}
                <button type="button" disabled={!!busy} aria-label={dirty ? '保存（有未保存修改）' : '保存'}
                  onClick={() => void act('正在保存…', save)}><Save size={14} aria-hidden="true"/>保存草稿
                  {dirty && <span className="school-dirty-dot" aria-hidden="true"/>}
                </button>
                {mysql && <button type="button" disabled={!!busy || !value.trim()} onClick={formatSql}>
                  <TextQuote size={14} aria-hidden="true"/>格式化 SQL
                </button>}
                {mysql && question.starterSql && <button type="button" disabled={!!busy || !!value.trim()}
                  onClick={() => edit(question.starterSql)}>插入本题模板</button>}
                {mysql && <button type="button" disabled={!!busy} onClick={() => setObjectsOpen(true)}>
                  <Database size={14} aria-hidden="true"/>浏览课程练习库
                </button>}
                {mysql && !details.grading && <>
                  <button type="button" disabled={!!busy || !Object.values(drafts).some(text => text.trim())} onClick={() => run(true)}>运行全部</button>
                  <button type="button" disabled={!!busy} onClick={() => setReset(true)}>重置练习库</button>
                </>}
                <button type="button" disabled={!!busy} onClick={openReport}><FileText size={14} aria-hidden="true"/>导出实验报告</button>
              </WorkbenchMenu>
            </div>
          </div>
        </div>
        <WorkbenchResizer split={editorHeight} axis="y" label="调整编辑器与结果区高度"/>
        <WorkbenchResults scrollRef={feedback} className="school-results"
          title={details.grading ? '运行与判分结果' : mysql ? '执行结果' : '作答状态'}>
          {!busy && !notice && !error && !grade && !result && !debug && batch.length === 0 &&
            <p>在编辑器中作答后，这里会显示{details.grading ? '判分与结果。' : '运行或保存状态。'}</p>}
          {(busy || notice) && <p role="status">{busy || notice}</p>}
          {error && <p className="school-error-panel school-result-message" role="alert">{error}</p>}
          {batch.length > 0 && <div className="school-actions" aria-label="批量运行结果">{batch.map(id =>
            <button className="button secondary" key={id} onClick={() => setSelected(id)} aria-pressed={id === selected} disabled={!!busy}>
              {lab.questions.find(item => item.id === id)?.title} · {resultFor(id)?.status === 'ok' ? '成功' : resultFor(id) ? '有反馈' : '已编辑'}
            </button>)}</div>}
          {(preview || debug?.mode==='selection') && <p>选中代码执行结果</p>}
          {debug && <WorkbenchDebugResult result={debug.result} trace={debug.mode==='trace'}
            active={activeStep} setActive={setActiveStep}/>}
          {grade && !busy && <ItemFeedback key={selected + ':' + resultRevision} item={grade} compact/>}
          {result && <LabResult key={selected + ':' + resultRevision} result={result} database={details.database}/>}
          {complete && <div className="school-completion">
            <span className="school-completion-icon"><Check size={20} aria-hidden="true"/></span>
            <div>
              <h3 role="status">已完成全部必做题（{executed}/{required.length}）</h3>
              <div className="school-actions">
                {nextLab && !busy && <Link className="btn button secondary"
                  to={`/school/${encodeURIComponent(course.id)}/${encodeURIComponent(nextLab.id)}`}>
                  进入下一实验<ChevronRight size={16} aria-hidden="true"/>
                </Link>}
              </div>
            </div>
          </div>}
        </WorkbenchResults>
      </div>
    </div>
    {objectsOpen && <Modal open onOpenChange={setObjectsOpen} title="课程练习库"
      description="这里的对象独立于每题判分使用的初始数据。" className="school-objects-modal">
      <WorkbenchNavigator courseId={course.id} revision={schemaRevision}
        database={database} onDatabaseChange={setDatabase} busy={!!busy}/>
      {details.grading && <div className="school-actions"><button type="button" className="btn button secondary" disabled={!!busy}
        onClick={() => {setObjectsOpen(false); setReset(true);}}>管理课程练习库数据</button></div>}
    </Modal>}
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

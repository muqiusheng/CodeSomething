import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChevronDown,Play,RotateCcw} from 'lucide-react';
import {debugRunMode,sqlErrorLine} from './exam-state.mjs';
import {CodeEditor,type CodeEditorHandle} from '../../../components/code/CodeEditor';
import {Modal} from '../../../components/ui/modal';
import {WorkbenchResultGrid} from '../WorkbenchResultGrid';
import {errorMessage,schoolRequest} from '../school-api';
import {type Debug,type Item,type Question} from './exam-api';
import {ItemFeedback,QuestionTables} from './ExamShared';

type Props = {question:Question; answer:string[]; onAnswer:(value:string[])=>void; endpoint:string;
  allowCheck:boolean; disabled?:boolean; onChecked?:(item:Item)=>void; session?:QuestionSession;
  prompt?:ReactNode; onNavigate?:(direction:-1|1)=>void;
  onSessionChange?:(update:(previous:QuestionSession)=>QuestionSession)=>void};

type DebugMode = 'run'|'selection'|'trace'|'explain'|'schema'|'reset';
export type QuestionSession = {
  checked?:{key:string;item:Item};
  debug?:{mode:DebugMode; result:Debug; source:string};
  preview?:Debug;
  active?:number;
};

export function ExamQuestion({question,answer,onAnswer,endpoint,allowCheck,disabled,onChecked,session,onSessionChange,prompt,onNavigate}:Props) {
  const editorId=useId();
  const hasReference = Boolean(prompt) || question.prompt.includes('\n\n### 涉及数据表：');
  const [local,setLocal] = useState<QuestionSession>({});
  const displayed=session??local, update=onSessionChange??setLocal;
  const {checked}=displayed;
  const [checking,setChecking] = useState(false);
  const [error,setError] = useState('');
  const key = JSON.stringify(answer);
  const options = question.kind==='boolean' ? [{id:'true',text:'对'},{id:'false',text:'错'}] : question.options;
  const checkingRef = useRef(false);
  async function check() {
    if (checkingRef.current || disabled) return;
    checkingRef.current=true;
    setChecking(true);
    setError('');
    try {
      const item = await schoolRequest<Item>(endpoint+'/check',{answer,mode:'check',offset:0});
      update(previous=>({...previous,checked:{key,item},debug:question.kind==='sql'?undefined:previous.debug}));
      onChecked?.(item);
    } catch (error) {setError(errorMessage(error));}
    finally {checkingRef.current=false;setChecking(false);}
  }
  const feedback = <>
    {error && <p className="note" role="alert">{error}</p>}
    {checked && (question.kind==='sql'||checked.key===key) && <>
      {checked.key!==key && <p className="exam-stale" role="status">代码已修改，判分结果可能已过时</p>}
      <ItemFeedback key={checked.key+':'+checked.item.score+':'+checked.item.status} item={checked.item}/>
    </>}
  </>;

  useEffect(()=>{
    if (!onNavigate || question.kind==='sql' || disabled) return;
    function shortcut(event:KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey ||
          document.querySelector('.modal-content,[role="dialog"][open]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('textarea,select,[contenteditable],input:not([type="radio"])')) return;
      if (event.altKey) {
        if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
        event.preventDefault();
        onNavigate?.(event.key==='ArrowLeft'?-1:1);
        return;
      }
      if (event.key==='Enter' && !event.shiftKey) {
        if (target?.closest('button,a,summary')) return;
        event.preventDefault();
        if (checking) return;
        if (allowCheck && checked?.key!==key) void check();
        else onNavigate?.(1);
        return;
      }
      if (question.kind==='blank') return;
      const index = /^[a-f]$/i.test(event.key) ? event.key.toLowerCase().charCodeAt(0)-97
        : /^[1-6]$/.test(event.key) ? Number(event.key)-1 : -1;
      const option = options[index];
      if (!option) return;
      event.preventDefault();
      onAnswer([option.id]);
    }
    window.addEventListener('keydown',shortcut);
    return ()=>window.removeEventListener('keydown',shortcut);
  });

  return <>
    {question.kind==='sql'
      ? <div className="exam-sql-workspace">
        {hasReference && <section className="sql-practice-reference" aria-label="题目与数据" tabIndex={0}>
          {prompt}
          <QuestionTables text={question.prompt}/>
        </section>}
        <ExamSqlPanel editorId={editorId} value={answer[0]??''} onChange={value=>onAnswer([value])} endpoint={endpoint} disabled={disabled}
          state={displayed} update={update} checking={checking} onCheck={allowCheck?check:undefined} feedback={feedback} checkError={error}/></div>
      : <fieldset className="exam-answer" disabled={disabled}>
        <legend>{question.kind==='blank'?'补全 SQL':'作答选项'}</legend>
        {question.kind==='blank' ? <div className="exam-blank-template" aria-label="SQL 填空模板">
          {(question.template??'').split(/(\{\{\d+\}\})/).map((part,segment)=>{
            const match=part.match(/^\{\{(\d+)\}\}$/);
            if (!match) return <span key={segment}>{part}</span>;
            const index=Number(match[1])-1;
            return <label key={segment} className="exam-blank-inline">
              <span className="exam-blank-marker" aria-hidden="true">{index+1}</span>
              <input aria-label={'空位 '+(index+1)} className="input exam-blank-input" name={question.id+'-blank-'+(index+1)}
                autoComplete="off" spellCheck={false} value={answer[index]??''} maxLength={512}
                size={Math.max(7,Math.min(28,(answer[index]?.length??0)+2))}
                onChange={event=>onAnswer(Array.from({length:question.blankCount},(_,i)=>i===index?event.target.value:answer[i]??''))}/>
            </label>;
          })}
        </div> : <div className="exam-options">{options.map((option,i)=><label className="exam-option" key={option.id}>
          <input type="radio" className="radio radio-sm" name={question.id} checked={answer[0]===option.id}
            onChange={()=>onAnswer([option.id])}/>
          <span>{question.kind==='choice' && <strong>{String.fromCharCode(65+i)}. </strong>}{option.text}</span>
        </label>)}</div>}
      </fieldset>}
    {allowCheck && question.kind!=='sql' && <div className="exam-actions exam-self-check">
      <button type="button" className="button secondary" disabled={checking||disabled} onClick={()=>void check()}>
        {checking?'核对中…':'核对答案与解析'}
      </button>
    </div>}
    {question.kind!=='sql' && feedback}
  </>;
}

function ExamSqlPanel({editorId,value,onChange,endpoint,disabled,state,update,checking,onCheck,feedback,checkError}:{
  editorId:string;value:string;onChange:(value:string)=>void;endpoint:string;disabled?:boolean;state:QuestionSession;
  update:(change:(previous:QuestionSession)=>QuestionSession)=>void;checking:boolean;onCheck?:()=>Promise<void>;feedback:ReactNode;checkError:string;
}) {
  const editor = useRef<CodeEditorHandle>(null);
  const results = useRef<HTMLElement>(null);
  const [showSchema,setShowSchema] = useState(false);
  const [clearEditor,setClearEditor] = useState(false);
  const [pending,setPending] = useState<DebugMode>();
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const {debug,preview,active=0} = state;
  const stale=debug && debug.source!==value;
  const checkedStale=!!state.checked && state.checked.key!==JSON.stringify([value]);
  const editorErrorLine=(!stale && debug?.result.error?.line ? debug.result.error.line : undefined)
    ?? (!checkedStale && state.checked ? sqlErrorLine(state.checked.item) : undefined);
  const steps = debug?.result.steps ?? [];
  const step = debug?.mode==='trace' ? steps[active] : undefined;
  const blocked=!!pending||checking||disabled;

  function grade() {
    if (blocked || !onCheck) return;
    setError('');setNotice('');
    if (results.current) results.current.scrollTop=0;
    if (!value.trim()) {setError('请先输入 SQL。');return;}
    void onCheck();
  }

  async function run(mode:DebugMode) {
    if (blocked) return;
    if (results.current) results.current.scrollTop=0;
    if (mode==='schema') {
      setShowSchema(true);
      if (preview) return;
    }
    const selection = editor.current?.getSelectedText()??'';
    if (mode==='selection' && !selection.trim()) {setError('请先在编辑器里选中要运行的 SQL。');return;}
    const usesSelection = (mode==='selection'||mode==='explain') && !!selection.trim();
    const sql = usesSelection ? selection : value;
    if (mode!=='schema' && mode!=='reset' && !sql.trim()) {setError('请先输入 SQL。');return;}
    setPending(mode);
    setNotice('');
    setError('');
    try {
      const result = await schoolRequest<Debug>(endpoint+'/debug',{
        answer:[mode==='schema'||mode==='reset'?'':sql],mode,
        offset:usesSelection ? (editor.current?.getSelectionStartLine()??1)-1 : 0,
      });
      if (mode==='reset') {
        if (result.status!=='ok') throw new Error(result.error?.raw || '沙箱重置失败。');
        update(()=>({}));
        setNotice('已恢复本题初始沙箱数据，SQL 草稿已保留。');
      } else if (mode==='schema') {
        if (result.error) setError(result.error.advice+' '+result.error.raw);
        else update(previous=>({...previous,preview:result}));
      } else {
        update(previous=>({...previous,debug:{mode,result,source:value},active:Math.max(0,result.steps.length-1),checked:undefined}));
      }
    } catch (error) {setError(errorMessage(error));}
    finally {setPending(undefined);}
  }

  function clearResults() {
    update(previous=>({...previous,debug:undefined,checked:undefined,active:0}));
    setError('');
  }

  function setActive(active:number) {update(previous=>({...previous,active}));}

  return <div className="exam-debug" id={editorId} tabIndex={-1}>
    <div className="sql-practice-editor" onKeyDownCapture={event=>{
      if ((event.ctrlKey||event.metaKey) && event.key==='Enter' && !event.repeat) {
        event.preventDefault();event.stopPropagation();
        if (onCheck) grade(); else void run(debugRunMode(editor.current?.getSelectedText()));
      }
    }}>
      <CodeEditor path={endpoint.split('/').at(-1)+'.sql'} value={value} onChange={onChange} readOnly={disabled}
        selectionRef={editor} errorLine={editorErrorLine} wordWrap={false}
        traceRange={!stale && step?.status==='ok' ? {start:step.startLine,end:step.endLine} : undefined}/>
    </div>
    <div className="exam-actions exam-debug-tools sql-practice-tools">
      {onCheck && <button type="button" className="btn button sql-practice-run" aria-keyshortcuts="Control+Enter Meta+Enter"
        disabled={blocked} onClick={grade}><Play size={14} aria-hidden="true"/>{checking?'判分中…':'运行并判分'}
        {!checking && <kbd aria-hidden="true">Ctrl+Enter</kbd>}</button>}
      <button type="button" className={onCheck?'btn button secondary':'btn button sql-practice-run'} disabled={blocked}
        onClick={()=>void run('run')}><span>{pending==='run'?'运行中…':'试运行'}</span>{!onCheck && <kbd aria-hidden="true">Ctrl+Enter</kbd>}</button>
      <button type="button" className="btn button secondary" disabled={blocked} onClick={()=>void run('reset')}>
        <RotateCcw size={14} aria-hidden="true"/>重置本题数据
      </button>
      <details className="exam-debug-more dropdown dropdown-end" onBlur={event=>{
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open=false;
      }} onKeyDown={event=>{
        if (event.key!=='Escape' || !event.currentTarget.open) return;
        event.currentTarget.open=false;
        event.currentTarget.querySelector('summary')?.focus();
      }}>
        <summary className="btn button secondary">更多 <ChevronDown size={14} aria-hidden="true"/></summary>
        <div className="exam-debug-menu dropdown-content" onClick={event=>{
          if (event.target instanceof HTMLButtonElement && !event.target.disabled) {
            const menu=event.currentTarget.closest('details');
            if (menu) {menu.open=false;menu.querySelector('summary')?.focus();}
          }
        }}>
          <button type="button" disabled={blocked} onClick={()=>void run('trace')}>单步跟踪</button>
          <button type="button" disabled={blocked} onClick={()=>void run('selection')}>运行选中片段</button>
          <button type="button" disabled={blocked} onClick={()=>void run('schema')}>完整建表 DDL</button>
          <button type="button" disabled={blocked} onClick={()=>void run('explain')}>查看 EXPLAIN</button>
          <button type="button" disabled={blocked || (!debug && !state.checked)} onClick={clearResults}>清空结果</button>
          <button type="button" disabled={blocked || !value} onClick={()=>setClearEditor(true)}>清空编辑器</button>
        </div>
      </details>
    </div>
    {clearEditor && <Modal open={clearEditor} onOpenChange={setClearEditor} title="清空 SQL 编辑器？" description="当前题的代码与运行结果将清空。">
      <div className="exam-actions">
        <button type="button" className="button secondary" onClick={()=>setClearEditor(false)}>保留代码</button>
        <button type="button" className="button danger" onClick={()=>{onChange('');clearResults();setClearEditor(false);}}>确认清空</button>
      </div>
    </Modal>}
    <section className="sql-practice-results" ref={results} aria-label="SQL 结果" tabIndex={0}>
    <h3>{onCheck?'运行与判分结果':'执行结果'}</h3>
    {!checking && !pending && !notice && !error && !checkError && !debug && !state.checked &&
      <p className="exam-muted">输入 SQL 后{onCheck?'运行并判分':'试运行'}，在此查看结果。</p>}
    {checking && <p role="status">判分中…</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && pending!=='schema' && <p role="status">正在运行隔离 MySQL…</p>}
    {error && !showSchema && <p className="note" role="alert">{error}</p>}
    {stale && <p className="exam-stale" role="status">代码已修改，调试结果可能已过时</p>}
    {debug?.result.error && <div className="exam-feedback" role="alert">
      <strong>{debug.result.error.line>0?'第 '+debug.result.error.line+' 行':'SQL 运行反馈'}</strong>
      <p>{debug.result.error.advice}</p><pre>{debug.result.error.raw}</pre>
    </div>}
    {debug && !debug.result.error && <p role="status">已运行 · {debug.result.elapsedMs} ms</p>}
    {step && <div className="exam-trace-picker">
      <button type="button" className="button secondary" disabled={active===0} onClick={()=>setActive(active-1)}>上一步</button>
      <label>执行轨迹<select className="select exam-input" name="trace-step" value={active} onChange={event=>setActive(Number(event.target.value))}>
        {steps.map((item,i)=><option key={i} value={i}>{i+1}. 第 {item.startLine}–{item.endLine} 行 {item.status==='ok'?'成功':'出错'}</option>)}
      </select></label>
      <button type="button" className="button secondary" disabled={active===steps.length-1} onClick={()=>setActive(active+1)}>下一步</button>
    </div>}
    {(step ? [step] : steps).map((item,index)=>
      <div className="exam-debug-result" key={item.startLine+'-'+(step?active:index)+'-'+item.summary}>
        <p><strong>第 {item.startLine}–{item.endLine} 行</strong> · {item.status==='ok'?'成功':'出错'}
          {item.elapsedMs!==null && ' · '+item.elapsedMs+' ms'}{item.affectedRows!==null && ' · 影响 '+item.affectedRows+' 行'}</p>
        <pre>{item.summary}</pre>
        {item.changes.length>0 && <ul aria-label="表数据变化">
          {item.changes.map(change=>{
            const before=change.before.split(' · ')[0], after=change.after.split(' · ')[0];
            return <li key={change.table}><code>{change.table}</code>　{before} → {after}{before===after && ' · 数据或结构变化'}
              {!!change.preview?.rows.length && <details className="exam-change-preview"><summary>查看变更后数据</summary>
                <WorkbenchResultGrid table={change.preview} index={0}/>
              </details>}</li>;
          })}
        </ul>}
        {item.tables.map((table,i)=><WorkbenchResultGrid key={i} table={table} index={i}/>)}
      </div>)}
    {(!debug || checking || checkError) && feedback}
    </section>
    {showSchema && <Modal open={showSchema} onOpenChange={setShowSchema} title="完整建表 DDL"
      description="预览当前题初始化后的数据表、视图与约束" className="exam-schema-modal">
      {pending==='schema' ? <p role="status">正在读取种子数据…</p>
        : preview?.error ? <p role="alert">{preview.error.advice} {preview.error.raw}</p>
        : error ? <p role="alert">{error}</p>
        : preview?.steps.map((item,i)=><details key={i} open={i===0}>
          <summary>{item.summary.replace('SELECT * FROM ','数据 · ').replace(/SHOW CREATE (TABLE|VIEW) /,'结构 · ')}</summary>
          {item.tables.map((table,j)=>table.columns.some(column=>column==='Create Table'||column==='Create View')
            ? <pre key={j}>{table.rows[0]?.[1]}</pre> : <WorkbenchResultGrid key={j} table={table} index={j}/>)}
        </details>)}
    </Modal>}
  </div>;
}

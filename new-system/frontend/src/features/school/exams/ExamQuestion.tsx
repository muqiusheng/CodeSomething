import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {CodeXml, ListTree, Play, RotateCcw, ScanLine, Table2, Trash2} from 'lucide-react';
import {debugRunMode,sqlErrorLine} from './exam-state.mjs';
import {CodeEditor,type CodeEditorHandle} from '../../../components/code/CodeEditor';
import {Modal} from '../../../components/ui/modal';
import {WorkbenchResultGrid} from '../WorkbenchResultGrid';
import {errorMessage,schoolRequest} from '../school-api';
import {type Debug,type Item,type Question} from './exam-api';
import {BlankTableFields,ItemFeedback,QuestionTables,QuestionText} from './ExamShared';
import {splitStyle,useWorkbenchSplit,WorkbenchMenu,WorkbenchResizer,WorkbenchResults} from '../WorkbenchControls';
import {QuestionSolution} from '../QuestionSolution';
import {WorkbenchDebugResult} from '../WorkbenchDebugResult';

type Props = {question:Question; answer:string[]; onAnswer:(value:string[])=>void; endpoint:string;
  allowCheck:boolean; allowSolution?:boolean; disabled?:boolean; onChecked?:(item:Item)=>void; session?:QuestionSession;
  prompt?:ReactNode; onNavigate?:(direction:-1|1)=>void;
  onSessionChange?:(update:(previous:QuestionSession)=>QuestionSession)=>void};

type DebugMode = 'run'|'selection'|'trace'|'explain'|'schema'|'reset';
export type QuestionSession = {
  checked?:{key:string;item:Item};
  debug?:{mode:DebugMode; result:Debug; source:string};
  preview?:Debug;
  active?:number;
};

export function ExamQuestion({question,answer,onAnswer,endpoint,allowCheck,allowSolution,disabled,onChecked,session,onSessionChange,prompt,onNavigate}:Props) {
  const editorId=useId();
  const columns=useWorkbenchSplit('exam-columns',42,25,65);
  const hasReference = Boolean(prompt) || !!allowSolution || question.prompt.includes('\n\n### 涉及数据表：');
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
      <ItemFeedback key={checked.key+':'+checked.item.score+':'+checked.item.status} item={checked.item} compact={question.kind==='sql'}
        solution={question.kind==='sql' && allowSolution ? {endpoint:endpoint+'/solution',
          value:answer[0],onFill:sql=>onAnswer([sql]),disabled:disabled || checking} : undefined}/>
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

  const solution = allowSolution && <QuestionSolution key={endpoint} endpoint={endpoint+'/solution'}
    options={question.kind==='choice' ? options : undefined}
    value={answer[0]} onFill={question.kind==='sql' ? sql=>onAnswer([sql]) : undefined}
    disabled={disabled || checking}/>;

  return <>
    {question.kind==='sql'
      ? <div className="exam-sql-workspace" style={splitStyle({'exam-reference':columns.value,'exam-code-size':100-columns.value})}>
        {hasReference && <section className="sql-practice-reference" aria-label="题目与数据" tabIndex={0}>
          {prompt}
          <QuestionTables key={question.id} text={question.prompt}/>
          {solution}
        </section>}
        {hasReference && <WorkbenchResizer split={columns} axis="x" label="调整题干与作答区宽度"/>}
        <ExamSqlPanel editorId={editorId} value={answer[0]??''} onChange={value=>onAnswer([value])} endpoint={endpoint} disabled={disabled}
          state={displayed} update={update} checking={checking} onCheck={allowCheck?check:undefined} feedback={feedback} checkError={error}/></div>
      : <fieldset className="exam-answer" disabled={disabled}>
        <legend className="sr-only">{question.kind==='blank'?'补全 SQL':'作答选项'}</legend>
        {question.kind==='blank' ? <div className="exam-blank-template" aria-label="SQL 填空模板">
          {(question.template??'').split(/(\{\{\d+\}\})/).map((part,segment)=>{
            const match=part.match(/^\{\{(\d+)\}\}$/);
            if (!match) return <span key={segment}>{part}</span>;
            const index=Number(match[1])-1;
            return <label key={segment} className="exam-blank-inline">
              <input aria-label={'空位 '+(index+1)} className="input exam-blank-input" name={question.id+'-blank-'+(index+1)}
                autoComplete="off" spellCheck={false} value={answer[index]??''} maxLength={512}
                size={Math.max(7,Math.min(28,(answer[index]?.length??0)+2))}
                onChange={event=>onAnswer(Array.from({length:question.blankCount},(_,i)=>i===index?event.target.value:answer[i]??''))}/>
            </label>;
          })}
        </div> : <div className="exam-options">{options.map((option,i)=><label className="exam-option" key={option.id}>
          <input type="radio" className="radio radio-sm" name={question.id} checked={answer[0]===option.id}
            onChange={()=>onAnswer([option.id])}/>
          <span>{question.kind==='choice' && <strong>{String.fromCharCode(65+i)}. </strong>}<QuestionText text={option.text}/></span>
        </label>)}</div>}
      </fieldset>}
    {question.kind==='blank' && <BlankTableFields text={question.prompt+' '+(question.template??'')}/>}
    {allowCheck && question.kind!=='sql' && <div className="exam-actions exam-self-check">
      <button type="button" className="button secondary" disabled={checking||disabled} onClick={()=>void check()}>
        {checking?'核对中…':'核对答案与解析'}
      </button>
    </div>}
    {question.kind!=='sql' && solution}
    {question.kind!=='sql' && feedback}
  </>;
}

function ExamSqlPanel({editorId,value,onChange,endpoint,disabled,state,update,checking,onCheck,feedback,checkError}:{
  editorId:string;value:string;onChange:(value:string)=>void;endpoint:string;disabled?:boolean;state:QuestionSession;
  update:(change:(previous:QuestionSession)=>QuestionSession)=>void;checking:boolean;onCheck?:()=>Promise<void>;feedback:ReactNode;checkError:string;
}) {
  const editor = useRef<CodeEditorHandle>(null);
  const rows=useWorkbenchSplit('exam-rows',55,25,75);
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

  return <div className="exam-debug" style={splitStyle({'editor-size':rows.value,'result-size':100-rows.value})} id={editorId} tabIndex={-1}>
    <div className="sql-practice-editor-card">
      <div className="sql-practice-editor" onKeyDownCapture={event=>{
        if ((event.ctrlKey||event.metaKey) && event.key==='Enter' && !event.repeat) {
          event.preventDefault();event.stopPropagation();
          if (event.shiftKey) void run('selection');
          else if (onCheck) grade(); else void run(debugRunMode(editor.current?.getSelectedText()));
        }
      }}>
        <CodeEditor path={endpoint.split('/').at(-1)+'.sql'} value={value} onChange={onChange} readOnly={disabled}
          selectionRef={editor} errorLine={editorErrorLine} sqlWorkbench wordWrap={false}
          traceRange={!stale && step?.status==='ok' ? {start:step.startLine,end:step.endLine} : undefined}/>
      </div>
      <div className="exam-debug-tools sql-practice-tools">
        {onCheck && <button type="button" className="btn btn-primary sql-practice-run" aria-keyshortcuts="Control+Enter Meta+Enter"
          disabled={blocked} onClick={grade}><Play size={14} aria-hidden="true"/>{checking?'判分中…':'运行并判分'}
          {!checking && <kbd aria-hidden="true">Ctrl+Enter</kbd>}</button>}
        <button type="button" className={onCheck?'btn btn-outline sql-practice-trial':'btn btn-primary sql-practice-run'} disabled={blocked}
          onClick={()=>void run('run')}><span>{pending==='run'?'运行中…':'试运行'}</span>{!onCheck && <kbd aria-hidden="true">Ctrl+Enter</kbd>}</button>
        <div className="sql-practice-utilities">
          <button type="button" className="btn btn-ghost sql-practice-quiet sql-practice-reset" disabled={blocked} onClick={()=>void run('reset')}>
            <RotateCcw size={14} aria-hidden="true"/>重置本题数据
          </button>
          <WorkbenchMenu>
            <button type="button" disabled={blocked} aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
              onClick={()=>void run('selection')}><ScanLine size={15} aria-hidden="true"/>运行选中代码 <kbd aria-hidden="true">Ctrl+Shift+Enter</kbd></button>
            <button type="button" disabled={blocked} onClick={()=>void run('trace')}><ListTree size={15} aria-hidden="true"/>单步跟踪</button>
            <hr/>
            <button type="button" disabled={blocked} onClick={()=>void run('schema')}><Table2 size={15} aria-hidden="true"/>完整建表 DDL</button>
            <button type="button" disabled={blocked} onClick={()=>void run('explain')}><CodeXml size={15} aria-hidden="true"/>查看 EXPLAIN</button>
            <hr/>
            <button type="button" disabled={blocked || (!debug && !state.checked)} onClick={clearResults}><Trash2 size={15} aria-hidden="true"/>清空结果</button>
            <button type="button" disabled={blocked || !value} onClick={()=>setClearEditor(true)}><Trash2 size={15} aria-hidden="true"/>清空编辑器</button>
          </WorkbenchMenu>
        </div>
      </div>
    </div>
    {clearEditor && <Modal open={clearEditor} onOpenChange={setClearEditor} title="清空 SQL 编辑器？" description="当前题的代码与运行结果将清空。">
      <div className="exam-actions">
        <button type="button" className="button secondary" onClick={()=>setClearEditor(false)}>保留代码</button>
        <button type="button" className="button danger" onClick={()=>{onChange('');clearResults();setClearEditor(false);}}>确认清空</button>
      </div>
    </Modal>}
    <WorkbenchResizer split={rows} axis="y" label="调整编辑器与结果区高度"/>
    <WorkbenchResults scrollRef={results} title="运行与判分结果">
    {!checking && !pending && !notice && !error && !checkError && !debug && !state.checked &&
      <p className="exam-muted">输入 SQL 后{onCheck?'运行并判分':'试运行'}，在此查看结果。</p>}
    {checking && <p role="status">判分中…</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && pending!=='schema' && <p role="status">正在运行隔离 MySQL…</p>}
    {error && !showSchema && <p className="note" role="alert">{error}</p>}
    {stale && <p className="exam-stale" role="status">代码已修改，调试结果可能已过时</p>}
    {debug && <WorkbenchDebugResult result={debug.result} trace={debug.mode==='trace'} active={active} setActive={setActive}/>}
    {(!debug || checking || checkError) && feedback}
    </WorkbenchResults>
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

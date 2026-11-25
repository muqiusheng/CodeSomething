import type {Debug} from './exams/exam-api';
import {WorkbenchResultGrid} from './WorkbenchResultGrid';

export function WorkbenchDebugResult({result, trace, active, setActive}: {
  result: Debug; trace: boolean; active: number; setActive: (index: number)=>void;
}) {
  const steps = result.steps;
  const step = trace ? steps[active] : undefined;
  return <>
    {result.error && <div className="exam-feedback" role="alert">
      <strong>{result.error.line>0?'第 '+result.error.line+' 行':'SQL 运行反馈'}</strong>
      <p>{result.error.advice}</p><pre>{result.error.raw}</pre>
    </div>}
    {!result.error && <p role="status">已运行 · {result.elapsedMs} ms</p>}
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
  </>;
}

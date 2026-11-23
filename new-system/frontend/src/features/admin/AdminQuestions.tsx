import {InlineSpinner} from '../../components/shared/LoadingState';
import {useState, type FormEvent} from 'react';
import {adminWrite, query, type Page} from '../../api/admin-api';
import {Modal} from '../../components/ui/modal';
import {DataState, Pager, TableFrame, message, useAdminData, useAdminFilters} from './admin-controls';
import {questionTopics} from '../reviews/SupplementalPractice';

type Question = {
  id: string; topic: string; prompt: string; options: string[]; answer: number; explanation: string; status: string; revision: number;
};
const states = {draft:'草稿',published:'已发布',archived:'已归档'};
const blank: Question = {id:'',topic:'http',prompt:'',options:['','','',''],answer:0,explanation:'',status:'draft',revision:0};

export function AdminQuestions() {
  const {filters, applied, page, setPage, setFilter, apply} = useAdminFilters({topic:'',status:'',keyword:''});
  const [editing,setEditing] = useState<Question | null>(null);
  const [notice,setNotice] = useState('');
  const entries = useAdminData<Page<Question>>('/questions'+query({page,...applied}));
  return <>
    <div className="admin-heading"><h1>题库</h1><button className="csx-btn csx-btn-primary" type="button" onClick={() => setEditing(blank)}>创建题目</button></div>
    <section className="admin-card">
      <form className="admin-form" onSubmit={event=>{event.preventDefault();apply();}}>
        <label>题干检索<input className="csx-input" type="search" value={filters.keyword} maxLength={1000}
          onChange={event=>setFilter('keyword',event.target.value)}/></label>
        <label>主题<select className="csx-select" value={filters.topic} onChange={event=>setFilter('topic',event.target.value)}>
          <option value="">全部主题</option>{Object.entries(questionTopics).map(([key,title])=><option key={key} value={key}>{title}</option>)}
        </select></label>
        <label>状态<select className="csx-select" value={filters.status} onChange={event=>setFilter('status',event.target.value)}>
          <option value="">全部状态</option>{Object.entries(states).map(([key,title])=><option key={key} value={key}>{title}</option>)}
        </select></label>
        <button className="csx-btn" type="submit">检索</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      <DataState loading={!entries.data} error={entries.error} retry={entries.refresh}/>
      {entries.data && (entries.data.items.length ? <TableFrame name="题库列表"><table className="csx-table">
        <thead><tr><th scope="col">题目</th><th scope="col">主题</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{entries.data.items.map(question=><tr key={question.id}><th scope="row">{question.prompt}</th><td>{questionTopics[question.topic]}</td>
          <td>{states[question.status as keyof typeof states]}</td><td><button className="csx-btn csx-btn-sm" type="button" onClick={()=>setEditing(question)} aria-label={'编辑 '+question.prompt}>编辑</button></td></tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">当前筛选下没有题目。</p>)}
      {entries.data && <Pager data={entries.data} setPage={setPage}/>}
    </section>
    {editing && <QuestionEditor question={editing} onClose={()=>setEditing(null)} onSaved={()=>{
      setEditing(null);setNotice('题目已保存。');entries.refresh();
    }}/>}
  </>;
}

function QuestionEditor({question,onClose,onSaved}: {question:Question;onClose:()=>void;onSaved:()=>void}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [options,setOptions] = useState(question.options);
  const [answer,setAnswer] = useState(question.answer);
  function removeOption(index: number) {
    setOptions(options.filter((_,position)=>position!==index));
    setAnswer(current=>current===index ? -1 : current>index ? current-1 : current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    setBusy(true);setError('');
    try {
      await adminWrite('/questions'+(question.id?'/'+question.id:''),question.id?'PATCH':'POST',{
        topic:fields.get('topic'),prompt:fields.get('prompt'),options,
        answer,explanation:fields.get('explanation'),status:fields.get('status'),revision:question.revision,
      });
      onSaved();
    } catch(failure) {setError(message(failure));}
    finally {setBusy(false);}
  }
  return <Modal open title={question.id?'编辑题目':'创建题目'} description="发布后，学员可在复习页完成这道补充练习。" onOpenChange={open=>{if(!open&&!busy)onClose();}}>
    <form className="access-fields" onSubmit={save}>
      <label>主题<select className="csx-select" name="topic" defaultValue={question.topic}>{Object.entries(questionTopics).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      <label>题干<textarea className="csx-textarea w-full" name="prompt" rows={3} required maxLength={1000} defaultValue={question.prompt}/></label>
      <fieldset className="admin-question-options">
        <legend>选项（2–6 项）</legend>
        {options.map((option,index)=><div className="admin-question-option" key={index}>
          <label>选项 {String.fromCharCode(65+index)}
            <input className="csx-input" required maxLength={240} value={option}
              onChange={event=>setOptions(options.map((value,position)=>position===index ? event.target.value : value))}/>
          </label>
          <button className="csx-btn csx-btn-sm" type="button" disabled={options.length<=2}
            aria-label={'移除选项 '+String.fromCharCode(65+index)} onClick={()=>removeOption(index)}>移除</button>
        </div>)}
        <button className="csx-btn csx-btn-sm" type="button" disabled={options.length>=6} onClick={()=>setOptions([...options,''])}>添加选项</button>
      </fieldset>
      <label>正确选项<select className="csx-select" name="answer" required value={answer<0?'':answer}
        onChange={event=>setAnswer(event.target.value==='' ? -1 : Number(event.target.value))}>
        <option value="">请选择</option>{options.map((_,index)=><option key={index} value={index}>{String.fromCharCode(65+index)}</option>)}
      </select></label>
      <label>解析<textarea className="csx-textarea w-full" name="explanation" rows={3} required maxLength={2000} defaultValue={question.explanation}/></label>
      <label>状态<select className="csx-select" name="status" defaultValue={question.status}>{Object.entries(states).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      {error&&<p role="alert">{error}</p>}
      <button type="submit" className="csx-btn csx-btn-primary" disabled={busy}><InlineSpinner active={busy}/>{busy?'正在保存…':'保存题目'}</button>
    </form>
  </Modal>;
}

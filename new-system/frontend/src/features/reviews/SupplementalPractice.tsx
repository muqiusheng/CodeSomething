import {useEffect,useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {learningRequest} from '../../api/learning-api';
import {useAuth} from '../auth/AuthContext';

export const questionTopics: Record<string,string> = {http:'HTTP / JSON',sql:'SQL',boot:'Spring Boot',projects:'项目实践'};
type Question = {id:string;topic:string;prompt:string;options:string[];revision:number};
type Result = {correct:boolean;answer:number;explanation:string};

export function SupplementalPractice() {
  const {config}=useAuth();
  const [topic,setTopic]=useState('');
  const [offset,setOffset]=useState(0);
  const [questions,setQuestions]=useState<Question[]>();
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!config?.enabled)return;
    let current=true;
    setQuestions(undefined);setError('');
    void learningRequest<Question[]>('/reviews/supplemental?'+new URLSearchParams({topic,offset:String(offset)}))
      .then(value=>{if(current)setQuestions(value);}).catch(failure=>{if(current)setError(failure.message);});
    return ()=>{current=false;};
  },[config?.enabled,topic,offset]);
  if(!config?.enabled)return <Navigate replace to="/reviews"/>;
  return <div className="page narrow">
    <Link className="back-link" to="/reviews">返回复习</Link>
    <h1>补充练习</h1>
    <label>主题 <select className="csx-select" value={topic} onChange={event=>{setOffset(0);setTopic(event.target.value);}}>
      <option value="">全部主题</option>{Object.entries(questionTopics).map(([key,title])=><option key={key} value={key}>{title}</option>)}
    </select></label>
    {error?<p role="alert">{error}</p>:!questions?<p role="status">正在读取题目…</p>:questions.length===0?<p>暂无已发布的题目。</p>:
      questions.map(question=><QuestionCard key={question.id+'/'+question.revision} question={question}/>)}
    <div className="button-row">
      <button type="button" className="csx-btn" disabled={!offset} onClick={()=>setOffset(offset-20)}>上一页</button>
      <button type="button" className="csx-btn" disabled={(questions?.length||0)<20} onClick={()=>setOffset(offset+20)}>下一页</button>
    </div>
  </div>;
}

function QuestionCard({question}: {question:Question}) {
  const [option,setOption]=useState<number>();
  const [result,setResult]=useState<Result>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function answer() {
    setBusy(true);setError('');
    try {setResult(await learningRequest<Result>('/reviews/supplemental/'+question.id+'/answer',{option,revision:question.revision}));}
    catch(failure) {setError(failure instanceof Error?failure.message:'答案提交失败。');}
    finally {setBusy(false);}
  }
  return <section className="detail-section supplemental-question">
    <h2>{question.prompt}</h2>
    <fieldset disabled={busy||!!result}><legend className="sr-only">选择答案</legend>
      {question.options.map((text,index)=><label className="formal-option" key={text}><input type="radio" name={question.id}
        checked={option===index} onChange={()=>setOption(index)}/><span>{text}</span></label>)}
    </fieldset>
    <button type="button" className="csx-btn" disabled={busy||!!result||option===undefined} onClick={()=>void answer()}>查看答案</button>
    {result&&<p role="status">{result.correct?'回答正确。':'正确答案为 '+question.options[result.answer]+'。'} {result.explanation}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}

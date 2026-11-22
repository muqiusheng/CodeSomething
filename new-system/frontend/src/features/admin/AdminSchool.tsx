import {useEffect, useRef, useState} from 'react';
import {adminDownload, adminRead, adminWrite} from '../../api/admin-api';
import {ConfirmAction, DataState, TableFrame, message, useAdminData, type Confirmation} from './admin-controls';

type School = {courses: {id: string; title: string}[]; learners: {
  userId: string; username: string; labs: {courseId: string; labId: string; title: string; completed: number; required: number}[];
}[]};

type ExportTask = {id: string; status: 'queued' | 'generating' | 'ready' | 'failed'; message: string};

function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve,reject) => {
    const abort = () => {window.clearTimeout(timer);reject(signal.reason);};
    const timer = window.setTimeout(() => {signal.removeEventListener('abort',abort);resolve();}, 1200);
    if (signal.aborted) abort();
    else signal.addEventListener('abort',abort,{once:true});
  });
}

export function AdminSchool() {
  const school = useAdminData<School>('/school');
  const [chosen, setChosen] = useState('');
  const [format, setFormat] = useState('word');
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState<{id: string; course: string; format: string} | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const course = chosen || school.data?.courses[0]?.id || '';
  const rows = school.data?.learners.flatMap(learner => {
    const labs = learner.labs.filter(lab => lab.courseId === course);
    return labs.length ? [{...learner, labs}] : [];
  }) || [];

  const matching = pending?.course===course && pending.format===format ? pending : null;
  async function download(restart = false) {
    const previous = restart ? null : matching;
    let hasTask = !!previous;
    if (restart) setPending(null);
    const run = new AbortController();
    controller.current = run;
    const signal = AbortSignal.any([run.signal, AbortSignal.timeout(120000)]);
    setBusy('正在准备…');
    setNotice('');
    setFailure('');
    try {
      let task = previous ? await adminRead<ExportTask>('/school/reports/' + previous.id, signal)
        : await adminWrite<ExportTask>('/school/reports','POST',{courseId:course,format});
      if (run.signal.aborted) return;
      hasTask = true;
      setPending({id:task.id,course,format});
      while (task.status==='queued' || task.status==='generating') {
        setBusy(task.status==='queued' ? '正在排队…' : '正在生成…');
        await waitForPoll(signal);
        task = await adminRead<ExportTask>('/school/reports/' + task.id, signal);
      }
      if (task.status==='failed') {
        setPending(null);
        throw new Error(task.message);
      }
      setBusy('正在下载…');
      await adminDownload('/school/reports/' + task.id + '/download', course + '-reports.zip', signal);
      if (run.signal.aborted) return;
      setPending(null);
      setNotice('报告归档已下载。');
    } catch (error) {
      if (run.signal.aborted) return;
      if (error instanceof Error && error.name==='TimeoutError') {
        setFailure(hasTask ? '等待超时。点击「继续等待」可查询已提交的任务，也可以重新生成。'
          : '请求超时。请再次点击「下载已通关实验报告」重试。');
      } else {
        setFailure(message(error));
      }
    } finally {
      if (!run.signal.aborted) setBusy('');
    }
  }

  return <>
    <div className="admin-heading"><h1>课内实战</h1><button className="csx-btn" type="button" onClick={school.refresh}>刷新进度</button></div>
    <section className="admin-card">
      <div className="admin-form">
        <label>课程包<select className="csx-select" value={course} disabled={!!busy} onChange={event => setChosen(event.target.value)}>
          {school.data?.courses.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>归档格式<select className="csx-select" value={format} disabled={!!busy} onChange={event => setFormat(event.target.value)}>
          <option value="word">Word (.doc)</option><option value="markdown">Markdown (.md)</option>
        </select></label>
        <button className="csx-btn csx-btn-primary" type="button" disabled={!!busy||!course} onClick={() => void download()}>{busy || (matching?'继续等待':'下载已通关实验报告')}</button>
        {matching && !busy && <button className="csx-btn csx-btn-ghost" type="button" onClick={() => void download(true)}>重新生成</button>}
      </div>
      {busy && <p role="status">{busy}</p>}
      {notice && <p role="status">{notice}</p>}
      {failure && <p role="alert">{failure}</p>}
      <DataState loading={!school.data} error={school.error} retry={school.refresh}/>
      {school.data && (rows.length ? <TableFrame name="学员实验进度"><table className="csx-table">
        <thead><tr><th scope="col">学员</th><th scope="col">实验进度</th><th scope="col">操作</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.userId}><th scope="row">{row.username}</th><td>
          <ul className="admin-lab-progress">{row.labs.map(lab => <li key={lab.labId}>{lab.title} · {lab.completed}/{lab.required}</li>)}</ul>
        </td><td><button className="csx-btn csx-btn-sm" type="button" onClick={() => {setNotice('');setConfirmation({
          title:'重置隔离练习库',description:row.username + '在本课程中对预置数据库所做的更改将被清除，已保存的实验草稿与运行记录保留。',
          action:async () => {
            await adminWrite('/school/' + course + '/learners/' + row.userId + '/reset','POST');
            setNotice('练习库已恢复预置数据。');
          },
        });}}>重置练习库</button></td></tr>)}</tbody>
      </table></TableFrame> : <p className="admin-empty">此课程包暂无实验记录。</p>)}
    </section>
    {confirmation && <ConfirmAction confirmation={confirmation} onClose={() => setConfirmation(null)}/>}
  </>;
}

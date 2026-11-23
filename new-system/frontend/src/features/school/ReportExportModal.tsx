import {apiFetch} from '../../api/auth-api';
import {useEffect, useState} from 'react';
import {Clipboard, Download} from 'lucide-react';
import {Modal} from '../../components/ui/modal';
import {errorMessage, type Student} from './school-api';

export function ReportExportModal({url, student, onClose}: {url: string; student: Student; onClose: () => void}) {
  const [identity, setIdentity] = useState(student);
  const [preview, setPreview] = useState<{query: string; html: string}>();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const query = new URLSearchParams(identity).toString();
  const current = preview?.query === query ? preview.html : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch(url + '?preview=true&' + query, {signal: controller.signal, cache: 'no-store'})
        .then(response => {if (!response.ok) throw new Error('无法生成报告，请重试。'); return response.text();})
        .then(html => setPreview({query, html}))
        .catch(error => {if (!controller.signal.aborted) setError(errorMessage(error));});
    }, 180);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [url, query]);

  async function copy() {
    if (!current) return;
    const plain = new DOMParser().parseFromString(current, 'text/html');
    plain.querySelectorAll('th,td').forEach(cell => cell.append('\t'));
    plain.querySelectorAll('h1,h2,h3,p,pre,tr').forEach(element => element.append('\n'));
    const text = plain.body.textContent || '';
    try {
      if (typeof ClipboardItem !== 'function') await navigator.clipboard.writeText(text);
      else await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([current], {type: 'text/html'}),
        'text/plain': new Blob([text], {type: 'text/plain'}),
      })]);
      setStatus('报告已复制。');
    } catch {
      try {await navigator.clipboard.writeText(text); setStatus('报告文字已复制。');}
      catch {setStatus('浏览器未允许复制。可下载 Word 文件。');}
    }
  }

  async function download() {
    setDownloading(true);
    setError('');
    try {
      const response = await apiFetch(url + '?' + query, {signal: AbortSignal.timeout(15000), cache: 'no-store'});
      if (!response.ok) throw new Error('下载报告失败，请重试。');
      const blob = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      const name = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      link.href = blob;
      link.download = name ? decodeURIComponent(name) : '实验报告.doc';
      link.click();
      setTimeout(() => URL.revokeObjectURL(blob), 1000);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setDownloading(false); }
  }

  return <Modal open onOpenChange={open => {if (!open) onClose();}} title="实验报告预览" className="school-report-modal"
    description="报告包含当前作答及对应的运行记录。下载前可核对姓名和学号。">
    <div className="school-report-fields">
      <label>学号<input className="input" name="number" inputMode="numeric" autoComplete="off" spellCheck={false} value={identity.number} maxLength={24} onChange={event => {setStatus(''); setError(''); setIdentity({...identity, number: event.target.value});}}/></label>
      <label>姓名<input className="input" name="name" autoComplete="name" value={identity.name} maxLength={60} onChange={event => {setStatus(''); setError(''); setIdentity({...identity, name: event.target.value});}}/></label>
    </div>
    {error ? <p role="alert">{error}</p> : current ? <iframe title="实验报告正文" sandbox="" srcDoc={current}/> : <p role="status">正在生成报告…</p>}
    <div className="school-actions">
      <button className="btn button secondary" disabled={!current} onClick={() => void copy()}><Clipboard size={16} aria-hidden="true"/>复制报告</button>
      <button className="btn button primary" type="button" disabled={downloading} onClick={() => void download()}><Download size={16} aria-hidden="true"/>{downloading ? '正在下载…' : '下载 .doc'}</button>
      <span role="status">{status}</span>
    </div>
  </Modal>;
}

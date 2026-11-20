import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const browser = process.env.CS_BROWSER_BIN;
assert(browser, 'Set CS_BROWSER_BIN to the agent-browser executable');
const native = process.env.CS_FILE_SYNC_NATIVE_FIXTURE
  ? JSON.parse(readFileSync(process.env.CS_FILE_SYNC_NATIVE_FIXTURE, 'utf8'))
  : undefined;
const session = native ? 'cs-workspace-file-sync-native' : 'cs-workspace-file-sync';
const editor = '.folder-file-view .monaco-editor [role=textbox]';
const origin = process.env.CS_FRONTEND_URL || 'http://127.0.0.1:5178';
const route = '/learn/http-json/1.1/run-server';
const initialNotes = '// one\r\n// two\n// three\n';

function run(...args) {
  const result = spawnSync(browser, ['--session', session, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout.trim();
}

const click = name => run('find', 'role', 'button', 'click', '--name', name, '--exact');
const evaluate = code => JSON.parse(run('eval', code));
const wait = condition => run('wait', '--fn', condition, '--timeout', '8000');
const visibleCode = text => wait(`document.querySelector('.monaco-editor .view-lines')?.textContent.includes(${JSON.stringify(text)})`);
const saveEnabled = () => evaluate(`[...document.querySelectorAll('.project-sync-actions button')].find(button => button.textContent.includes('保存到本地')).disabled === false`);
function writeNotes(text) {
  if (native) writeFileSync(join(native.path, 'Notes.java'), text);
  else evaluate(`window.writeProjectFile('Notes.java',${JSON.stringify(text)}).then(()=>true)`);
}

try {
  run('set','viewport','1600','900');
  if (native) {
    writeNotes(initialNotes);
    run('open', origin + '/learn');
    const {id, token, name} = native;
    evaluate(`localStorage.setItem('cs-folder-project-http-json-basics-1.1.0-native',${JSON.stringify(JSON.stringify({id, token, name}))});true`);
    run('open', origin + route);
    wait("document.querySelector('.folder-toolbar-status')?.title.includes('本机服务连接')");
  } else {
    run('open', origin + route);
    wait("document.querySelector('.folder-project-workspace')?.textContent.includes('项目根目录') || document.querySelector('.folder-project-workspace')?.textContent.includes('浏览器授权连接')");
    evaluate(`(async()=>{
    const storage=await navigator.storage.getDirectory();
    const root=await storage.getDirectoryHandle(crypto.randomUUID(),{create:true});
    window.writeProjectFile=async (path,text)=>{
      const file=await root.getFileHandle(path,{create:true});
      const stream=await file.createWritable();
      await stream.write(text);
      await stream.close();
    };
    await window.writeProjectFile('TaskServer.java','class TaskServer {}');
    await window.writeProjectFile('Notes.java',${JSON.stringify(initialNotes)});
    window.showDirectoryPicker=async()=>root;
    window.readProjectFile=async path=>(await (await root.getFileHandle(path)).getFile()).text();
    return true;
  })()`);
    if(evaluate("document.querySelector('.folder-project-options')?.textContent.includes('浏览器授权连接（备用）')")){
      run('click','.folder-project-options > summary');
      click('浏览器授权连接（备用）');
    }else click('选择本地工程文件夹');
  }
  wait("document.querySelector('.project-file-tree')?.textContent.includes('Notes.java')");
  const openFile=name=>{
    if(evaluate("document.querySelector('.project-tree-trigger').getAttribute('aria-expanded') === 'false'"))click('项目文件');
    click(name);
  };
  openFile('TaskServer.java');
  visibleCode('TaskServer');
  openFile('Notes.java');
  visibleCode('three');
  assert.equal(saveEnabled(), false, 'Opening a file with mixed line endings must not create a web draft');

  writeNotes('// saved-in-ide');
  evaluate("window.dispatchEvent(new Event('focus'));true");
  visibleCode('saved-in-ide');
  assert.equal(saveEnabled(), false);
  console.log('PASS external save reaches the open editor without creating a web draft');

  run('focus', editor);
  run('press', 'Control+End');
  run('type', editor, ' web-draft');
  visibleCode('web-draft');
  writeNotes('// newer-disk-copy');
  wait("document.querySelector('.folder-file-view')?.textContent.includes('查看磁盘版本')");
  run('click', '.folder-file-view details summary');
  wait("document.querySelector('.folder-file-view details[open] textarea')?.value.includes('newer-disk-copy')");
  visibleCode('web-draft');
  click('保存到本地（1）');
  wait("document.querySelector('.workspace-error')?.textContent.includes('文件已被IDE')");
  const saved = native ? readFileSync(join(native.path, 'Notes.java'), 'utf8') : evaluate("window.readProjectFile('Notes.java')");
  assert.equal(saved, '// newer-disk-copy');
  click('丢弃此文件网页修改并重新读取');
  visibleCode('newer-disk-copy');
  assert.equal(saveEnabled(), false);
  console.log('PASS conflicted disk content is readable, and the draft cannot overwrite it');
} finally {
  run('close');
}

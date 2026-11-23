import {localState, scopedKey} from '../../../api/browser-state.mjs';
import {nativeDirectory} from './native-project.mjs';
// Directory handles stay in the browser. Only the chapter snapshot is uploaded.
function parts(path){const values=path.split('/');if(values.some(v=>!v||v==='.'||v==='..'||v.includes('\\')||v.includes(':')||/[\u0000-\u001f]/.test(v)))throw new Error('文件路径无效。');return values}
async function fileAt(root,path){const values=parts(path);let parent=root;for(const name of values.slice(0,-1))parent=await parent.getDirectoryHandle(name);return parent.getFileHandle(values.at(-1))}
export async function listDirectory(root){const result=[];for await(const entry of root.values())result.push(entry);return result.sort((a,b)=>(a.kind===b.kind?0:a.kind==='directory'?-1:1)||a.name.localeCompare(b.name,'zh-CN'))}
export function isMissingProjectEntry(error){
 return ['NotFoundError','TypeMismatchError'].includes(error?.name)||error?.code==='PROJECT_ENTRY_MISSING';
}
export async function openFilePresence(root,paths){
 const directories=new Map();
 async function filesIn(parentPath){
  try{
   let directory=root;
   for(const name of parentPath)directory=await directory.getDirectoryHandle(name);
   return new Set((await listDirectory(directory)).filter(entry=>entry.kind==='file').map(entry=>entry.name));
  }catch(error){
   // Failed permission or I/O checks leave the previous editor state intact.
   if(parentPath.length&&isMissingProjectEntry(error))return new Set();
  }
 }
 const presence=await Promise.all(paths.map(async path=>{
  const segments=parts(path), name=segments.pop(), parent=segments.join('/');
  if(!directories.has(parent))directories.set(parent,filesIn(segments));
  const files=await directories.get(parent);
  return [path,files?.has(name)];
 }));
 return new Map(presence);
}
function explain(error,path){
 const name=error?.name;
 const message=isMissingProjectEntry(error)?`文件已移动或删除：${path}。请从目录打开当前文件。`:name==='NotAllowedError'||name==='SecurityError'?`没有读取权限：${path}。请重新授权此工程。`:name==='NotReadableError'?`文件正在被其他程序保存：${path}。请稍后重试。`:error.code?error.message:`读取${path}失败：${error.message||'请刷新目录后重试。'}`;
 return Object.assign(new Error(message),{name:name||'Error',code:error.code,path});
}
export async function readText(root,path){
 for(let attempt=0;attempt<3;attempt++)try{
  const file=await(await fileAt(root,path)).getFile();if(file.size>1048576)throw new Error('此文件大于1MiB，请在IDE中打开。');
  let text;try{text=typeof file.arrayBuffer==='function'?new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()):await file.text()}catch(e){if(e.name==='TypeError')throw new Error('此文件不是UTF-8文本或为二进制文件，请在本地应用中打开。');throw e}
  if(text.includes('\0'))throw new Error('二进制文件请在本地应用中打开。');return text;
 }catch(e){if(attempt<2&&['NotFoundError','NotReadableError'].includes(e.name)){await new Promise(resolve=>setTimeout(resolve,80*(attempt+1)));continue}throw explain(e,path)}
}
export async function saveText(root,path,expected,value){const handle=await fileAt(root,path);if(await(await handle.getFile()).text()!==expected)throw new Error('此文件已被IDE或其他页面修改。请重新读取后合并修改；当前网页修改仍保留。');const writable=await handle.createWritable();try{await writable.write(value);await writable.close()}catch(e){await writable.abort?.();throw e}}
export function isProjectSourcePath(path){try{parts(path)}catch{return false}return path==='pom.xml'||path==='RUN.md'||/^src\/(main|test)\/java\/(?:[A-Za-z_$][A-Za-z0-9_$]*\/)*[A-Za-z_$][A-Za-z0-9_$]*\.java$/.test(path)||/^src\/(main|test)\/resources\/(?:[^/]+\/)*[^/]+\.(properties|ya?ml|xml|json|sql|txt|md|html|css|js|csv)$/.test(path)}
async function collectOnce(root,course){
 const paths=[];
 async function walk(directory,prefix){for(const entry of await listDirectory(directory)){const path=prefix+entry.name;if(entry.kind==='directory')await walk(entry,path+'/');else if(isProjectSourcePath(path))paths.push(path);if(paths.length>99)throw new Error('当前检查最多支持100个文件。')}}
 if(course==='http-json-basics')paths.push('TaskServer.java');
 else {paths.push('pom.xml');let src;try{src=await root.getDirectoryHandle('src')}catch(e){throw explain(e,'src')}for(const kind of ['main','test'])for(const type of ['java','resources']){let directory;try{directory=await(await src.getDirectoryHandle(kind)).getDirectoryHandle(type)}catch(e){if(e.name==='NotFoundError'||e.message==='Not found')continue;throw explain(e,'src/'+kind+'/'+type)}await walk(directory,'src/'+kind+'/'+type+'/')}if((await listDirectory(root)).some(e=>e.name==='RUN.md'&&e.kind==='file'))paths.push('RUN.md')}
 if(paths.length>100)throw new Error('当前检查最多支持100个文件。');
 const files={};let total=0;for(const path of paths.sort()){const value=await readText(root,path);const bytes=new TextEncoder().encode(value).length;total+=bytes;if(bytes>65536||total>2097152)throw new Error('检查文件单个最多64KiB、合计2MiB。');files[path]=value}return files;
}
export async function collectCheckFiles(root,course){
 if(root.snapshot)return root.snapshot(course);
 let previous;for(let attempt=0;attempt<3;attempt++){
  const current=await collectOnce(root,course);const key=JSON.stringify(current);if(previous===key)return current;previous=key;
 }
 throw new Error('工程正在持续变化，请等待IDE保存完成后再提交。');
}
export async function projectStamp(root,course){
 if(root.stamp)return root.stamp(course);
 const entries=[];
 async function add(path){const file=await(await fileAt(root,path)).getFile();entries.push([path,file.size,file.lastModified??0])}
 async function walk(dir,prefix){for(const entry of await listDirectory(dir)){const path=prefix+entry.name;if(entry.kind==='directory')await walk(entry,path+'/');else if(isProjectSourcePath(path))await add(path);if(entries.length>100)throw new Error('检查文件超过100个。')}}
 if(course==='http-json-basics')await add('TaskServer.java');else{await add('pom.xml');const src=await root.getDirectoryHandle('src');for(const kind of ['main','test'])for(const type of ['java','resources']){let directory;try{directory=await(await src.getDirectoryHandle(kind)).getDirectoryHandle(type)}catch(e){if(e.name==='NotFoundError'||e.message==='Not found')continue;throw explain(e,'src/'+kind+'/'+type)}await walk(directory,'src/'+kind+'/'+type+'/')}if((await listDirectory(root)).some(e=>e.name==='RUN.md'&&e.kind==='file'))await add('RUN.md')}
 return JSON.stringify(entries.sort(([a],[b])=>a.localeCompare(b)));
}
export async function rememberDirectory(key,handle){if(handle.bridge){localState.setItem(key+'-native',JSON.stringify(handle.bridge));return}await database(key,handle,true);localState.removeItem(key+'-native')}

export async function recallDirectory(key){const stored=localState.getItem(key+'-native');if(stored)return nativeDirectory(JSON.parse(stored));return database(key,undefined,false)}
function database(key,value,write){return new Promise((resolve,reject)=>{const request=indexedDB.open('cs-local-project-roots',1);request.onupgradeneeded=()=>request.result.createObjectStore('roots');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('roots',write?'readwrite':'readonly');const operation=write?tx.objectStore('roots').put(value,scopedKey(key)):tx.objectStore('roots').get(scopedKey(key));tx.oncomplete=()=>{resolve(operation.result);db.close()};tx.onerror=()=>{reject(tx.error);db.close()};tx.onabort=()=>{reject(tx.error);db.close()}}})}

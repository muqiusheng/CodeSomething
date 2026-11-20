// This adapter shares the existing editor/tree contract; it never sends a client path as a root.
async function request(path,token,body){
 const response=await fetch('/api/v1/local-projects'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.message||'本机工程请求失败，请重试。'),{code:result.code,path:result.details?.path});return result;
}
export function nativeDirectory(connection,prefix=''){
 const base='/connections/'+encodeURIComponent(connection.id);
 const full=name=>prefix+name;
 return {kind:'directory',name:prefix?prefix.split('/').filter(Boolean).at(-1):connection.name,bridge:connection,
  async *values(){for(const entry of await request(base+'/tree?path='+encodeURIComponent(prefix.replace(/\/$/,'')),connection.token))yield entry.kind==='directory'?nativeDirectory(connection,full(entry.name)+'/'):nativeFile(connection,full(entry.name));},
  async getDirectoryHandle(name){return nativeDirectory(connection,full(name)+'/')},
  async getFileHandle(name){return nativeFile(connection,full(name))},
  async queryPermission(){await request(base+'/tree',connection.token);return 'granted'},
  async requestPermission(){await request(base+'/tree',connection.token);return 'granted'},
  async snapshot(course){return (await request(base+'/snapshot?course='+encodeURIComponent(course),connection.token)).files},
  async stamp(course){return (await request(base+'/stamp?course='+encodeURIComponent(course),connection.token)).stamp},
 };
}
function nativeFile(connection,path){
 let expected;
 const endpoint='/connections/'+encodeURIComponent(connection.id)+'/file';
 return {kind:'file',name:path.split('/').at(-1),async getFile(){expected=(await request(endpoint+'?path='+encodeURIComponent(path),connection.token)).content;return new File([expected],path.split('/').at(-1))},
  async createWritable(){if(expected===undefined)throw new Error('保存前请先读取文件。');let value;return {async write(text){value=text},async close(){await request(endpoint,connection.token,{path,expected,content:value})},async abort(){}}}
 };
}
export async function nativeAvailable(){return (await request('/capabilities')).available}
export async function pickNativeDirectory(signal){
 const pick=await request('/pick',undefined,{});
 try{while(true){if(signal?.aborted)throw new DOMException('已取消选择','AbortError');const result=await request('/picks/'+pick.id,pick.token);if(result.status==='connected')return nativeDirectory(result.connection);if(result.status==='cancelled')throw new DOMException('已取消选择','AbortError');if(result.status==='error')throw new Error(result.message);await new Promise(resolve=>setTimeout(resolve,350));}}
 catch(error){if(signal?.aborted)void request('/picks/'+pick.id+'/cancel',pick.token,{}).catch(()=>{});throw error}
}

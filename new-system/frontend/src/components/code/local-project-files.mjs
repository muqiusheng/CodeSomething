import {scopedKey} from '../../api/browser-state.mjs';
/** Writes only declared files into a directory handle selected by the user. */
export async function writeProjectFiles(directory,files,onWritten=()=>{}){
 const entries=Object.entries(files);
 for(const [path,content] of entries){
  if(typeof content!=='string'||path.split('/').some(part=>!part||part==='.'||part==='..'||/[\\:]/.test(part)))throw new Error('无法保存路径：'+path);
 }
 let written=0;
 for(const [path,content] of entries){
  const segments=path.split('/');let parent=directory;
  for(const segment of segments.slice(0,-1))parent=await parent.getDirectoryHandle(segment,{create:true});
  const file=await parent.getFileHandle(segments.at(-1),{create:true});const stream=await file.createWritable();
  try{await stream.write(content);await stream.close()}catch(error){try{await stream.abort?.()}catch{}throw error}
  onWritten(++written);
 }
 return written;
}

import {LocalMaterialLinks} from '../tlias/TliasLearning';
import {useState} from 'react';
import {ExternalLink,FolderOpen,Copy} from 'lucide-react';
import {courseMaterial,referencesFor} from './course-references';
export function CourseResources({courseId,stageId,lessonTitle}:{courseId:string;stageId:string;lessonTitle?:string}){
 const refs=referencesFor(courseId,stageId);const [notice,setNotice]=useState('');
 async function copy(path:string){try{await navigator.clipboard.writeText(path);setNotice('已复制完整网盘文件位置。')}catch{setNotice('无法自动复制，请按下方目录与文件名查找。')}}
 return <details className="course-resources"><summary>卡住了？查看对应课程与资料</summary>{lessonTitle&&<p>当前小节：{lessonTitle}</p>}<LocalMaterialLinks courseId={courseId}/><ul>{refs.map(ref=><li key={ref.part}><a href={ref.url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true"/>{ref.part}. {ref.title}</a><button type="button" className="text-button" onClick={()=>void copy(ref.path)} aria-label={'复制'+ref.part+'课网盘位置'}><Copy size={13} aria-hidden="true"/>复制网盘位置</button></li>)}</ul><p>上方可打开同名课时分P。文件名已从网盘核实，分P按课时编号关联，尚未逐集播放核验。</p>{courseId==='http-json-basics'&&<p>视频以SpringBoot讲协议；当前项目用JDK HttpServer亲手实现响应，按网页中的文件与接口约定操作。</p>}{stageId==='b-login'&&<p>参考课使用JWT，本项目使用可撤销的服务端会话；必须保留注销后旧令牌立即失效的要求。</p>}<a href={courseMaterial.share} target="_blank" rel="noreferrer"><FolderOpen size={14} aria-hidden="true"/>打开配套资料网盘 · 提取码{courseMaterial.code}</a><p className="material-directory">{courseMaterial.directory}</p><p>网盘中查找上面对应编号的mp4。课程使用Tlias案例，表名、接口字段与依赖以当前项目为准；继续保留自己的工程源码。</p>{notice&&<p role="status">{notice}</p>}</details>;
}

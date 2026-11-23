import {FolderProjectWorkspace} from './FolderProjectWorkspace';
import {useEffect,useState,type ComponentProps,type ReactNode} from 'react';
import {learningRequest} from '../../../api/learning-api';
import {BrowserWorkspace} from './BrowserWorkspace';
import {WorkspaceSubmission} from './WorkspaceSubmission';
import {LocalProjectGuide} from './LocalProjectGuide';
import {useAuth} from '../../auth/AuthContext';

export function LocalFirstWorkspace({practiceFooter,starterOverride,...props}:ComponentProps<typeof BrowserWorkspace>&{practiceFooter?:ReactNode;starterOverride?:Record<string,string>}){
 const {config}=useAuth();
 const [configuration,setConfiguration]=useState<Record<string,string>>(props.context.courseId==='http-json-basics'?{'TaskServer.java':`import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

public class TaskServer {
    public static void main(String[] args) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        // 在这里按章节注册路径、读取请求、返回响应。
        server.start();
    }
}
`}:{});
 useEffect(()=>{let active=true;if(props.context.courseId!=='http-json-basics')void learningRequest<{starterFiles:{path:string;content:string}[]}>('/courses/'+props.context.courseId+'/versions/'+props.context.courseVersion+'/stages/'+props.context.stageId).then(data=>{if(active)setConfiguration(Object.fromEntries(data.starterFiles.map(f=>[f.path,f.content])))}).catch(()=>{});return()=>{active=false}},[props.context.courseId,props.context.stageId,props.context.courseVersion]);
 const query=new URLSearchParams(window.location.search);
 if(config?.enabled&&!practiceFooter&&(!query.has('submission')||!query.has('job')))
  return <BrowserWorkspace key={props.context.courseId+props.context.courseVersion} {...props}/>;
 const guide=<LocalProjectGuide courseId={props.context.courseId} configuration={starterOverride??configuration} practiceOnly={practiceFooter!==undefined}/>;
 return <div className="local-first-workspace" data-local-reader>{!practiceFooter&&query.get('submission')&&query.get('job')?<>{guide}<WorkspaceSubmission key={props.context.courseId+props.context.stageId} context={props.context} onJobChange={props.onJobChange} nextHref={props.nextHref} evidence={{submissionId:query.get('submission')!,jobId:query.get('job')!}}/></>:<FolderProjectWorkspace key={props.context.courseId+props.context.courseVersion} {...props} practiceFooter={practiceFooter} guide={guide}/>}</div>;
}

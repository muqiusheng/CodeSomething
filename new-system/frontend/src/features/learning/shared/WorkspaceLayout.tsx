import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';

const views = [['task','📖','任务要求'],['code','💻','代码编写'],['report','📋','结果报告']] as const;
type View = typeof views[number][0];
const Context = createContext<{select:(view:View)=>void;reportVisible:boolean}|null>(null);
export const useWorkspaceView = () => useContext(Context);

export function WorkspaceLayout({className,children,practice=true}:{className:string;children:ReactNode;practice?:boolean}){
 const [view,select]=useState<View>('task');
 const [compact,setCompact]=useState(()=>matchMedia('(width < 640px)').matches);
 useEffect(()=>{
  const media=matchMedia('(width < 640px)');
  const update=()=>setCompact(media.matches);
  media.addEventListener('change',update);
  return ()=>media.removeEventListener('change',update);
 },[]);
 return <Context.Provider value={{select,reportVisible:compact&&view==='report'}}>
  <div className={className} data-workspace-view={view} data-practice={practice}>
   <div className="workspace-view-switch" role="group" aria-label="工作台视图">
    {views.map(([id,icon,title])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>select(id)}><span aria-hidden="true">{icon}</span> {title}</button>)}
   </div>{children}
  </div>
 </Context.Provider>;
}

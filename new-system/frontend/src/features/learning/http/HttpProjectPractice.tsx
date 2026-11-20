import {WorkspaceLayout} from '../shared/WorkspaceLayout';
import {WorkspaceTaskPane} from '../shared/WorkspaceTaskPane';
import {WorkspaceDivider} from '../shared/WorkspaceDivider';
import type {ComponentProps} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {LocalFirstWorkspace} from '../shared/LocalFirstWorkspace';
import {PracticeSteps} from '../shared/PracticeSteps';
import {curriculumFor} from '../shared/curriculum';
import {firstMain} from '../journey/LessonContent';
import {lessonHref} from '../journey/catalog';

export function HttpProjectPractice({stage,version,onJobChange}:{stage:string;version:string;onJobChange:ComponentProps<typeof LocalFirstWorkspace>['onJobChange']}){
 const [query]=useSearchParams();
 const chapter=curriculumFor('http-json-basics',stage);
 if(!chapter.lessons.length)return null;
 const firstProgram=stage==='workspace'&&(!query.has('journey')||query.get('journey')==='01');
 const firstResponse=stage==='workspace'&&query.get('journey')==='02';
 const footer=firstProgram||firstResponse?undefined:<p>按本节步骤在 IDEA 或浏览器观察变化。需要提交 HTTP 检查时，进入<Link className="text-button" to="/learn/http-json/1.1/run-server?tab=任务">「运行第一个接口」</Link>。</p>;
 return <WorkspaceLayout className="guided-coding-layout">
  <WorkspaceTaskPane><PracticeSteps key={stage} scope={'http-project-'+stage} courseId="http-json-basics" stageId={stage} goal={chapter.title}/></WorkspaceTaskPane>
  <WorkspaceDivider/>
  <LocalFirstWorkspace onJobChange={onJobChange} key={firstResponse?'workspace-http-text':stage} context={{courseId:'http-json-basics',courseVersion:version,stageId:firstResponse?'workspace-http-text':stage}} starterOverride={firstProgram?{'TaskServer.java':firstMain}:undefined} practiceFooter={footer} nextHref={firstProgram?lessonHref('02'):firstResponse?lessonHref('03'):undefined}/>
 </WorkspaceLayout>;
}

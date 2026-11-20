import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {allLessons,groupedLessons,lessonById,lessonHref,mainLessons,modulesForCourse,workspaceHref} from '../../src/features/learning/journey/catalog.ts';
import {foundations} from '../../src/features/learning/journey/foundations.ts';
import {projects} from '../../src/features/learning/journey/projects.ts';

const courseVersions = {'sql-foundations':'1.0.0','http-json-basics':'1.1.0','boot-foundations':'1.0.0','task-manager':'1.0.0',collaboration:'1.0.0'};

test('the new route publishes all 72 main lessons and all 18 optional exercises as distinct, complete lessons',()=>{
 assert.equal(foundations.length+projects.length,72);
 assert.deepEqual(groupedLessons.map(group=>group.length),[6,8,8,8,8,10,10,6,8,6,6,6]);
 assert.equal(lessonById.size,90);
 assert.deepEqual(mainLessons.map(lesson=>lesson.number),Array.from({length:72},(_,i)=>i+1));
 for(const lesson of allLessons){
  for(const key of ['title','file','start','action','run','result','troubleshoot'])assert.ok(lesson[key].trim(),`${lesson.id} ${key}`);
  assert.equal(lessonById.get(lesson.id),lesson);
 }
 assert.equal(new Set(allLessons.map(lesson=>lesson.action)).size,90);
});

test('project directories cover every journey lesson group',()=>{
 const courses=[...Object.keys(courseVersions),'portfolio'];
 const displayed=courses.flatMap(course=>modulesForCourse(course)).flatMap(module=>groupedLessons[module]);
 assert.equal(displayed.length,90);
 assert.deepEqual(new Set(displayed.map(lesson=>lesson.id)),new Set(lessonById.keys()));
 assert.deepEqual(modulesForCourse('boot-foundations'),[3,4]);
 assert.deepEqual(modulesForCourse('collaboration'),[6,7,11]);
});

test('workspace links point to published chapter contracts and retain the exact lesson and return destination',()=>{
 const courseStages=Object.fromEntries(Object.entries(courseVersions).map(([course,version])=>{
  const url=new URL(`../../../course-packs/${course}/${version}/project.json`,import.meta.url);
  const pack=JSON.parse(fs.readFileSync(url,'utf8').replace(/^\uFEFF/,''));
  return [course,new Set(pack.chapters.map(chapter=>chapter.stageId))];
 }));
 for(const lesson of allLessons){
  const workspace=new URL(workspaceHref(lesson,'25'),'http://localhost');
  assert.equal(workspace.searchParams.get('journey'),lesson.id);
  assert.equal(workspace.searchParams.get('from'),'25');
  assert.equal(lessonHref(lesson.id),'/learn/journey/'+lesson.id);
  if(lesson.courseId==='portfolio')assert.equal(workspace.pathname,'/projects/independent');
  else {
   assert.ok(courseStages[lesson.courseId].has(lesson.stage),`${lesson.id}: ${lesson.stage}`);
   assert.equal(workspace.searchParams.get('tab'),'任务');
   assert.ok(workspace.pathname.endsWith('/'+lesson.stage));
  }
 }
});

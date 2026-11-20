import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curriculumFor,resolveLesson} from '../../src/features/learning/shared/curriculum.ts';
test('Boot HTTP is an incremental chapter with concrete files and restored lesson position',()=>{
 const plan=curriculumFor('boot-foundations','boot-http');
 assert(plan.before.includes('健康'));
 assert(plan.lessons.length>=4);
 assert(plan.lessons.some(l=>l.file.includes('EchoController')));
 assert(plan.lessons.some(l=>l.instruction.includes('保留')));
 assert(plan.lessons.every(l=>l.instruction!==l.expected));
 assert.equal(resolveLesson(plan.lessons,'gone'),0);
 assert.equal(resolveLesson(plan.lessons,plan.lessons[2].id),2);
});

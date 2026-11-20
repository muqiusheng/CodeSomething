import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = p => readFileSync(path.join(root, p), 'utf8');
const plan = JSON.parse(read('new-system/curriculum/r3-plan.json'));
const course = JSON.parse(read(`new-system/${plan.referenceCourse.path}`));
assert.equal(plan.status, 'draft');
assert.equal(plan.schemaVersion, 1);
assert.equal(course.courseId, plan.referenceCourse.courseId);
assert.equal(course.courseVersion, plan.referenceCourse.version);
const nodes = new Map(plan.nodes.map(n => [n.id, n]));
assert.equal(nodes.size, plan.nodes.length, 'duplicate node');
const visiting = new Set(), visited = new Set();
function visit(id) {
  assert(nodes.has(id), `missing dependency ${id}`);
  assert(!visiting.has(id), `cycle at ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dep of nodes.get(id).dependsOn) visit(dep);
  visiting.delete(id); visited.add(id);
}
for (const n of plan.nodes) {
  assert(Array.isArray(n.dependsOn));
  assert.equal(new Set(n.dependsOn).size, n.dependsOn.length);
  assert(Number.isInteger(n.minutes) && n.minutes > 0);
  assert(['existing-reading', 'existing-code', 'planned-code'].includes(n.kind));
  visit(n.id);
  if (n.kind === 'planned-code') {
    for (const key of ['goal', 'artifact', 'functionalCheck', 'understandingVariant']) assert(n[key]?.trim(), `${n.id}.${key}`);
    assert(!n.checkPolicy, 'unimplemented policies must not claim availability');
  }
}
const existing = plan.nodes.filter(n => n.kind.startsWith('existing-'));
assert.deepEqual(existing.map(n => n.id), course.chapters.map(c => c.stageId));
for (const chapter of course.chapters) {
  const n = nodes.get(chapter.stageId);
  assert.equal(n.kind, `existing-${chapter.mode}`);
  assert.equal(n.minutes, chapter.minutes);
  assert.deepEqual(n.dependsOn, chapter.dependsOn);
  assert.equal(n.checkPolicy, chapter.checkPolicy);
}
const formal = read('new-system/backend/src/main/java/dev/codesomething/learning/UnderstandingRules.java');
for (const n of existing.filter(n => n.kind === 'existing-code')) {
  assert(formal.includes(`"${n.id}"`));
  assert(formal.includes(`"${n.checkPolicy}"`));
}
assert.deepEqual(nodes.get('a-read').dependsOn, ['transfer', 'sql-transfer', 'boot-jdbc']);
const plannedMinutes = plan.nodes.filter(n => n.kind === 'planned-code').reduce((sum, n) => sum + n.minutes, 0);
assert.equal(plannedMinutes, 785);
const docs = ['docs/10-R3.1知识依赖与项目A关卡.md', 'docs/README.md', 'docs/05-从零实施计划与验收.md', 'docs/实施追踪.md'];
let linkCount = 0;
for (const doc of docs) {
  for (const match of read(doc).matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    const target = match[1].split('#')[0];
    assert(existsSync(path.resolve(root, path.dirname(doc), target)), `${doc}: missing ${target}`);
    linkCount++;
  }
}
const result = { status:'passed', scope:'R3.1 static planning validation; no database or application runtime checks', nodes:nodes.size, existingChapters:existing.length, existingCodeStages:existing.filter(n => n.kind === 'existing-code').length, plannedNodes:nodes.size-existing.length, plannedMinutes, localLinks:linkCount, acyclic:true, referenceCourseSha256:createHash('sha256').update(read(`new-system/${plan.referenceCourse.path}`)).digest('hex') };
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--record')) writeFileSync(path.join(root, 'new-system/docs/acceptance/R3.1/validation.json'), JSON.stringify(result, null, 2) + '\n');

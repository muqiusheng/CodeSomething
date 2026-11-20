import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateRelease } from '../checks/check-r34-release.mjs';

const system = fileURLToPath(new URL('../../', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'cs-r34-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = JSON.parse(readFileSync(path.join(system, 'curriculum/r34-release-lock.json')));
  for (const name of [...Object.keys(lock.files), 'curriculum/r34-release-lock.json']) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(system, name), target);
  }
  const overlayName='curriculum/r7-platform-overlay.json';
  if(existsSync(path.join(system,overlayName))){
    copyFileSync(path.join(system,overlayName),path.join(root,overlayName));
    const overlay=JSON.parse(readFileSync(path.join(system,overlayName)));
    for(const name of Object.keys(overlay.files)) {const target=path.join(root,name);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(system,name),target);}
  }
  mkdirSync(path.join(root, 'evidence'));
  for (const stage of lock.stages) for (const kind of ['reference', 'mutant']) {
    const name = `${stage.stageId}-${kind}.json`;
    copyFileSync(path.join(system, 'docs/acceptance/R3.4/strategies', name), path.join(root, 'evidence', name));
  }
  return root;
}
test('published package edits fail the gate rather than silently replacing the same version', t => {
  const root = fixture(t);
  const target = path.join(root, 'course-packs/task-manager/1.0.0/project.json');
  const course = JSON.parse(readFileSync(target));
  course.chapters[0].goal = 'changed without a new version';
  writeFileSync(target, JSON.stringify(course));
  assert.throws(() => validateRelease({ systemRoot: root }), /locked file changed/);
});
test('a passing report for another snapshot cannot authorize release', t => {
  const root = fixture(t), evidenceDirectory = path.join(root, 'evidence');
  const target = path.join(evidenceDirectory, 'a-create-reference.json');
  const evidence = JSON.parse(readFileSync(target));
  evidence.report.snapshotDigest = '0'.repeat(64);
  writeFileSync(target, JSON.stringify(evidence));
  assert.throws(() => validateRelease({ systemRoot: root, evidenceDirectory }), /snapshot mismatch/);
});
test('extra answer files inserted into the minimal transfer starter are rejected', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'course-packs/task-manager/1.0.0/a-transfer/starter', 'Answer.java'), 'class Answer {}');
  assert.throws(() => validateRelease({ systemRoot: root, evidenceDirectory: path.join(root, 'evidence') }), /unlocked release input/);
});
test('the authoring generator refuses to overwrite a published version before writing files', t => {
  const root = fixture(t);
  mkdirSync(path.join(root, 'tooling'));
  const generator = path.join(root, 'tooling/build-r33-courses.py');
  copyFileSync(path.join(system, 'tooling/build-r33-courses.py'), generator);
  const result = spawnSync('python', [generator], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Published version is immutable/);
});
test('complete matching runtime evidence authorizes the ten-stage release', t => {
  const root = fixture(t);
  const result = validateRelease({ systemRoot: root, evidenceDirectory: path.join(root, 'evidence') });
  assert.equal(result.status, 'passed');
  assert.equal(result.stages.length, 10);
  assert.equal(result.stages.at(-1).scaffolding, 'minimal-project');
});
test('an environment failure cannot substitute for a rejected behavioral mutant', t => {
  const root = fixture(t), evidenceDirectory = path.join(root, 'evidence');
  const target = path.join(evidenceDirectory, 'a-create-mutant.json');
  const evidence = JSON.parse(readFileSync(target));
  evidence.status = 'environment_error';
  writeFileSync(target, JSON.stringify(evidence));
  assert.throws(() => validateRelease({ systemRoot: root, evidenceDirectory }), /mutant must fail behavior/);
});
test('reports from a prior checker cannot authorize the current release', t => {
  const root = fixture(t), evidenceDirectory = path.join(root, 'evidence');
  const target = path.join(evidenceDirectory, 'boot-start-reference.json');
  const evidence = JSON.parse(readFileSync(target));
  evidence.report.harnessDigest = '4e1e3002427fd9024161acdf2a467fe42720d2fb96710a111e7d1101d6fa9875';
  writeFileSync(target, JSON.stringify(evidence));
  assert.throws(() => validateRelease({ systemRoot: root, evidenceDirectory }), /report harness mismatch/);
});
test('a platform extension cannot relock published course content', t=>{
  const root=fixture(t),name='curriculum/r7-platform-overlay.json';
  const overlay=JSON.parse(readFileSync(path.join(root,name)));
  overlay.files['course-packs/task-manager/1.0.0/project.json']='0'.repeat(64);
  writeFileSync(path.join(root,name),JSON.stringify(overlay));
  assert.throws(()=>validateRelease({systemRoot:root,evidenceDirectory:path.join(root,'evidence')}),/may not replace published course inputs/);
});

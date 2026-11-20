import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');
const sourceDirectory = 'src/main/java/dev/codesomething/lab/';
const inventoryRoots = ['course-packs/http-json-basics', 'course-packs/sql-foundations',
  'course-packs/boot-foundations', 'course-packs/task-manager',
  'backend/src/main/resources/runner/boot', 'backend/src/main/java/dev/codesomething/boot'];
const walk = root => readdirSync(root).sort().flatMap(name => {
  const target = path.join(root, name), stat = lstatSync(target);
  assert(!stat.isSymbolicLink(), `linked release input: ${target}`);
  return stat.isDirectory() ? walk(target).map(p => `${name}/${p}`) : [name];
});

function snapshot(root, pom) {
  const paths = walk(root).sort();
  const parts = [Buffer.alloc(2), Buffer.from('boot-snapshot-v1')];
  // DataOutputStream.writeUTF prefixes the ASCII marker with its byte length.
  parts[0].writeUInt16BE(Buffer.byteLength('boot-snapshot-v1'));
  for (const name of paths) {
    const content = name === 'pom.xml' ? pom : readFileSync(path.join(root, name));
    for (const value of [Buffer.from(name), Buffer.from(content)]) {
      const length = Buffer.alloc(4); length.writeUInt32BE(value.length);
      parts.push(length, value);
    }
  }
  return sha(Buffer.concat(parts));
}

export function validateRelease({ systemRoot, evidenceDirectory }) {
  const lock = JSON.parse(readFileSync(path.join(systemRoot, 'curriculum/r34-release-lock.json')));
  assert.equal(lock.schemaVersion, 1, 'unknown release lock schema');
  // R7 extends the platform registry/dispatcher without rewriting any published
  // R3.4 course or its original lock. The old execution strategy remains locked.
  const overlayPath=path.join(systemRoot,'curriculum/r7-platform-overlay.json');
  const overlay=existsSync(overlayPath)?JSON.parse(readFileSync(overlayPath)):{files:{}};
  if(existsSync(overlayPath)) {
    assert.equal(overlay.schemaVersion,1,'unknown platform overlay schema');
    assert.equal(overlay.baseLockSha256,sha(readFileSync(path.join(systemRoot,'curriculum/r34-release-lock.json'))),'platform overlay base lock mismatch');
    const allowed=['BootCourses.java','BootCheckRunner.java','CollaborationRunner.java'].map(n=>'backend/src/main/java/dev/codesomething/boot/'+n);
    for(const name of Object.keys(overlay.files))assert(allowed.includes(name),'platform overlay may not replace published course inputs');
  }
  for (const directory of inventoryRoots) for (const name of walk(path.join(systemRoot, directory))) {
    assert(Object.hasOwn(lock.files, `${directory}/${name}`)||Object.hasOwn(overlay.files, `${directory}/${name}`), `unlocked release input: ${directory}/${name}`);
  }
  for (const [name, digest] of Object.entries({...lock.files,...overlay.files})) {
    assert(!path.isAbsolute(name) && !name.split('/').includes('..'), `invalid lock path: ${name}`);
    assert.equal(createHash('sha256').update(readFileSync(path.join(systemRoot, name))).digest('hex'), digest, `locked file changed: ${name}; publish a new version`);
  }
  const expected = {
    'boot-foundations': ['boot-start', 'boot-http', 'boot-layers', 'boot-jdbc'],
    'task-manager': ['a-read', 'a-create', 'a-update-delete', 'a-validation', 'a-pagination', 'a-transfer'],
  };
  assert.equal(lock.stages.length, 10, 'all ten published stages required');
  for (const [courseId, stages] of Object.entries(expected)) {
    assert.deepEqual(lock.stages.filter(s => s.courseId === courseId).map(s => s.stageId), stages);
    const pack = JSON.parse(readFileSync(path.join(systemRoot, 'course-packs', courseId, '1.0.0/project.json')));
    assert.equal(pack.courseId, courseId); assert.equal(pack.courseVersion, '1.0.0'); assert.equal(pack.status, 'published');
    assert.deepEqual(pack.chapters.map(c => c.stageId), stages);
    for (const chapter of pack.chapters) {
      for (const field of ['title', 'goal', 'task', 'pitfall', 'example']) assert(chapter[field]?.trim(), `${chapter.stageId}: missing ${field}`);
      for (const field of ['steps', 'requirements', 'concepts']) assert(chapter[field]?.length > 0, `${chapter.stageId}: empty ${field}`);
      assert.equal(chapter.formalQuestions.length, 2, 'two formal variants required');
      assert.equal(new Set(chapter.formalQuestions.map(q => q.id)).size, 2, 'duplicate formal question');
      for (const q of chapter.formalQuestions) {
        assert(q.prompt?.trim() && q.options.length >= 2, 'invalid formal question');
        assert(Number.isInteger(chapter.formalAnswer[q.id]) && chapter.formalAnswer[q.id] >= 0 && chapter.formalAnswer[q.id] < q.options.length, 'invalid formal answer');
      }
    }
  }
  const taskRoot = path.join(systemRoot, 'course-packs/task-manager/1.0.0');
  for (const [stage, filename, count] of [
    ['a-create', 'TaskRepository.java', 1], ['a-update-delete', 'TaskService.java', 2],
    ['a-validation', 'TaskService.java', 1], ['a-pagination', 'TaskService.java', 1],
  ]) {
    const source = readFileSync(path.join(taskRoot, stage, 'starter', sourceDirectory, filename), 'utf8');
    assert.equal(source.split('TODO: implement this stage').length - 1, count, `${stage}: missing learner implementation`);
  }
  assert.deepEqual(walk(path.join(taskRoot, 'a-transfer/starter')).sort(), ['pom.xml', `${sourceDirectory}Application.java`], 'transfer must start from minimal project');
  const rows = [];
  for (const stage of lock.stages) {
    const base = path.join(systemRoot, 'course-packs', stage.courseId, stage.version, stage.stageId);
    const jdbc = stage.stageId === 'boot-jdbc' || stage.courseId === 'task-manager';
    const resources = path.join(systemRoot, 'backend/src/main/resources/runner/boot');
    const pom = readFileSync(path.join(resources, jdbc ? 'jdbc-pom.xml' : 'pom.xml'));
    const image = JSON.parse(readFileSync(path.join(resources, jdbc ? 'jdbc-image-lock.json' : 'image-lock.json')));
    assert.equal(sha(pom), image.pomDigest, 'POM/image mismatch');
    const digest = snapshot(path.join(base, 'reference'), pom);
    assert(evidenceDirectory, 'runtime evidence directory required');
    const positive = JSON.parse(readFileSync(path.join(evidenceDirectory, `${stage.stageId}-reference.json`)));
    const negative = JSON.parse(readFileSync(path.join(evidenceDirectory, `${stage.stageId}-mutant.json`)));
    assert.equal(positive.report.snapshotDigest, digest, `${stage.stageId}: snapshot mismatch`);
    for (const evidence of [positive, negative]) {
      const report = evidence.report;
      assert.equal(report.courseVersion, stage.version, 'report version mismatch');
      assert.equal(report.stageId, stage.stageId, 'report stage mismatch');
      assert.equal(report.policy, `${stage.stageId}-v1`, 'report policy mismatch');
      assert.equal(report.image, image.image, 'report image mismatch');
      assert.equal(report.harnessDigest, stage.harnessDigest, 'report harness mismatch');
      assert(report.assertions.length > 0, 'empty runtime assertions');
    }
    assert.equal(positive.status, 'passed', 'reference must pass');
    assert.equal(positive.report.functionalPassed, true, 'reference must pass functionally');
    assert(positive.report.assertions.every(a => a.passed === true), 'reference assertion failed');
    assert.equal(negative.status, 'business_error', 'mutant must fail behavior, not compilation/environment');
    assert.equal(negative.report.functionalPassed, false, 'mutant unexpectedly passed');
    assert(negative.report.assertions.some(a => a.passed === false), 'mutant has no failed assertion');
    assert.notEqual(negative.report.snapshotDigest, digest, 'mutant must differ from reference');
    rows.push({ courseId: stage.courseId, stageId: stage.stageId, version: stage.version,
      scaffolding: stage.scaffolding, snapshotDigest: digest, image: image.image, harnessDigest: stage.harnessDigest,
      reference: positive.status, mutant: negative.status,
      referenceReportSha256: sha(readFileSync(path.join(evidenceDirectory, `${stage.stageId}-reference.json`))),
      mutantReportSha256: sha(readFileSync(path.join(evidenceDirectory, `${stage.stageId}-mutant.json`))) });
  }
  return { status: 'passed', checkedAt: new Date().toISOString(),
    releaseLockSha256: sha(readFileSync(path.join(systemRoot, 'curriculum/r34-release-lock.json'))),
    lockedFiles: Object.keys(lock.files).length, stages: rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const systemRoot = fileURLToPath(new URL('../../', import.meta.url));
  const index = process.argv.indexOf('--evidence');
  const evidenceDirectory = index < 0 ? path.join(systemRoot, 'docs/acceptance/R3.4/strategies') : path.resolve(process.argv[index + 1]);
  try {
    const result = validateRelease({ systemRoot, evidenceDirectory });
    if (process.argv.includes('--record')) {
      const directory = path.join(systemRoot, 'docs/acceptance/R3.4'); mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'gate.json'), JSON.stringify(result, null, 2) + '\n');
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (process.argv.includes('--record')) {
      const directory = path.join(systemRoot, 'docs/acceptance/R3.4'); mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'gate.json'), JSON.stringify({ status: 'rejected', checkedAt: new Date().toISOString(), reason: error.message }, null, 2) + '\n');
    }
    console.error(`Release gate rejected: ${error.message}`); process.exitCode = 1;
  }
}

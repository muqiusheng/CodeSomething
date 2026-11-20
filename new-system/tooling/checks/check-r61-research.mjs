import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateCatalog(catalog, root) {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.status, 'research-only');
  assert(catalog.sources.length > 0, 'sources required');
  const ids = new Set();
  for (const source of catalog.sources) {
    assert(!ids.has(source.id), 'duplicate source id'); ids.add(source.id);
    assert(/^[\w-]+\/[\w.-]+$/.test(source.repository), 'repository url invalid');
    assert.equal(source.url, `https://github.com/${source.repository}`, 'source url mismatch');
    assert(/^[a-f0-9]{40}$/.test(source.revision), 'revision must be a commit SHA');
    assert(Number.isFinite(Date.parse(source.retrievedAt)), 'retrieval date invalid');
    assert(Number.isFinite(Date.parse(source.upstreamCommitDate)), 'commit date invalid');
    assert.equal(source.status, 'research-only');
    assert.equal(source.observation.buildStatus, 'not-run');
    assert(source.license?.spdx && source.license?.evidenceId, `${source.id}: license evidence required`);
    const contents = new Map();
    for (const evidence of source.evidence) {
      assert(!contents.has(evidence.id), 'duplicate evidence id');
      const allowed = [`https://api.github.com/repos/${source.repository}`, `https://raw.githubusercontent.com/${source.repository}/${source.revision}/`];
      assert(evidence.url === allowed[0] || evidence.url.startsWith(`${allowed[0]}/`) || evidence.url.startsWith(allowed[1]), 'evidence url/revision mismatch');
      if (evidence.file.endsWith('tree.json')) assert(evidence.url.includes(source.revision), 'tree url/revision mismatch');
      const file = path.resolve(root, evidence.file);
      const relative = path.relative(root, file);
      assert(!relative.startsWith('..') && !path.isAbsolute(relative), 'evidence path escapes workspace');
      const data = readFileSync(file);
      assert.equal(createHash('sha256').update(data).digest('hex'), evidence.sha256, `${source.id}: digest mismatch`);
      assert.equal(data.length, evidence.bytes, `${source.id}: evidence bytes mismatch`);
      contents.set(evidence.id, data.toString('utf8'));
    }
    const commit = source.evidence.find(e => e.file.endsWith('/commit.json'));
    assert(commit && JSON.parse(contents.get(commit.id)).sha === source.revision, 'commit revision mismatch');
    assert(contents.get(source.license.evidenceId)?.includes('Apache License'), `${source.id}: license content missing`);
    assert.equal(source.license.spdx, 'Apache-2.0', 'license requires manual review for other identifiers');
    for (const mapping of source.capabilityMappings) {
      assert(/^[a-z0-9-]+$/.test(mapping.courseId), 'stage course id invalid');
      assert(/^\d+\.\d+\.\d+$/.test(mapping.courseVersion), 'stage course version invalid');
      const course = JSON.parse(readFileSync(path.join(root, 'new-system/course-packs', mapping.courseId, mapping.courseVersion, 'project.json'), 'utf8'));
      assert.equal(course.status, 'published', 'stage course must be published');
      assert(course.chapters.some(c => c.stageId === mapping.stageId), `unknown stage ${mapping.stageId}`);
      assert.equal(mapping.kind, 'inference', 'stage mapping is a teaching inference');
      assert(mapping.anchor?.trim() && contents.get(mapping.evidenceId)?.includes(mapping.anchor), 'evidence anchor missing');
    }
  }
  return { status: 'passed', sources: catalog.sources.length };
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = JSON.parse(readFileSync(path.join(root, 'new-system/research/catalog.json'), 'utf8'));
  console.log(JSON.stringify({ ...validateCatalog(catalog, root), scope: 'R6.1 offline research integrity; upstream build not run', evidenceFiles: catalog.sources.reduce((n, s) => n + s.evidence.length, 0), capabilityMappings: catalog.sources.reduce((n, s) => n + s.capabilityMappings.length, 0) }, null, 2));
}

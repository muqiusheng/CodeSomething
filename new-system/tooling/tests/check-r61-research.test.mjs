import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../checks/check-r61-research.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = () => JSON.parse(readFileSync(new URL('../../research/catalog.json', import.meta.url), 'utf8'));

test('完整归档可离线读取且不需要联网或启动运行器', () => {
  assert.equal(validateCatalog(load(), root).sources, 3);
});

test('拒绝缺少许可证据的研究来源', () => {
  const catalog = load();
  delete catalog.sources[0].license;
  assert.throws(() => validateCatalog(catalog, root), /license/);
});

test('拒绝摘要不符的本地来源证据', () => {
  const catalog = load();
  catalog.sources[0].evidence[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateCatalog(catalog, root), /digest/);
});

test('研究归档不能冒充已发布或已构建课程', () => {
  for (const mutate of [c => c.status = 'published', c => c.sources[0].status = 'published', c => c.sources[0].observation.buildStatus = 'passed']) {
    const catalog = load();
    mutate(catalog);
    assert.throws(() => validateCatalog(catalog, root), /research-only|not-run/);
  }
});

test('能力映射必须指向已发布课程的真实关卡及存在的证据锚点', () => {
  for (const mutate of [c => c.sources[0].capabilityMappings[0].stageId = 'imaginary-stage', c => c.sources[0].capabilityMappings[0].anchor = 'this text does not exist', c => c.sources[0].license.evidenceId = 'missing']) {
    const catalog = load();
    mutate(catalog);
    assert.throws(() => validateCatalog(catalog, root), /stage|anchor|license/);
  }
});

test('来源身份、日期和固定提交必须完整且互相一致', () => {
  for (const mutate of [
    c => c.sources[0].revision = 'main',
    c => c.sources[0].revision = '0'.repeat(40),
    c => c.sources[0].retrievedAt = 'yesterday',
    c => c.sources[0].evidence.at(-1).url = 'https://raw.githubusercontent.com/other/repo/main/example.java',
    c => c.sources[0].evidence[0].id = c.sources[0].evidence[1].id,
    c => c.sources[1].id = c.sources[0].id,
  ]) {
    const catalog = load();
    mutate(catalog);
    assert.throws(() => validateCatalog(catalog, root), /revision|date|url|duplicate/);
  }
});

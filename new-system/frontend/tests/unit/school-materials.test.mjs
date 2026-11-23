import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchSourceTables} from '../../src/features/school/source-tables.mjs';

const loadLab = id => JSON.parse(readFileSync(new URL(
  '../../../course-packs/school/database-systems/labs/' + id + '.json', import.meta.url), 'utf8'));
const workbench = loadLab('lab-01-workbench');
const titles = (question, lab = workbench) => matchSourceTables(lab.sourceTables, question).map(table => table.title.split(' · ')[0]);

test('connection tasks keep the structure and seed tables behind the all-tables option', () => {
  assert.deepEqual(titles(workbench.questions[0]), []);
});

test('building the three tables shows the original definitions', () => {
  assert.deepEqual(titles(workbench.questions[1]), ['表 2', '表 3', '表 4']);
});

test('a course-only update shows course data without matching substrings in SQL identifiers', () => {
  assert.deepEqual(titles({title: '修改课程学分', requirement: 'UPDATE Course，比较 discount 和 student_info 两个名称。'}), ['表 6']);
});

test('the department-average task keeps its original output format', () => {
  const procedures = loadLab('lab-06-procedures');
  assert.equal(matchSourceTables(procedures.sourceTables, procedures.questions[1]).length, 1);
  assert.equal(matchSourceTables(procedures.sourceTables, procedures.questions[0]).length, 0);
});

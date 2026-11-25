import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchSourceTables} from '../../src/features/school/source-tables.mjs';
import {formatReferenceSql} from '../../src/features/school/reference-sql.mjs';

test('reference SQL keeps short projections inline and leaves long lists indented', () => {
  assert.equal(formatReferenceSql('SELECT Sno, Cno, Grade FROM sc WHERE Grade > 80;'),
    'SELECT Sno, Cno, Grade\nFROM sc\nWHERE Grade > 80;');
  const long = formatReferenceSql('SELECT student_number, student_first_name, student_last_name, course_registration_date FROM enrollment;');
  assert.match(long, /^SELECT\n  student_number,\n  student_first_name,/);
  const literal = "'example\nSELECT\n  Sno,\n  Cno\nFROM\n  sc'";
  assert.ok(formatReferenceSql('SELECT ' + literal + ';').includes(literal));
});

test('reference SQL starts each query clause on a new line and preserves quoted content', () => {
  const formatted = formatReferenceSql("SELECT s.Sno FROM student s LEFT JOIN sc ON s.Sno=sc.Sno WHERE s.Sname LIKE '张% FROM JOIN' GROUP BY s.Sno HAVING COUNT(*)>0 ORDER BY s.Sno LIMIT 1;");
  for (const clause of ['FROM', 'LEFT JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT']) {
    assert.match(formatted, new RegExp('\\n *' + clause + '\\b'));
  }
  assert.ok(formatted.includes("'张% FROM JOIN'"));
});

test('reference SQL preserves MySQL delimiter lines and cursor-loop labels', () => {
  const paper = JSON.parse(readFileSync(new URL(
    '../../../course-packs/school/database-systems/exams/exam-lab-06.json', import.meta.url), 'utf8'));
  const source = paper.questions.find(question => question.referenceSql?.includes('warehouse_chain')).referenceSql;
  const formatted = formatReferenceSql(source);
  assert.match(formatted, /^DELIMITER \$\$\n/);
  assert.match(formatted, /\n {2}SELECT DISTINCT warehouse\n {2}FROM Stock\b/);
  assert.match(formatted, /\n {2}read_warehouses: LOOP\n {4}FETCH\b/);
  assert.match(formatted, /\n {2}END LOOP;\n {2}CLOSE warehouses;\nEND\$\$\nDELIMITER ;$/);
});

const loadLab = id => JSON.parse(readFileSync(new URL(
  '../../../course-packs/school/database-systems/labs/' + id + '.json', import.meta.url), 'utf8'));
const workbench = loadLab('lab-01-workbench');
const titles = (question, lab = workbench) => matchSourceTables(lab.sourceTables, question).map(table => table.title.split(' · ')[0]);

test('connection tasks keep the structure and seed tables behind the all-tables option', () => {
  assert.equal(workbench.questions.some(question=>['q01','q06'].includes(question.id)),false);
  const ddl = loadLab('lab-02-ddl-tables');
  assert.deepEqual(titles(ddl.questions.find(question=>question.id==='q01'), ddl), []);
});

test('each Workbench creation task exposes only its target table definition', () => {
  const creations = workbench.questions.filter(question=>question.id.startsWith('q02'));
  assert.deepEqual(creations.map(create=>{
    const [summary, ...definitions] = create.requirement.split('\n\n### 涉及数据表：');
    assert.equal(definitions.length, 1);
    assert.match(summary, /创建 (student|course|sc)/);
    return definitions[0].match(/^\| \x60/gm)?.length;
  }), [7,4,3]);
});

test('a course-only update shows course data without matching substrings in SQL identifiers', () => {
  assert.deepEqual(titles({title: '修改课程学分', requirement: 'UPDATE Course，比较 discount 和 student_info 两个名称。'}), ['表 6']);
});

test('the department-average task keeps its original output format', () => {
  const procedures = loadLab('lab-06-procedures');
  assert.equal(matchSourceTables(procedures.sourceTables, procedures.questions[1]).length, 1);
  assert.equal(matchSourceTables(procedures.sourceTables, procedures.questions[0]).length, 0);
});

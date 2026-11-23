import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRows, resultCsv, resultMarkdown} from '../../src/features/school/result-grid.mjs';

test('filters returned values case-insensitively and exports exactly the matching rows', () => {
  const columns = ['课程', '备注'];
  const rows = [['SQL', '逗号, 引号"'], ['Java', null]];
  const filtered = filterRows(rows, ' sql ');
  assert.deepEqual(filtered, [rows[0]]);
  assert.equal(resultCsv(columns, filtered), '"课程","备注"\r\n"SQL","逗号, 引号"""\r\n');
  assert.equal(resultMarkdown(['a|b', 'note'], [['x\ny', null]]), '| a\\|b | note |\n| --- | --- |\n| x<br>y | NULL |');
});

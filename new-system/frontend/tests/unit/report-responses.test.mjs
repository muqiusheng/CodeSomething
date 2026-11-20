import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportResponses} from '../../src/features/learning/shared/report-responses.ts';
test('response experience uses actual JSON and does not invent a body for old smoke reports',()=>{
 const rows=reportResponses([{name:'GET /api/tasks/1 状态码',actual:'HTTP 200',passed:true},{name:'GET /api/tasks/1 JSON字段',actual:'{"id":1,"title":"我的接口","completed":"false"}',passed:false}]);
 assert.equal(rows.length,1);assert.equal(rows[0].status,200);assert.equal(rows[0].data.completed,'false');
 assert.equal(reportResponses([{name:'GET /api/tasks/1',actual:'HTTP 200',passed:true}])[0].data,null);
 assert.equal(reportResponses([{name:'编译',actual:'编译成功',passed:true}]).length,0);
});

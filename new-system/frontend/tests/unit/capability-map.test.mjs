import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCapability} from '../../src/features/profile/capability-map.mjs';
test('unknown skills stay unverified and partial course evidence does not mark a whole capability verified',()=>{
 const capability={stages:['a-read','a-create']};
 assert.equal(summarizeCapability(capability,[]).state,'unverified');
 assert.equal(summarizeCapability(capability,[{skill:{stageId:'a-read'},state:'verified',evidence:[]}]).state,'in-progress');
 assert.equal(summarizeCapability(capability,[{skill:{stageId:'a-read'},state:'verified',evidence:[]},{skill:{stageId:'a-create'},state:'assisted',evidence:[]}]).state,'assisted');
 assert.equal(summarizeCapability(capability,[{skill:{stageId:'a-read'},state:'needs-review',evidence:[]}]).state,'needs-review');
});

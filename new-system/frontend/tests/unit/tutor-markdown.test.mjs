import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownBlocks} from '../../src/features/tutor/tutor-markdown.mjs';
test('tutor formats lists and streaming code as text blocks without interpreting HTML',()=>{
 assert.deepEqual(markdownBlocks('先看**状态**\n\n- 保存\n- 运行\n\n```java\nSystem.out.println("<script>");'),[
  {kind:'paragraph',text:'先看**状态**'}, {kind:'list',items:['保存','运行']}, {kind:'code',text:'System.out.println("<script>");',language:'java'}
 ]);
});

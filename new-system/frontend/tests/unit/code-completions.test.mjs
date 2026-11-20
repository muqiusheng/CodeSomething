import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completionCandidates} from '../../src/components/code/completions.ts';
test('Java member suggestions match the receiver and never insert whole project answers',()=>{
 const items=completionCandidates('java','exchange.','class TaskServer {}');
 assert(items.some(x=>x.label==='getRequestURI'));
 assert(items.some(x=>x.label==='sendResponseHeaders'));
 assert(!items.some(x=>x.label==='@GetMapping'));
 assert(!items.some(x=>x.insertText.includes('学习 HTTP')));
 assert(completionCandidates('java','server.','').some(x=>x.label==='createContext'));
 assert(!completionCandidates('sql','SELECT ','').some(x=>x.label==='createContext'));
});

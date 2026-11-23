import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sessionState} from '../../src/api/browser-state.mjs';
import {createLearnerReadCache} from '../../src/api/learner-read-cache.ts';

test('switching accounts and signing out discard cached reads and pending results', async () => {
 const cache=createLearnerReadCache('student:a');
 await cache.load('progress',()=>({done:1}));
 let finish;
 const pending=cache.load('resume',()=>new Promise(resolve=>{finish=resolve}));
 await Promise.resolve();
 cache.setScope('student:b');
 assert.equal(cache.read('progress').data,null);
 await cache.load('resume',()=>({lesson:2}));
 finish({lesson:1});
 await pending;
 assert.deepEqual(cache.read('resume').data,{lesson:2});
 cache.setScope('guest');
 assert.equal(cache.read('resume').data,null);
 cache.setScope('student:a');
 assert.equal(cache.read('progress').data,null);
});

test('equal data and a failed revalidation leave the displayed snapshot untouched', async () => {
 const cache=createLearnerReadCache('local');
 await cache.load('resume',()=>({lesson:1}));
 const snapshot=cache.read('resume');
 await cache.load('resume',()=>({lesson:1}),'explicit');
 await cache.load('resume',()=>{throw new Error('offline')},'explicit');
 assert.equal(cache.read('resume'),snapshot);
 await cache.load('reviews',()=>{throw new Error('offline')});
 assert.equal(cache.read('reviews').error,'offline');
 await cache.load('reviews',()=>[], 'explicit');
 assert.deepEqual(cache.read('reviews').data,[]);
});

test('focus cools down per path and joins in-flight reads while explicit changes take priority', async () => {
 let now=0;
 let calls=0;
 let finish;
 const cache=createLearnerReadCache('local',()=>now);
 await cache.load('progress',()=>++calls);
 now=19_999;
 await cache.load('progress',()=>++calls,'focus');
 assert.equal(calls,1);
 now=20_000;
 const pending=cache.load('progress',()=>new Promise(resolve=>{finish=resolve}));
 assert.equal(cache.load('progress',()=>++calls,'focus'),pending);
 assert.equal(cache.load('progress',()=>++calls),pending);
 await Promise.resolve();
 const event=new Event('learning-progress');
 const updated=cache.load('progress',()=>++calls,event);
 assert.equal(cache.load('progress',()=>++calls,event),updated);
 await updated;
 finish(99);
 await pending;
 assert.equal(cache.read('progress').data,2);
 now=40_000;
 await cache.load('progress',()=>++calls,'focus');
 assert.equal(calls,3);
});

test('persisted data restores before a request, revalidates once, and is purged on an account change', async t => {
 const values=new Map();
 t.mock.method(sessionState,'getItem',(key,scope)=>values.get(scope+':'+key)??null);
 t.mock.method(sessionState,'setItem',(key,value,scope)=>values.set(scope+':'+key,value));
 t.mock.method(sessionState,'removeItem',(key,scope)=>values.delete(scope+':'+key));
 const options={persist:true};
 const original=createLearnerReadCache('student:a');
 await original.load('resume',()=>({lesson:1}),'mount',options);
 const freshDocument=createLearnerReadCache('student:a');
 const restored=freshDocument.read('resume',options);
 assert.deepEqual(restored.data,{lesson:1});
 let calls=0;
 await freshDocument.load('resume',()=>{calls++;return {lesson:1}},'mount',options);
 assert.equal(calls,1);
 assert.equal(freshDocument.read('resume',options),restored);
 freshDocument.setScope('student:b');
 assert.equal(freshDocument.read('resume',options).data,null);
 await freshDocument.load('resume',()=>({lesson:2}),'mount',options);
 freshDocument.setScope(null);
 assert.equal(createLearnerReadCache('student:a').read('resume',options).data,null);
 assert.equal(createLearnerReadCache('student:b').read('resume',options).data,null);
});

test('warm navigation skips requests until stale while events and manual refresh bypass freshness', async () => {
 let calls=0;
 let time=0;
 const cache=createLearnerReadCache('local',()=>time);
 const request=()=>++calls;
 await cache.load('resume',request);
 time=19_000;
 await cache.load('resume',request);
 assert.equal(calls,1);
 await cache.load('resume',request,new Event('learning-progress'));
 assert.equal(cache.read('resume').data,2);
 await cache.load('resume',request,'explicit');
 assert.equal(cache.read('resume').data,3);
 time=39_000;
 await cache.load('resume',request);
 assert.equal(cache.read('resume').data,4);
});

test('a confirmed write wins over an earlier read and updates the restored snapshot', async t => {
 const values=new Map();
 t.mock.method(sessionState,'getItem',(key,scope)=>values.get(scope+':'+key)??null);
 t.mock.method(sessionState,'setItem',(key,value,scope)=>values.set(scope+':'+key,value));
 t.mock.method(sessionState,'removeItem',(key,scope)=>values.delete(scope+':'+key));
 const options={persist:true};
 const cache=createLearnerReadCache('student:a');
 let finish;
 const pending=cache.load('work',()=>new Promise(resolve=>{finish=resolve}),'mount',options);
 await Promise.resolve();
 cache.replace('work',{revision:2},'student:a',options);
 finish({revision:1});
 await pending;
 assert.deepEqual(createLearnerReadCache('student:a').read('work',options).data,{revision:2});
 const switched=createLearnerReadCache(null);
 switched.setScope('student:b');
 assert.equal(switched.read('work',options).data,null);
 assert.equal(createLearnerReadCache('student:a').read('work',options).data,null);
});

test('completion revalidates a previously visited resource before the next mount', async () => {
 const cache=createLearnerReadCache('student:a');
 let saved=1;
 let reads=0;
 const request=()=>{reads++;return {done:saved}};
 await cache.load('progress',request);
 saved=2;
 await cache.revalidateKnown(key=>key==='progress',new Event('learning-progress'));
 assert.deepEqual(cache.read('progress').data,{done:2});
 await cache.load('progress',request);
 assert.equal(reads,2);
});

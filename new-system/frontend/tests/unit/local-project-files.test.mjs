import test from 'node:test';
import assert from 'node:assert/strict';
import {listDirectory,readText,saveText,collectCheckFiles} from '../../src/features/learning/shared/local-project-files.mjs';

const file=(name,initial)=>{let value=initial;return {kind:'file',name,getFile:async()=>({size:new TextEncoder().encode(value).length,text:async()=>value}),createWritable:async()=>({write:async text=>{value=text},close:async()=>{}})}};
const dir=(name,children)=>({kind:'directory',name,async *values(){yield* children},getFileHandle:async name=>{const found=children.find(c=>c.name===name&&c.kind==='file');if(!found)throw new Error('Not found');return found},getDirectoryHandle:async name=>{const found=children.find(c=>c.name===name&&c.kind==='directory');if(!found)throw new Error('Not found');return found}});
test('whole directory is visible, while submission reads only chapter sources and save refuses external conflicts',async()=>{
 const source=file('TaskServer.java','class TaskServer {}');
 const root=dir('my-project',[source,file('notes.md','private notes'),dir('target',[file('result.class','binary')])]);
 assert.deepEqual((await listDirectory(root)).map(e=>e.name),['target','notes.md','TaskServer.java']);
 assert.equal(await readText(root,'notes.md'),'private notes');
 assert.deepEqual(await collectCheckFiles(root,'http-json-basics'),{'TaskServer.java':'class TaskServer {}'});
 await saveText(root,'TaskServer.java','class TaskServer {}','class TaskServer { int n; }');
 assert.equal(await readText(root,'TaskServer.java'),'class TaskServer { int n; }');
 await assert.rejects(saveText(root,'TaskServer.java','class TaskServer {}','overwrite'),/已被IDE/);
 await assert.rejects(readText(root,'../outside.java'),/路径/);
});
test('a normal Maven project collects nested packages, tests and runtime resources without identity assumptions',async()=>{
 const root=dir('my-boot',[file('pom.xml','<project/>'),file('.env','secret'),dir('src',[dir('main',[dir('java',[dir('com',[dir('example',[file('MyBootApplication.java','my startup')])])]),dir('resources',[file('application.yml','name: demo'),dir('static',[file('index.html','<main>Hello</main>')]),file('logo.png','binary')])]),dir('test',[dir('java',[dir('com',[file('ApiTest.java','my tests')])])])])]);
 assert.deepEqual(await collectCheckFiles(root,'boot-foundations'),{'pom.xml':'<project/>','src/main/java/com/example/MyBootApplication.java':'my startup','src/main/resources/application.yml':'name: demo','src/main/resources/static/index.html':'<main>Hello</main>','src/test/java/com/ApiTest.java':'my tests'});
});
test('binary bytes are not silently decoded into an editable corrupted text file',async()=>{
 const root=dir('project',[{kind:'file',name:'data.bin',getFile:async()=>({size:1,text:async()=>'�',arrayBuffer:async()=>new Uint8Array([255]).buffer})}]);
 await assert.rejects(readText(root,'data.bin'),/UTF-8|二进制/);
});

test('a file replaced during IDE save is reacquired before reporting failure',async()=>{
 let tries=0;const root=dir('project',[]);
 root.getFileHandle=async()=>{if(++tries===1)throw new DOMException('temporarily missing','NotFoundError');return file('TaskServer.java','new source')};
 assert.equal(await readText(root,'TaskServer.java'),'new source');assert.equal(tries,2);
});

test('permission denial identifies src and cannot be mistaken for a missing optional folder',async()=>{
 const root=dir('project',[]);root.getDirectoryHandle=async()=>{throw new DOMException('denied','NotAllowedError')};
 await assert.rejects(collectCheckFiles(root,'boot-foundations'),e=>e.name==='NotAllowedError'&&e.message.includes('src')&&e.message.includes('权限'));
});
test('a snapshot rejects continuously changing source rather than combining versions',async()=>{
 let revision=0;const root=dir('project',[]);root.getFileHandle=async()=>file('TaskServer.java',String(++revision));
 await assert.rejects(collectCheckFiles(root,'http-json-basics'),/持续变化/);
});

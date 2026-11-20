import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tliasChapters,tliasStarter,parseTliasDraft,validTliasPath} from '../../src/features/learning/tlias/tlias-course.ts';

test('corrupt saved work is reported instead of silently replaced with starter code',()=>{
 assert.throws(()=>parseTliasDraft('{broken'));
 assert.throws(()=>parseTliasDraft('{"../outside.java":"oops"}'));
 assert.throws(()=>parseTliasDraft('[]'));
 const saved={...tliasStarter,'src/main/java/dev/codesomething/tlias/Dept.java':'// my implementation'};
 assert.deepEqual(parseTliasDraft(JSON.stringify(saved)),saved);
 assert(!Object.keys(parseTliasDraft(null)).some(p=>p.includes('Controller')));
});

test('project export paths support the full stack without escaping its directory',()=>{
 for(const p of ['src/main/resources/schema.sql','src/main/java/dev/codesomething/tlias/Dept.java','src/test/java/dev/codesomething/tlias/BusinessTest.java','web/src/views/DeptView.vue','web/package.json','notes/requests.http','deploy/compose.yml','Dockerfile'])assert(validTliasPath(p),p);
 for(const p of ['C:/outside.java','/etc/a.sql','notes/../outside.sql','src//main/a.java','notes/a.exe','notes/./a.sql'])assert(!validTliasPath(p),p);
});

test('teaching references point to imported, byte-verified source files and real PDF pages',()=>{
 const root=new URL('../../public/materials/tlias/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(new URL(file.id,root))).digest('hex'),file.sha256);
 for(const chapter of tliasChapters){
  if(chapter.reading){const pdf=manifest.files.find(f=>f.id===chapter.reading.file);assert(pdf);assert(chapter.reading.page>=1&&chapter.reading.page<=pdf.pages)}
  assert(chapter.steps.every(s=>s.file&&s.why&&s.action&&s.expected&&s.pitfall));
  assert(!JSON.stringify(chapter).includes('\u200b'));
 }
});

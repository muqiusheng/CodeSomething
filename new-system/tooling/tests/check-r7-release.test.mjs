import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {validateR7} from '../checks/check-r7-release.mjs';
import {spawnSync} from 'node:child_process';
const system=fileURLToPath(new URL('../../',import.meta.url));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-r7-release-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const lock=JSON.parse(fs.readFileSync(path.join(system,'curriculum/r7-release-lock.json')));
 const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target)};
 for(const name of [...Object.keys(lock.files),'backend/src/main/resources/runner/boot/jdbc-pom.xml','backend/src/main/resources/runner/boot/jdbc-image-lock.json'])copy(path.join(system,name),path.join(root,name));
 const classes=path.join(root,'classes');copy(path.join(system,'runtime/r7-final-build/target/classes/dev/codesomething/boot/CollaborationRunner.class'),path.join(classes,'dev/codesomething/boot/CollaborationRunner.class'));
 const evidence=path.join(root,'evidence');fs.mkdirSync(evidence);for(const name of fs.readdirSync(path.join(system,'docs/acceptance/R7/strategies-final')))copy(path.join(system,'docs/acceptance/R7/strategies-final',name),path.join(evidence,name));
 return {root,classes,evidence,lock};
}
test('eight exact reference and behavioral-mutation pairs authorize R7 release',t=>{
 const input=fixture(t),result=validateR7(input);assert.equal(result.status,'passed');assert.equal(result.stages.length,8);
});
test('same-version R7 teaching changes are rejected',t=>{
 const input=fixture(t),name=path.join(input.root,'course-packs/collaboration/1.0.0/project.json');fs.appendFileSync(name,' ');assert.throws(()=>validateR7(input),/Locked R7 input changed/);
});
test('old checker evidence cannot authorize the final R7 build',t=>{
 const input=fixture(t),name=path.join(input.evidence,'b-login-reference.json'),value=JSON.parse(fs.readFileSync(name));value.report.harnessDigest='0'.repeat(64);fs.writeFileSync(name,JSON.stringify(value));assert.throws(()=>validateR7(input),/Stale checker evidence/);
});
test('a report for a different source snapshot is rejected',t=>{
 const input=fixture(t),name=path.join(input.evidence,'b-login-reference.json'),value=JSON.parse(fs.readFileSync(name));value.report.snapshotDigest='1'.repeat(64);fs.writeFileSync(name,JSON.stringify(value));assert.throws(()=>validateR7(input),/Stale reference snapshot/);
});
test('environment failure does not count as detecting a transaction bug',t=>{
 const input=fixture(t),name=path.join(input.evidence,'b-transaction-mutant.json'),value=JSON.parse(fs.readFileSync(name));value.status='environment_error';fs.writeFileSync(name,JSON.stringify(value));assert.throws(()=>validateR7(input),/Mutant must fail behavior/);
});
test('the authoring entry refuses to overwrite a locked R7 package',t=>{
 const input=fixture(t);fs.mkdirSync(path.join(input.root,'tooling'),{recursive:true});
 fs.copyFileSync(path.join(system,'tooling/create-r7-course.py'),path.join(input.root,'tooling/create-r7-course.py'));
 fs.writeFileSync(path.join(input.root,'curriculum/r7-release-lock.json'),JSON.stringify(input.lock));
 const result=spawnSync('python',[path.join(input.root,'tooling/create-r7-course.py')],{encoding:'utf8',windowsHide:true});assert.notEqual(result.status,0);assert.match(result.stderr,/R7 is locked/);
});

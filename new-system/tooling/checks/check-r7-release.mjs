import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const stages=['b-login','b-roles','b-plans','b-pagination','b-transaction','b-errors-logs','b-tests','b-deploy'];
const sourceDirectory='src/main/java/dev/codesomething/lab/';
const runner='backend/src/main/java/dev/codesomething/boot/CollaborationRunner.java';
function files(root){return fs.readdirSync(root).sort().flatMap(name=>{const target=path.join(root,name),s=fs.lstatSync(target);assert(!s.isSymbolicLink(),'Release inputs must not be links');return s.isDirectory()?files(target).map(f=>name+'/'+f):[name]})}
const inventory=['course-packs/collaboration/1.0.0','backend/src/main/resources/runner/collaboration'];
const extra=[runner,'backend/src/main/java/dev/codesomething/boot/BootCourses.java','backend/src/main/java/dev/codesomething/boot/BootCheckRunner.java','backend/src/main/java/dev/codesomething/learning/UnderstandingRules.java','backend/src/main/java/dev/codesomething/learning/UnderstandingController.java','backend/src/main/java/dev/codesomething/profile/LearnerController.java','backend/src/main/java/dev/codesomething/profile/ReviewQuestions.java','tooling/deploy-r7.ps1','tooling/new-boot-workspace.ps1','curriculum/r7-platform-overlay.json'];
export function releaseInventory(root){return [...inventory.flatMap(directory=>files(path.join(root,directory)).map(n=>directory+'/'+n)),...extra].sort()}
function snapshot(root,pom){const parts=[Buffer.from([0,16]),Buffer.from('boot-snapshot-v1')];for(const name of files(root).sort()){for(const value of [Buffer.from(name),name==='pom.xml'?pom:fs.readFileSync(path.join(root,name))]){const length=Buffer.alloc(4);length.writeUInt32BE(value.length);parts.push(length,value)}}return sha(Buffer.concat(parts))}
function harness(root,classes,stage){
 const read=name=>fs.readFileSync(path.join(root,name));
 const code=path.join(classes,'dev/codesomething/boot/CollaborationRunner.class');
 let implementation=sha(fs.readFileSync(code));
 if(['b-tests','b-deploy'].includes(stage))for(const name of ['Application','AuthService','PlanService','BusinessController','Problem','ApiErrors','RequestLog'])implementation+=sha(read('backend/src/main/resources/runner/collaboration/mutation/'+name+'.java'));
 const seed="DROP USER IF EXISTS 'root'@'%'; CREATE DATABASE cs_lab CHARACTER SET utf8mb4; CREATE USER 'learner'@'%' IDENTIFIED BY '<per-job-secret>'; GRANT SELECT,INSERT,UPDATE,DELETE ON cs_lab.* TO 'learner'@'%'; USE cs_lab; "+read('backend/src/main/resources/runner/collaboration/seed.sql').toString('utf8');
 const mysql='mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902';
 return sha(sha(read('backend/src/main/resources/runner/collaboration/R7Probe.java'))+sha(read('backend/src/main/resources/runner/boot/jdbc-image-lock.json'))+stage+'-v1'+seed+mysql+implementation);
}
export function validateR7({root,classes,evidence,lock}){
 assert.equal(lock.schemaVersion,1);
 assert.deepEqual(Object.keys(lock.files).sort(),releaseInventory(root),'Release input inventory differs');
 for(const [name,digest] of Object.entries(lock.files))assert.equal(sha(fs.readFileSync(path.join(root,name))),digest,'Locked R7 input changed: '+name);
 assert.equal(sha(fs.readFileSync(path.join(classes,'dev/codesomething/boot/CollaborationRunner.class'))),lock.runnerClassSha256,'Checker class changed');
 const project=JSON.parse(fs.readFileSync(path.join(root,'course-packs/collaboration/1.0.0/project.json')));
 assert.equal(project.courseId,'collaboration');assert.equal(project.status,'published');assert.deepEqual(project.chapters.map(c=>c.stageId),stages);
 const pom=fs.readFileSync(path.join(root,'backend/src/main/resources/runner/boot/jdbc-pom.xml'));
 const image=JSON.parse(fs.readFileSync(path.join(root,'backend/src/main/resources/runner/boot/jdbc-image-lock.json')));assert.equal(sha(pom),image.pomDigest);
 const rows=[];
 for(const [index,c] of project.chapters.entries()){
  assert(c.minutes>0&&c.minutes<=60,'One-hour learning scope');assert(c.concepts.length>=3&&c.concepts.every(x=>x.body.length>=80),'Substantive teaching required');assert(c.requirements.length>=3);
  assert.deepEqual(c.dependsOn,index?[stages[index-1]]:[],'Acyclic ordered prerequisites');assert.equal(c.formalQuestions.length,2);
  for(const q of c.formalQuestions)assert(q.options.length>c.formalAnswer[q.id]&&c.formalAnswer[q.id]>=0);
  const reference=path.join(root,'course-packs/collaboration/1.0.0',c.stageId,'reference');
  const digest=snapshot(reference,pom),h=harness(root,classes,c.stageId);
  const positive=JSON.parse(fs.readFileSync(path.join(evidence,c.stageId+'-reference.json'))),negative=JSON.parse(fs.readFileSync(path.join(evidence,c.stageId+'-mutant.json')));
  for(const result of [positive,negative]){assert.equal(result.report.harnessDigest,h,'Stale checker evidence: '+c.stageId);assert.equal(result.report.policy,c.stageId+'-v1');assert.equal(result.report.image,image.image);assert.equal(result.report.courseVersion,'1.0.0');assert.equal(result.report.stageId,c.stageId)}
  assert.equal(positive.report.snapshotDigest,digest,'Stale reference snapshot: '+c.stageId);assert.equal(positive.status,'passed');assert(positive.report.functionalPassed&&positive.report.assertions.every(a=>a.passed));
  assert.equal(negative.status,'business_error','Mutant must fail behavior: '+c.stageId);assert(!negative.report.functionalPassed&&negative.report.assertions.some(a=>!a.passed));assert.notEqual(negative.report.snapshotDigest,digest);
  rows.push({stage:c.stageId,reference:positive.status,mutant:negative.status,assertions:positive.report.assertions.length,harnessDigest:h,snapshotDigest:digest});
 }
 assert.deepEqual(files(path.join(root,'course-packs/collaboration/1.0.0/b-deploy/starter')).sort(),['pom.xml',sourceDirectory+'Application.java']);
 return {status:'passed',checkedAt:new Date().toISOString(),lockedFiles:Object.keys(lock.files).length,runnerClassSha256:lock.runnerClassSha256,stages:rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../../',import.meta.url)),classes=path.join(root,'runtime/r7-final-build/target/classes'),evidence=path.join(root,'docs/acceptance/R7/strategies-final'),lockPath=path.join(root,'curriculum/r7-release-lock.json');
 try{
  let lock;
  if(process.argv.includes('--create-lock')){
   assert(!fs.existsSync(lockPath),'Published R7 lock already exists; create a new course version.');
   lock={schemaVersion:1,createdAt:new Date().toISOString(),runnerClassSha256:sha(fs.readFileSync(path.join(classes,'dev/codesomething/boot/CollaborationRunner.class'))),files:Object.fromEntries(releaseInventory(root).map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]))};
  }else lock=JSON.parse(fs.readFileSync(lockPath));
  const result=validateR7({root,classes,evidence,lock});
  if(process.argv.includes('--create-lock'))fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
  fs.writeFileSync(path.join(root,'docs/acceptance/R7/gate.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }catch(error){console.error('R7 release rejected: '+error.message);process.exitCode=1}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMetadataSpring} from '../../src/components/leibox/stacked-metadata/metadataSpring.ts';

test('a released tag stack settles at either destination and stops moving',()=>{
 for(const target of [0,1]){
  const state={value:1-target,velocity:0,target};
  for(let i=0;i<300;i++)advanceMetadataSpring(state,1/60);
  assert.equal(state.value,target);assert.equal(state.velocity,0);
 }
});
test('rapid hover interruptions preserve position and velocity before settling',()=>{
 const state={value:0,velocity:0,target:1};
 for(let i=0;i<12;i++)advanceMetadataSpring(state,1/60);
 assert.ok(state.value>0&&state.value<1.1);
 const previous={...state};state.target=0;
 assert.equal(state.value,previous.value);assert.equal(state.velocity,previous.velocity);
 for(let i=0;i<300;i++){const before=state.value;advanceMetadataSpring(state,1/60);assert.ok(Number.isFinite(state.value));assert.ok(Math.abs(state.value-before)<.2)}
 assert.equal(state.value,0);assert.equal(state.velocity,0);
});
test('equal elapsed time at different refresh rates gives the same trajectory',()=>{
 const slow={value:0,velocity:0,target:1},fast={...slow};
 for(let i=0;i<30;i++)advanceMetadataSpring(slow,1/60);
 for(let i=0;i<60;i++)advanceMetadataSpring(fast,1/120);
 assert.ok(Math.abs(slow.value-fast.value)<1e-9);
 assert.ok(Math.abs(slow.velocity-fast.velocity)<1e-9);
});

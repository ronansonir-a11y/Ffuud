import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTES, PROFILE, patchPlayer } from '../src/patch.mjs';
const player=()=>Object.fromEntries([['playerid',20801],...Object.keys({...ATTRIBUTES,...PROFILE}).map(k=>[k,0])]);
const file=(records)=>({databases:[{tables:[{name:'players',records}]}]});
test('all 34 attributes and profile are applied',()=>{const p=player();patchPlayer(file([p]));assert.equal(Object.keys(ATTRIBUTES).length,34);for(const [k,v] of Object.entries({...ATTRIBUTES,...PROFILE}))assert.equal(p[k],v)});
test('reject missing or duplicate players',()=>{assert.throws(()=>patchPlayer(file([])));assert.throws(()=>patchPlayer(file([player(),player()]))) });
test('reject incompatible schema',()=>{const p=player();delete p.curve;assert.throws(()=>patchPlayer(file([p])),/curve/) });

test('frees number seven without affecting Portugal or other teams', async () => {
  const {freeUnitedNumberSeven} = await import('../src/patch.mjs');
  const records = [{teamid:11,playerid:123,jerseynumber:7},{teamid:11,playerid:456,jerseynumber:14},{teamid:1354,playerid:123,jerseynumber:7}];
  const mirror = [{teamid:11,playerid:123,jerseynumber:7}];
  const f={databases:[{tables:[{name:'teamplayerlinks',records},{name:'teamplayerlinks_vh',records:mirror}]}]};
  assert.deepEqual(freeUnitedNumberSeven(f),{playerid:123,number:1});
  assert.equal(records[2].jerseynumber,7); assert.equal(mirror[0].jerseynumber,1);
});
test('refuses ambiguous number seven', async () => {
  const {freeUnitedNumberSeven} = await import('../src/patch.mjs');
  const records=[{teamid:11,playerid:1,jerseynumber:7},{teamid:11,playerid:2,jerseynumber:7}];
  assert.throws(()=>freeUnitedNumberSeven({databases:[{tables:[{name:'teamplayerlinks',records}]}]}),/Multiple/);
});

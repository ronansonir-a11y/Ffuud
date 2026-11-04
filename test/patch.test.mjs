import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTES, PROFILE, patchPlayer } from '../src/patch.mjs';
const player=()=>Object.fromEntries([['playerid',20801],...Object.keys({...ATTRIBUTES,...PROFILE}).map(k=>[k,0])]);
const file=(records)=>({databases:[{tables:[{name:'players',records}]}]});
test('all 34 attributes and profile are applied',()=>{const p=player();patchPlayer(file([p]));assert.equal(Object.keys(ATTRIBUTES).length,34);for(const [k,v] of Object.entries({...ATTRIBUTES,...PROFILE}))assert.equal(p[k],v)});
test('reject missing or duplicate players',()=>{assert.throws(()=>patchPlayer(file([])));assert.throws(()=>patchPlayer(file([player(),player()]))) });
test('reject incompatible schema',()=>{const p=player();delete p.curve;assert.throws(()=>patchPlayer(file([p])),/curve/) });

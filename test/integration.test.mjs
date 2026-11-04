import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readEaFile} from 'eafc-db-kit';
import {patch} from '../src/patch.mjs';

test('bundled DATA: transfer, starting lineups, set pieces, date and Portugal link round-trip', {timeout:60000}, async () => {
  const dir=await mkdtemp(join(tmpdir(),'ffuud-test-'));
  try {
    execFileSync('unzip',['-q',resolve('[Telegram PlayStation Pulse] CUSA52342_Squads20260909.zip'),'-d',dir]);
    const input=join(dir,'CUSA52342_Squads20260909','DATA'), output=join(dir,'patched');
    await patch(input,output,true);
    const file=await readEaFile(output,{version:'FC 26',tables:['players','teamplayerlinks','default_teamsheets','default_mentalities','teams']});
    const records=n=>file.databases.flatMap(d=>d.tables).find(t=>t.name===n).records;
    const p=records('players').find(r=>r.playerid===20801);
    assert.equal(p.birthdate,153151); assert.equal(p.preferredposition1,23); assert.equal(p.internationalrep,5);
    const links=records('teamplayerlinks');
    assert.equal(links.find(r=>r.teamid===11&&r.playerid===233064).jerseynumber,14);
    assert.equal(links.find(r=>r.teamid===1354&&r.playerid===20801).jerseynumber,7);
    for(const id of [11,1354]) {
      const sheet=records('default_teamsheets').find(r=>r.teamid===id);
      const tactical=records('default_mentalities').find(r=>r.teamid===id);
      const slot=Array.from({length:11},(_,i)=>i).find(i=>sheet['playerid'+i]===20801);
      assert.notEqual(slot,undefined);assert.equal(tactical['playerid'+slot],20801);
      assert.equal(records('teams').find(r=>r.teamid===id).penaltytakerid,20801);
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});

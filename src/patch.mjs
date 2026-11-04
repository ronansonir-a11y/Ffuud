import { readEaFile, writeEaFile } from 'eafc-db-kit';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately restricted to fields whose desired raw values were supplied.
export const ATTRIBUTES = Object.freeze({
  acceleration:95,sprintspeed:95,positioning:93,finishing:94,shotpower:95,longshots:94,volleys:90,penalties:91,
  vision:86,crossing:89,freekickaccuracy:94,shortpassing:87,longpassing:81,curve:89,
  agility:95,balance:88,reactions:94,ballcontrol:95,dribbling:96,composure:92,
  interceptions:35,headingaccuracy:93,defensiveawareness:28,standingtackle:32,slidingtackle:25,
  jumping:95,stamina:94,strength:82,aggression:72,gkdiving:7,gkhandling:11,gkkicking:15,gkpositioning:14,gkreflexes:11,
});
export const PROFILE = Object.freeze({overallrating:94,potential:95,contractvaliduntil:2030,
  preferredfoot:1,skillmoves:4,weakfootabilitytypecode:4,height:186,weight:75,facialhairtypecode:0,
  birthdate:153151, internationalrep:5, preferredposition1:23, preferredposition2:27, preferredposition3:25,
  socklengthcode:1, isretiring:0});

export function patchPlayer(file) {
  const tables=file.databases.flatMap(db=>db.tables).filter(t=>t.name==='players');
  const matches=tables.flatMap(t=>t.records.filter(r=>r.playerid===20801));
  if(matches.length!==1) throw new Error(`Expected exactly one player 20801, found ${matches.length}`);
  const p=matches[0];
  for (const [key,value] of Object.entries({...ATTRIBUTES,...PROFILE})) {
    if (!Object.hasOwn(p,key)) throw new Error(`Missing players.${key}; unsupported schema`);
    p[key]=value;
  }
}

export function freeUnitedNumberSeven(file) {
  const dbs = file.databases.filter(db => db.tables.some(t => t.name === 'teamplayerlinks'));
  if (dbs.length !== 1) throw new Error('Expected exactly one roster database');
  const tables = dbs[0].tables;
  const links = tables.find(t => t.name === 'teamplayerlinks').records;
  const united = links.filter(r => r.teamid === 11);
  const occupants = united.filter(r => r.jerseynumber === 7 && r.playerid !== 20801);
  if (occupants.length > 1) throw new Error('Multiple Manchester United players wear 7');
  if (!occupants.length) return null;
  const used = new Set(united.map(r => r.jerseynumber));
  const replacement = [14, ...Array.from({length:99}, (_, i) => i+1)].find(n => !used.has(n));
  if (!replacement) throw new Error('No free Manchester United shirt number');
  const displaced = occupants[0];
  displaced.jerseynumber = replacement;
  // Keep any matching roster mirrors consistent; do not touch international links.
  for (const name of ['teamplayerlinks_vh', 'temp_teamplayerlinks']) {
    const table = tables.find(t => t.name === name);
    for (const row of table?.records ?? []) {
      if (row.teamid === 11 && row.playerid === displaced.playerid && Object.hasOwn(row, 'jerseynumber')) row.jerseynumber = replacement;
    }
  }
  return {playerid: displaced.playerid, number: replacement};
}

// Only alter a verified default lineup; never guess a tactical formation.
export function setStartingRoles(file) {
  const db = file.databases.find(d => d.tables.some(t => t.name === 'teamplayerlinks'));
  if (!db) throw new Error('Roster database missing');
  const table = name => db.tables.find(t => t.name === name)?.records ?? [];
  const fields = ['captainid','freekicktakerid','rightfreekicktakerid','leftfreekicktakerid',
    'longkicktakerid','penaltytakerid','rightcornerkicktakerid','leftcornerkicktakerid'];
  for (const teamid of [11,1354]) {
    const links = table('teamplayerlinks').filter(r => r.teamid === teamid);
    const link = links.find(r => r.playerid === 20801);
    const sheets = table('default_teamsheets').filter(r => r.teamid === teamid);
    const tactics = table('default_mentalities').filter(r => r.teamid === teamid);
    const teams = table('teams').filter(r => r.teamid === teamid);
    if (!link || sheets.length !== 1 || tactics.length !== 1 || teams.length !== 1)
      throw new Error(`Cannot safely configure team ${teamid}: missing or ambiguous records`);
    const sheet = sheets[0], tactic = tactics[0];
    const indices = Array.from({length:52},(_,i)=>i).filter(i=>sheet['playerid'+i]===20801);
    if (indices.length !== 1) throw new Error(`Ronaldo must appear once in team ${teamid} sheet`);
    let slot = indices[0];
    if (slot >= 11) {
      // Prefer a right midfielder/winger slot in the existing tactical shape.
      const choice = [23,12,25].map(pos => Array.from({length:11},(_,i)=>i).find(i=>tactic['position'+i]===pos)).find(i=>i!==undefined);
      if (choice === undefined || tactic['playerid'+choice] !== sheet['playerid'+choice]) throw new Error(`Cannot identify matching attacking slot for team ${teamid}`);
      const old = sheet['playerid'+choice];
      const oldLink = links.find(r=>r.playerid===old);
      if (!oldLink) throw new Error(`Starter ${old} lacks team link`);
      sheet['playerid'+slot] = old; sheet['playerid'+choice] = 20801;
      tactic['playerid'+choice] = 20801;
      oldLink.position = 29;
      slot = choice;
    } else if (tactic['playerid'+slot] !== 20801) {
      throw new Error(`Team ${teamid} lineup and tactics do not agree`);
    }
    link.position = tactic['position'+slot];
    if (teamid === 1354) {
      if (links.some(r=>r.playerid!==20801 && r.jerseynumber===7)) throw new Error('Portugal number 7 is occupied');
      link.jerseynumber = 7;
    }
    for (const row of [sheet,teams[0]]) for (const key of fields) {
      if (!Object.hasOwn(row,key)) throw new Error(`Missing team field ${key}`);
      row[key] = 20801;
    }
  }
}

export async function patch(input, output, transfer=false) {
  if(resolve(input)===resolve(output)) throw new Error('Input and output must be different files');
  // Complete snapshot is required by transferPlayer. No binary signatures or bit masks are guessed.
  const file=await readEaFile(input,{version:'FC 26',kind:'squad'});
  patchPlayer(file);
  let displaced = null;
  if (transfer) {
    displaced = freeUnitedNumberSeven(file);
    if (displaced) console.error('Renumbered Manchester United player:', JSON.stringify(displaced));
    const result=file.transferPlayer(20801,11,{jerseyNumber:7});
    console.error('Transfer:',JSON.stringify(result));
    setStartingRoles(file);
  }
  await writeEaFile(input,output,file);
  const check=await readEaFile(output,{version:'FC 26',kind:'squad',tables:['players','teamplayerlinks','default_teamsheets','default_mentalities','teams']});
  const rows=check.databases.flatMap(d=>d.tables).filter(t=>t.name==='players').flatMap(t=>t.records).filter(p=>p.playerid===20801);
  if(rows.length!==1 || Object.entries({...ATTRIBUTES,...PROFILE}).some(([k,v])=>rows[0][k]!==v)) throw new Error('Output verification failed; do not import it');
  if(transfer) {
    const links=check.databases.flatMap(d=>d.tables).filter(t=>t.name==='teamplayerlinks').flatMap(t=>t.records);
    if(!links.some(r=>r.playerid===20801 && r.teamid===11 && r.jerseynumber===7) ||
       links.filter(r=>r.teamid===11 && r.jerseynumber===7).length!==1 ||
       (displaced && !links.some(r=>r.teamid===11 && r.playerid===displaced.playerid && r.jerseynumber===displaced.number)))
      throw new Error('Transfer verification failed; do not import output');
  }
  if (transfer) {
    const tables=check.databases.flatMap(d=>d.tables);
    for (const id of [11,1354]) {
      const sheet=tables.find(t=>t.name==='default_teamsheets')?.records.find(r=>r.teamid===id);
      const team=tables.find(t=>t.name==='teams')?.records.find(r=>r.teamid===id);
      const tactic=tables.find(t=>t.name==='default_mentalities')?.records.find(r=>r.teamid===id);
      const idx=Array.from({length:11},(_,i)=>i).find(i=>sheet?.['playerid'+i]===20801);
      const fields=['captainid','freekicktakerid','rightfreekicktakerid','leftfreekicktakerid','longkicktakerid','penaltytakerid','rightcornerkicktakerid','leftcornerkicktakerid'];
      if(idx===undefined || tactic?.['playerid'+idx]!==20801 || fields.some(k=>sheet[k]!==20801 || team?.[k]!==20801)) throw new Error(`Team ${id} lineup verification failed`);
    }
  }
  console.log('Experimental output verified by re-reading; PS4 compatibility is not verified.');
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2), transfer=args.includes('--transfer');
  const paths=args.filter(x=>x!=='--transfer');
  if(paths.length!==2 || args.some(x=>x.startsWith('--') && x!=='--transfer')) {
    console.error('Usage: node src/patch.mjs INPUT OUTPUT [--transfer]'); process.exitCode=2;
  } else patch(paths[0],paths[1],transfer).catch(e=>{console.error('Patch failed:',e.message);process.exitCode=1});
}

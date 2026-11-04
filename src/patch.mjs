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
  preferredfoot:1,skillmoves:4,weakfootabilitytypecode:4,height:186,weight:75,facialhairtypecode:0});

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
  }
  await writeEaFile(input,output,file);
  const check=await readEaFile(output,{version:'FC 26',kind:'squad',tables:['players','teamplayerlinks']});
  const rows=check.databases.flatMap(d=>d.tables).filter(t=>t.name==='players').flatMap(t=>t.records).filter(p=>p.playerid===20801);
  if(rows.length!==1 || Object.entries({...ATTRIBUTES,...PROFILE}).some(([k,v])=>rows[0][k]!==v)) throw new Error('Output verification failed; do not import it');
  if(transfer) {
    const links=check.databases.flatMap(d=>d.tables).filter(t=>t.name==='teamplayerlinks').flatMap(t=>t.records);
    if(!links.some(r=>r.playerid===20801 && r.teamid===11 && r.jerseynumber===7) ||
       links.filter(r=>r.teamid===11 && r.jerseynumber===7).length!==1 ||
       (displaced && !links.some(r=>r.teamid===11 && r.playerid===displaced.playerid && r.jerseynumber===displaced.number)))
      throw new Error('Transfer verification failed; do not import output');
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

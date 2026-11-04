import { readEaFile, writeEaFile } from 'eafc-db-kit';
import { access } from 'node:fs/promises';
import path from 'node:path';

export const PLAYER_ID = 20801;
export const attributes = {
  acceleration:95,sprintspeed:95,positioning:93,finishing:94,shotpower:95,longshots:94,volleys:90,penalties:91,
  vision:86,crossing:89,freekickaccuracy:94,shortpassing:87,longpassing:81,curve:89,agility:95,balance:88,
  reactions:94,ballcontrol:95,dribbling:96,composure:92,interceptions:35,headingaccuracy:93,defensiveawareness:28,
  standingtackle:32,slidingtackle:25,jumping:95,stamina:94,strength:82,aggression:72,
  gkdiving:7,gkhandling:11,gkkicking:15,gkpositioning:14,gkreflexes:11
};
const basic = {overallrating:94,potential:95,contractvaliduntil:2030,preferredfoot:1,skillmoves:4,
  weakfootabilitytypecode:4,internationalrep:5,height:186,weight:75,
  facialhairtypecode:0,isretiring:0};
const clubs=[11,1354];
const abort=(msg)=>{throw new Error(msg)};
export async function patch(input, output) {
  if (!input || !output || path.resolve(input)===path.resolve(output)) abort('Supply distinct input and output paths.');
  await access(input); try {await access(output); abort(`Refusing to overwrite ${output}`)} catch(e){if(e.code!=='ENOENT')throw e}
  const file=await readEaFile(input,{version:'FC 26'}), all=file.databases.flatMap(d=>d.tables), table=n=>all.find(t=>t.name===n);
  const players=table('players'), links=table('teamplayerlinks'), teams=table('teams');
  if(!players||!links||!teams) abort('Required players/teamplayerlinks/teams table missing.');
  const p=players.records.find(x=>Number(x.playerid)===PLAYER_ID); if(!p) abort(`Player ${PLAYER_ID} not found.`);
  const fields={...attributes,...basic, birthdate:153151, preferredposition1:25,preferredposition2:26,preferredposition3:24};
  // This FC 26 dataset encodes RW=25, LW=26, ST=24; birthdate counts days from 1582-10-14.
  const missing=Object.keys(fields).filter(k=>!(k in p)); if(missing.length)abort(`Missing player columns: ${missing.join(', ')}`);
  // Explicitly preserve current unique CR7 animation/head values; schema has no separate freekickstylecode.
  Object.assign(p,fields);
  const ownLinks=links.records.filter(x=>Number(x.playerid)===PLAYER_ID);
  const portugal=ownLinks.find(x=>Number(x.teamid)===1354); if(!portugal) abort('Portugal link not found; refusing to synthesize a national-team record.');
  const mu=links.records.find(x=>Number(x.playerid)===PLAYER_ID&&Number(x.teamid)===11);
  if(!mu){const old=ownLinks.find(x=>Number(x.teamid)!==1354);if(old)links.records.splice(links.records.indexOf(old),1);
    const exemplar=links.records.find(x=>Number(x.teamid)===11); if(!exemplar)abort('No Manchester United template link.');
    const fresh={...exemplar,playerid:PLAYER_ID,jerseynumber:7,position:25,artificialkey:Math.max(...links.records.map(x=>Number(x.artificialkey)||0))+1}; links.records.push(fresh);
  } else {mu.jerseynumber=7;mu.position=25;}
  portugal.jerseynumber=7;
  const requested=['captainid','freekicktakerid','leftfreekicktakerid','rightfreekicktakerid','penaltytakerid'];
  for(const id of clubs){const t=teams.records.find(x=>Number(x.teamid)===id);if(!t)abort(`Team ${id} absent`);for(const k of requested)if(k in t)t[k]=PLAYER_ID;}
  // Do not fabricate traits/roles: this DATA has no playerroles table and role fields use undocumented enums.
  await writeEaFile(input,output,file);
  const verify=await readEaFile(output,{version:'FC 26'}), vt=verify.databases.flatMap(d=>d.tables), vp=vt.find(t=>t.name==='players').records.find(x=>Number(x.playerid)===PLAYER_ID);
  if(!vp||Object.entries(fields).some(([k,v])=>String(vp[k])!==String(v)))abort('Player field round-trip verification failed.');
  const vl=vt.find(t=>t.name==='teamplayerlinks').records;
  for(const id of clubs)if(!vl.some(x=>Number(x.playerid)===PLAYER_ID&&Number(x.teamid)===id&&Number(x.jerseynumber)===7))abort(`Link verification failed for team ${id}`);
  return {output,updatedPlayerFields:Object.keys(fields).length,teams:clubs,verified:true,limitations:['PlayStyles/CPU trait bit mapping not safely inferred','Player Roles++ unavailable in this file schema','lineup starter assignment is not represented by teamplayerlinks','2008 hair/outfit/animation codes not verified']};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${path.resolve(process.argv[1])}`).href){try{console.log(JSON.stringify(await patch(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(`Patch failed: ${e.message}`);process.exitCode=1;}}

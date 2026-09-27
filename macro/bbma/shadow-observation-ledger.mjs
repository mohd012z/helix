import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATH='data/bbma-shadow-observations.json';
const idOf=o=>String(o?.alert_id??o?.observation_id??o?.candidate?.alert_id??o?.candidate?.observation_id??o?.candidate?.signal_id??'');
const stableId=o=>idOf(o)||`shadow-${String(o?.generated_utc??'unknown').replace(/[^0-9A-Za-z]/g,'')}-${String(o?.symbol??'XAUUSD')}`;

export function persistShadowObservation(observation,{ledgerPath=DEFAULT_PATH,maxEntries=500}={}){
 if(observation?.kind!=='BBMA_NEWS_SHADOW_OBSERVATION') throw new TypeError('BBMA_NEWS_SHADOW_OBSERVATION required');
 if(!observation.generated_utc?.endsWith('Z')) throw new TypeError('generated_utc UTC timestamp required');
 const row=JSON.parse(JSON.stringify(observation));
 row.observation_id=stableId(row);
 row.alert_id=row.alert_id??row.observation_id;
 row.persistence={mode:'SHADOW_EVIDENCE_ONLY',broker_execution:false,orders:false,sl_tp:false,lot_sizing:false};
 let rows=[];
 try{const raw=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));rows=Array.isArray(raw)?raw:(raw.observations??[]);}catch(e){if(e.code!=='ENOENT')throw e;}
 const byId=new Map(rows.map(x=>[String(x.alert_id??x.observation_id),x]));
 byId.set(row.alert_id,row);
 const observations=[...byId.values()].sort((a,b)=>String(a.generated_utc??'').localeCompare(String(b.generated_utc??''))).slice(-Math.max(1,maxEntries));
 fs.mkdirSync(path.dirname(ledgerPath),{recursive:true});
 const tmp=`${ledgerPath}.tmp-${process.pid}`;
 fs.writeFileSync(tmp,`${JSON.stringify({schema_version:1,kind:'BBMA_SHADOW_OBSERVATION_LEDGER',updated_utc:row.generated_utc,observations},null,2)}\n`,{encoding:'utf8',mode:0o600});
 fs.renameSync(tmp,ledgerPath);
 return Object.freeze({ledgerPath,observation_id:row.observation_id,alert_id:row.alert_id,count:observations.length});
}

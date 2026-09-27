import {classifyTelegramLifecycle} from './telegram-lifecycle.mjs';
import {diffTelegramObservations,explainTelegramObservation} from './telegram-delta.mjs';

const emptyDelta=()=>Object.freeze({added:[],removed:[],direction_changed:false,gate_changed:false,readiness_changed:false});
const timeOf=o=>{const n=Date.parse(o?.generated_utc??'');return Number.isFinite(n)?n:0;};

export function buildTelegramObservationHistory(observations=[]){
 const rows=[...observations].filter(Boolean).sort((a,b)=>timeOf(a)-timeOf(b)||String(a.alert_id??'').localeCompare(String(b.alert_id??'')));
 const byId=new Map(); const previousById=new Map(); const lastBySymbol=new Map();
 for(const row of rows){
  const id=String(row.alert_id??row.observation_id??row.id??'');
  if(!id) continue;
  const symbol=String(row.symbol??'XAUUSD').toUpperCase();
  previousById.set(id,lastBySymbol.get(symbol)??null);
  byId.set(id,row); lastBySymbol.set(symbol,row);
 }
 const getObservation=id=>byId.get(String(id))??null;
 const getPrevious=id=>previousById.get(String(id))??null;
 const getChanges=observation=>{if(!observation)return emptyDelta();const id=String(observation.alert_id??observation.observation_id??observation.id??'');const previous=getPrevious(id);return previous?diffTelegramObservations(previous,observation):emptyDelta();};
 const getExplanation=(observation,options={})=>explainTelegramObservation(observation,classifyTelegramLifecycle(observation,options));
 return Object.freeze({size:byId.size,getObservation,getPrevious,getChanges,getExplanation});
}

const ORDER=Object.freeze({WATCH:0,SETUP:1,CONFIRMED:2,INVALIDATED:3,EXPIRED:4});
const norm=v=>String(v??'').trim().toUpperCase();

export function classifyTelegramLifecycle(observation,{now=Date.now(),maxAgeMs=15*60*1000}={}){
  if(!observation) throw new TypeError('observation is required');
  const generated=Date.parse(observation.generated_utc??'');
  const stale=Number.isFinite(generated)&&now-generated>maxAgeMs;
  const reasons=[...(observation.evidence?.reason_codes??[])].map(norm);
  const readiness=norm(observation.readiness??observation.bbma?.readiness??'OBSERVE');
  const gate=norm(observation.news?.gate??'OBSERVE');
  const incomplete=reasons.some(x=>/UNKNOWN|UNAVAILABLE|AMBIGUOUS|INCOMPLETE/.test(x));
  let state='WATCH';
  if(stale) state='EXPIRED';
  else if(gate==='BLOCK'||gate==='BLOCKED'||reasons.some(x=>/INVALID/.test(x))) state='INVALIDATED';
  else if(!incomplete&&['CONFIRMED','CONFIRMABLE','ACTIVE'].includes(readiness)) state='CONFIRMED';
  else if(['SETUP','READY','REENTRY','RE-ENTRY'].includes(readiness)) state='SETUP';
  return Object.freeze({state,priority:state==='INVALIDATED'||state==='EXPIRED'?'P1':state==='CONFIRMED'?'P2':state==='SETUP'?'P3':'P4',stale,incomplete,gate,readiness});
}

export function telegramLifecycleTransition(previous,current){
  const from=previous?.state??null; const to=current?.state??'WATCH';
  const changed=from!==to;
  return Object.freeze({from,to,changed,notify:changed&&to!=='WATCH',escalated:changed&&from!=null&&(ORDER[to]??0)>(ORDER[from]??0)});
}

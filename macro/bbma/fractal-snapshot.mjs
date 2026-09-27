export const BBMA_TIMEFRAME_ROLES=Object.freeze({
  MN:'MACRO',W1:'MACRO',D1:'STRUCTURE',H4:'STRUCTURE',H1:'SETUP',M30:'SETUP',M15:'TRIGGER',M5:'TRIGGER'
});
const ORDER=Object.freeze(['MN','W1','D1','H4','H1','M30','M15','M5']);

function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildBbmaFractalSnapshot(evidence){
  if(!evidence||typeof evidence!=='object') throw new TypeError('BBMA MTF evidence is required');
  const source=evidence.timeframes;
  if(!Array.isArray(source)&&(!source||typeof source!=='object')) throw new TypeError('BBMA MTF timeframes are required');
  const byTf=new Map(Array.isArray(source)?source.map(item=>[item.timeframe,item]):Object.entries(source));
  const snapshot={};
  for(const timeframe of ORDER){
    const item=byTf.get(timeframe);
    if(!item) continue;
    const active=[];
    for(const detector of item.buy_detectors??[]) active.push(`${detector}_BUY`);
    for(const detector of item.sell_detectors??[]) active.push(`${detector}_SELL`);
    snapshot[timeframe]={
      role:BBMA_TIMEFRAME_ROLES[timeframe],
      direction:item.direction??'NEUTRAL',
      status:item.status??'OK',
      active_detectors:active,
      detector_states:Object.fromEntries((item.observations??[]).map(obs=>[obs.detector,{detected:Boolean(obs.detected),direction:obs.direction??null,status:obs.status??'OK'}]))
    };
  }
  return freeze(snapshot);
}

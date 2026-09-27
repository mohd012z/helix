const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const idOf=o=>String(o?.alert_id??o?.observation_id??o?.candidate?.alert_id??o?.candidate?.observation_id??'');
const detectors=e=>e?.active_detectors??e?.detectors??[];
const gateState=gate=>gate?.state??gate?.action??gate?.decision??'OBSERVE';

/** Read-only adapter. It never creates orders, SL/TP, lot size or broker instructions. */
export function adaptShadowObservationForTelegram(observation,{fractalSnapshot}={}){
 if(!observation||observation.kind!=='BBMA_NEWS_SHADOW_OBSERVATION') throw new TypeError('BBMA_NEWS_SHADOW_OBSERVATION required');
 const alertId=idOf(observation);
 if(!alertId) throw new TypeError('stable observation id required');
 const snapshot=fractalSnapshot??observation.candidate?.fractal_snapshot??observation.candidate?.evidence?.fractal_snapshot??{};
 const tf=Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,{direction:v?.direction??'NEUTRAL',active_detectors:[...detectors(v)]}]));
 const macro=observation.macro??{};
 const gate=observation.gate??{};
 return Object.freeze({
   alert_id:alertId,
   symbol:observation.symbol??'XAUUSD',
   direction:observation.direction??'NEUTRAL',
   readiness:observation.readiness??'OBSERVE',
   bbma:{direction:observation.direction??'NEUTRAL',readiness:observation.readiness??'OBSERVE',fractal_snapshot:clone(tf)},
   news:{event:macro.event_name??macro.title??macro.dominant_event??'NO_ACTIVE_EVENT',impact:macro.impact??macro.risk_level??'UNKNOWN',gate:gateState(gate)},
   evidence:{coverage:observation.candidate?.coverage??`${Object.keys(tf).length} TF`,reason_codes:[...(observation.reason_codes??[]),...(gate.reason_codes??[])]},
   generated_utc:observation.generated_utc,
   telegram_mode:'SHADOW_OBSERVATION',
   execution:Object.freeze({broker:false,orders:false,sl_tp:false,lot_sizing:false})
 });
}

export function indexTelegramObservations(observations,{fractalById={}}={}){
 const rows=[];
 for(const o of observations??[]){const id=idOf(o);if(!id)continue;rows.push(adaptShadowObservationForTelegram(o,{fractalSnapshot:fractalById[id]}));}
 return new Map(rows.map(x=>[x.alert_id,x]));
}

const norm=v=>String(v??'').trim().toUpperCase();
const detectors=o=>Object.values(o?.bbma?.fractal_snapshot??{}).flatMap(x=>x?.active_detectors??[]).map(norm).sort();
const evidenceHash=o=>JSON.stringify({state:norm(o?.lifecycle?.state),direction:norm(o?.bbma?.direction??o?.direction),gate:norm(o?.news?.gate),detectors:detectors(o),reasons:[...(o?.evidence?.reason_codes??[])].map(norm).sort()});

export function telegramSignalKey(alert){
 if(!alert) throw new TypeError('alert is required');
 return [norm(alert.symbol??'XAUUSD'),norm(alert.timeframe??alert.tf??'M15'),norm(alert.bbma?.direction??alert.direction??'NEUTRAL')].join('|');
}

export function buildTelegramDeliveryPlan({current,previous=null,delivery=null}={}){
 if(!current) throw new TypeError('current observation is required');
 const state=norm(current.lifecycle?.state??current.bbma?.readiness??'WATCH');
 const key=telegramSignalKey(current);
 if(state==='WATCH'&&!delivery) return Object.freeze({signal_key:key,operation:'suppress',notify:false,message_id:null,reason:'WATCH_SILENT'});
 const changed=!previous||evidenceHash(previous)!==evidenceHash(current);
 if(!changed) return Object.freeze({signal_key:key,operation:'suppress',notify:false,message_id:delivery?.message_id??null,reason:'UNCHANGED'});
 if(delivery?.message_id!=null) return Object.freeze({signal_key:key,operation:'edit_message',notify:true,message_id:delivery.message_id,reason:'LIFECYCLE_OR_EVIDENCE_CHANGED'});
 if(state==='WATCH') return Object.freeze({signal_key:key,operation:'suppress',notify:false,message_id:null,reason:'WATCH_SILENT'});
 return Object.freeze({signal_key:key,operation:'send_message',notify:true,message_id:null,reason:'FIRST_MEANINGFUL_EVENT'});
}

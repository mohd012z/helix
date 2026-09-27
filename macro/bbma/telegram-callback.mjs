const ACTIONS=new Set(['mtf','news','evidence','status','why','changes']);

export function parseBbmaTelegramCallback(data){
  if(typeof data!=='string') return null;
  const [scope,action,...rest]=data.split(':');
  const alertId=rest.join(':');
  if(scope!=='bbma'||!ACTIONS.has(action)||!alertId) return null;
  return Object.freeze({scope,action,alert_id:alertId});
}

export function routeBbmaTelegramCallback({data,getObservation,getCurrentStatus,getExplanation,getChanges}){
  const parsed=parseBbmaTelegramCallback(data);
  if(!parsed) return Object.freeze({ok:false,reason:'INVALID_CALLBACK'});
  if(typeof getObservation!=='function') throw new TypeError('getObservation is required');
  const observation=getObservation(parsed.alert_id);
  if(!observation) return Object.freeze({ok:false,reason:'OBSERVATION_NOT_FOUND',...parsed});
  if(parsed.action==='status'){
    if(typeof getCurrentStatus!=='function') return Object.freeze({ok:false,reason:'CURRENT_STATUS_UNAVAILABLE',...parsed});
    return Object.freeze({ok:true,...parsed,mode:'CURRENT',payload:getCurrentStatus(observation)});
  }
  if(parsed.action==='why'){
    if(typeof getExplanation!=='function') return Object.freeze({ok:false,reason:'EXPLANATION_UNAVAILABLE',...parsed});
    return Object.freeze({ok:true,...parsed,mode:'EXPLANATION',payload:getExplanation(observation)});
  }
  if(parsed.action==='changes'){
    if(typeof getChanges!=='function') return Object.freeze({ok:false,reason:'CHANGES_UNAVAILABLE',...parsed});
    return Object.freeze({ok:true,...parsed,mode:'DELTA',payload:getChanges(observation)});
  }
  const payload=parsed.action==='mtf'?observation.bbma?.fractal_snapshot:
    parsed.action==='news'?observation.news:
    observation.evidence;
  return Object.freeze({ok:true,...parsed,mode:'HISTORICAL_SNAPSHOT',payload});
}

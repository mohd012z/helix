const norm=v=>String(v??'—');
const detectorSet=o=>new Set(Object.values(o?.bbma?.fractal_snapshot??{}).flatMap(x=>x?.active_detectors??[]));

export function explainTelegramObservation(o,lifecycle){
 const reasons=o?.evidence?.reason_codes??[];
 const detectors=[...detectorSet(o)];
 return Object.freeze({state:lifecycle?.state??'WATCH',direction:o?.bbma?.direction??o?.direction??'NEUTRAL',detectors,reasons,gate:o?.news?.gate??'OBSERVE',incomplete:Boolean(lifecycle?.incomplete),stale:Boolean(lifecycle?.stale)});
}

export function diffTelegramObservations(previous,current){
 const before=detectorSet(previous), after=detectorSet(current);
 return Object.freeze({
  added:[...after].filter(x=>!before.has(x)),
  removed:[...before].filter(x=>!after.has(x)),
  direction_changed:norm(previous?.bbma?.direction)!==norm(current?.bbma?.direction),
  gate_changed:norm(previous?.news?.gate)!==norm(current?.news?.gate),
  readiness_changed:norm(previous?.bbma?.readiness)!==norm(current?.bbma?.readiness)
 });
}

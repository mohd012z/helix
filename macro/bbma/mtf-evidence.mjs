import { evaluateBbmaTimeframe } from './timeframe-evidence.mjs';

// Canonical BBMA analytical stack, highest timeframe to lowest timeframe.
// MN/W1 intentionally use the same detector/evidence method as the existing
// lower timeframes. Their structural influence on confluence is handled in a
// separate semantic layer; this module only evaluates and preserves evidence.
export const BBMA_TIMEFRAMES=Object.freeze(['MN','W1','D1','H4','H1','M30','M15','M5']);

const ROLES=Object.freeze({
  MN:'MACRO_STRUCTURE',
  W1:'MAJOR_REGIME',
  D1:'MAJOR_CONTEXT',
  H4:'PRIMARY_STRUCTURE',
  H1:'CONFIRMATION',
  M30:'REFINEMENT',
  M15:'PRIMARY_SETUP',
  M5:'EARLY_CONFIRMATION'
});

function missing(tf,ruleVersion) {
  return Object.freeze({
    timeframe:tf,
    role:ROLES[tf],
    rule_version:ruleVersion,
    direction:'NEUTRAL',
    status:'INSUFFICIENT_DATA',
    buy_detectors:Object.freeze([]),
    sell_detectors:Object.freeze([]),
    observations:Object.freeze([])
  });
}

export function aggregateBbmaEvidence({ seriesByTimeframe={}, ruleVersion='bbma-shadow-v1' }={}) {
  if (!seriesByTimeframe || typeof seriesByTimeframe!=='object' || Array.isArray(seriesByTimeframe)) {
    throw new TypeError('seriesByTimeframe must be an object');
  }

  const unknown=Object.keys(seriesByTimeframe).filter(k=>!BBMA_TIMEFRAMES.includes(k));
  if (unknown.length) throw new TypeError(`Unsupported BBMA timeframe: ${unknown.join(',')}`);

  const entries=BBMA_TIMEFRAMES.map(tf=>{
    const series=seriesByTimeframe[tf];
    if (!Array.isArray(series) || series.length===0) return [tf,missing(tf,ruleVersion)];
    const evaluated=evaluateBbmaTimeframe({series,timeframe:tf,ruleVersion});
    return [tf,Object.freeze({...evaluated,role:ROLES[tf]})];
  });

  const timeframes=Object.freeze(Object.fromEntries(entries));
  const buy=Object.freeze(BBMA_TIMEFRAMES.filter(tf=>['BUY','CONFLICT'].includes(timeframes[tf].direction)));
  const sell=Object.freeze(BBMA_TIMEFRAMES.filter(tf=>['SELL','CONFLICT'].includes(timeframes[tf].direction)));
  const conflicts=Object.freeze(BBMA_TIMEFRAMES.filter(tf=>timeframes[tf].direction==='CONFLICT' || timeframes[tf].status==='AMBIGUOUS'));
  const incomplete=BBMA_TIMEFRAMES.some(tf=>timeframes[tf].status==='INSUFFICIENT_DATA');

  let overall_state='NEUTRAL';
  if (incomplete) overall_state='INCOMPLETE';
  else if (buy.length && sell.length) overall_state='MIXED';
  else if (buy.length) overall_state='ALIGNED_BUY';
  else if (sell.length) overall_state='ALIGNED_SELL';

  return Object.freeze({
    rule_version:ruleVersion,
    overall_state,
    timeframes,
    buy_timeframes:buy,
    sell_timeframes:sell,
    conflict_timeframes:conflicts
  });
}

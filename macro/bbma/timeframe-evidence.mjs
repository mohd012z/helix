import { detectExtreme } from './extreme.mjs';
import { detectMhv } from './mhv.mjs';
import { detectCsa } from './csa.mjs';
import { detectReentry } from './reentry.mjs';
import { detectMomentum } from './momentum.mjs';

// One BBMA methodology is applied fractally on every supported timeframe.
// Semantic role is assigned by the MTF layer; detector mathematics/order do
// not change merely because a timeframe is HTF or LTF.
const ORDER=Object.freeze([
  ['EXTREME',detectExtreme],['MHV',detectMhv],['CSA',detectCsa],['REENTRY',detectReentry],['MOMENTUM',detectMomentum]
]);

export const BBMA_DETECTOR_ORDER=Object.freeze(ORDER.map(([name])=>name));

function normalize(name, value) {
  return Object.freeze({ ...value, detector:name, evidence:Object.freeze([...(value.evidence ?? [])]) });
}

export function evaluateBbmaTimeframe({ series=[], timeframe=null, ruleVersion='bbma-shadow-v1' }={}) {
  const observations=Object.freeze(ORDER.map(([name,fn])=>normalize(name,fn({series,timeframe,ruleVersion}))));
  const buy=Object.freeze(observations.filter(x=>x.detected && x.direction==='BUY').map(x=>x.detector));
  const sell=Object.freeze(observations.filter(x=>x.detected && x.direction==='SELL').map(x=>x.detector));
  const direction=buy.length && sell.length ? 'CONFLICT' : buy.length ? 'BUY' : sell.length ? 'SELL' : 'NEUTRAL';
  const incomplete=observations.some(x=>x.status==='INSUFFICIENT_DATA');
  const ambiguous=observations.some(x=>x.status==='AMBIGUOUS');
  const status=incomplete ? 'INSUFFICIENT_DATA' : ambiguous ? 'AMBIGUOUS' : 'OK';
  return Object.freeze({ timeframe, rule_version:ruleVersion, direction, status, buy_detectors:buy, sell_detectors:sell, observations });
}

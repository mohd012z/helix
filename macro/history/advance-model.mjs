import { getInstrument } from '../core/instruments.mjs';
import { normalizeHistorySample, validateHistorySample } from './history-schema.mjs';
import { buildReactionSample } from './reaction-sample.mjs';
import { validateAdvanceFeatures } from './anti-leakage.mjs';
import { rankComparableEvents } from './similarity.mjs';
import { summarizeDistribution, convertMovementBandToPrice } from './distribution.mjs';
import { estimateSensitivity, buildSurpriseScenarios } from './scenarios.mjs';
import { buildConfidence } from './confidence.mjs';

// Window canonicalisation: the UI/event layer uses '5m'/'15m'/'1h'/'1d' while
// IFX checkpoints are keyed 'M5'/'M15'/'H1'/'D1'. Both normalise to the same
// canonical token so s.window === event.window matches across sources.
const canonicalWindow = (w) => {
  const s = String(w ?? '').trim().toUpperCase().replace(/[\s_-]/g, '');
  if (!s) return '';
  const mMin = s.match(/^(?:M(\d+)|(\d+)M(?:IN)?)$/);
  if (mMin) return 'M' + (mMin[1] ?? mMin[2]);
  if (s.endsWith('H') && s !== 'H') { const n = s.slice(0, -1); return /^\d+$/.test(n) ? 'H' + n : s; }
  if (s.endsWith('D') && s !== 'D') { const n = s.slice(0, -1); return /^\d+$/.test(n) ? 'D' + n : s; }
  if (s.endsWith('W') && s !== 'W') { const n = s.slice(0, -1); return /^\d+$/.test(n) ? 'W' + n : s; }
  if (s.endsWith('N') && s.length > 1 && s.startsWith('M')) { const n = s.slice(1); return /^\d+$/.test(n) ? 'MN' + n : s; }
  return s;
};

export function buildAdvanceModel({event,symbol,preEventPrice,features=[],history=[],asOfUtc}={}){
  const instrument=getInstrument(symbol);if(!event||!instrument||!Number.isFinite(Number(preEventPrice)))return{state:'INSUFFICIENT_DATA',reason:'MISSING_EVENT_OR_PRICE'};
  const leakage=validateAdvanceFeatures({eventTimeUtc:event.eventTimeUtc,features});if(!leakage.valid)return{state:'LEAKAGE_BLOCKED',reason:'NON_PRE_EVENT_FEATURES',rejectedFeatures:leakage.rejected};
  const eventWindow=canonicalWindow(event.window??'5m');
  const normalized=history.map(normalizeHistorySample).filter(s=>validateHistorySample(s).valid&&s.symbol===symbol&&canonicalWindow(s.window)===eventWindow).map(buildReactionSample);
  if(normalized.length<3)return{state:'INSUFFICIENT_DATA',reason:'NO_EVENT_ALIGNED_HISTORY',sampleCount:normalized.length};
  const target={eventType:event.eventType??event.title??'',centralBank:event.centralBank??null,speakerRole:event.speakerRole??null,session:event.session??null,volatilityRegime:event.volatilityRegime??null,trendRegime:event.trendRegime??null,speechStance:event.speech?.stance??event.speechStance??null,asOfUtc:asOfUtc??event.eventTimeUtc};
  const ranked=rankComparableEvents(target,normalized,{asOfUtc:asOfUtc??event.eventTimeUtc,minSimilarity:0.05});
  if(ranked.length<3)return{state:'LOW_SAMPLE',reason:'TOO_FEW_COMPARABLE_EVENTS',sampleCount:normalized.length,comparableCount:ranked.length};
  const weighted=ranked.map(r=>({value:r.sample.signedMove,weight:r.weight}));const distribution=summarizeDistribution(weighted);if(!distribution)return{state:'INSUFFICIENT_DATA',reason:'EMPTY_DISTRIBUTION'};
  const avgSimilarity=ranked.reduce((s,r)=>s+r.similarity*r.weight,0)/ranked.reduce((s,r)=>s+r.weight,0);
  const confidence=buildConfidence({effectiveN:distribution.effectiveN,averageSimilarity:avgSimilarity,timestampConfidence:event.timeConfidence??'UNKNOWN'});
  const sensitivity=estimateSensitivity(ranked.map(r=>r.sample));const scenarios=buildSurpriseScenarios({baseDistribution:distribution,sensitivity,preEventPrice:Number(preEventPrice),instrument});
  const priceBand={p10:convertMovementBandToPrice({symbol,assetClass:instrument.assetClass,preEventPrice,movement:distribution.p10}),p25:convertMovementBandToPrice({symbol,assetClass:instrument.assetClass,preEventPrice,movement:distribution.p25}),p50:convertMovementBandToPrice({symbol,assetClass:instrument.assetClass,preEventPrice,movement:distribution.p50}),p75:convertMovementBandToPrice({symbol,assetClass:instrument.assetClass,preEventPrice,movement:distribution.p75}),p90:convertMovementBandToPrice({symbol,assetClass:instrument.assetClass,preEventPrice,movement:distribution.p90})};
  return{state:distribution.effectiveN<3?'LOW_SAMPLE':'READY',modelMode:event.kind==='scheduled'?'ADVANCE':'NOWCAST',symbol,assetClass:instrument.assetClass,window:event.window??'5m',sampleCount:normalized.length,comparableCount:ranked.length,effectiveN:distribution.effectiveN,distribution,priceBand,scenarios,direction:{positiveFrequency:distribution.positiveFrequency,negativeFrequency:distribution.negativeFrequency},expectedAbsoluteMove:distribution.meanAbsoluteMove,signedMedian:distribution.p50,confidence,comparableEvents:ranked.slice(0,10).map(r=>({eventId:r.sample.eventId,eventTimeUtc:r.sample.eventTimeUtc,similarity:r.similarity,weight:r.weight,signedMove:r.sample.signedMove}))};
}

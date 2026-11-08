import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSimilarity, recencyWeight, rankComparableEvents } from '../../macro/history/similarity.mjs';
import { summarizeDistribution, convertMovementBandToPrice } from '../../macro/history/distribution.mjs';
import { standardizeSurprise, estimateSensitivity, buildSurpriseScenarios } from '../../macro/history/scenarios.mjs';
import { buildAdvanceModel } from '../../macro/history/advance-model.mjs';

test('similarity and recency transparently rank closer recent events higher',()=>{
  const target={eventType:'CPI',session:'NY'};
  assert.equal(scoreSimilarity(target,{eventType:'CPI',session:'NY'}),1);
  assert.ok(scoreSimilarity(target,{eventType:'CPI',session:'LONDON'})<1);
  const recent=recencyWeight('2026-09-01T12:30:00Z','2026-09-16T12:30:00Z');
  const old=recencyWeight('2025-09-01T12:30:00Z','2026-09-16T12:30:00Z');
  assert.ok(recent>old);
  const ranked=rankComparableEvents({...target,asOfUtc:'2026-09-16T12:30:00Z'},[
    {eventId:'old',eventType:'CPI',session:'NY',eventTimeUtc:'2025-09-01T12:30:00Z'},
    {eventId:'recent',eventType:'CPI',session:'NY',eventTimeUtc:'2026-09-01T12:30:00Z'}
  ]);
  assert.equal(ranked[0].sample.eventId,'recent');
});

test('weighted history distribution preserves percentiles and native price conversion',()=>{
  const d=summarizeDistribution([-10,-5,0,5,10].map(value=>({value,weight:1})));
  assert.equal(d.p10,-10); assert.equal(d.p25,-5); assert.equal(d.p50,0); assert.equal(d.p75,5); assert.equal(d.p90,10);
  assert.equal(d.effectiveN,5); assert.equal(d.positiveFrequency,.4); assert.equal(d.negativeFrequency,.4);
  assert.equal(convertMovementBandToPrice({symbol:'EUR/USD',preEventPrice:1.1,movement:10}),1.101);
  assert.equal(convertMovementBandToPrice({symbol:'XAU/USD',assetClass:'metal',preEventPrice:2000,movement:1}),2020);
});

test('surprise engine standardizes releases and builds five conditional scenarios',()=>{
  assert.equal(standardizeSurprise(110,100,5),2);
  const sensitivity=estimateSensitivity([-2,-1,0,1,2,3].map(x=>({surpriseZ:x,signedMove:x*10})));
  assert.equal(sensitivity.sampleSize,6); assert.equal(sensitivity.slope,10);
  const rows=buildSurpriseScenarios({baseDistribution:{p10:-20,p25:-10,p50:0,p75:10,p90:20},sensitivity,preEventPrice:1.1,instrument:{symbol:'EUR/USD',assetClass:'fx'}});
  assert.equal(rows.length,5);
  assert.equal(rows[2].label,'near consensus'); assert.equal(rows[2].priceCenter,1.1);
  assert.equal(rows[3].priceCenter,1.101);
});

function sample(i, surpriseZ, after) {
  return {eventId:`cpi-${i}`,eventType:'CPI',eventTimeUtc:`2026-0${i}-10T12:30:00Z`,symbol:'EUR/USD',window:'5m',before:1.1,after,surpriseZ,sourceQuality:'HIGH'};
}

test('advance model returns verified comparable distributions and never fabricates empty history',()=>{
  const event={id:'next-cpi',title:'US CPI',eventType:'CPI',kind:'scheduled',state:'UPCOMING',eventTimeUtc:'2026-09-20T12:30:00Z',timeConfidence:'HIGH',window:'5m'};
  const none=buildAdvanceModel({event,symbol:'EUR/USD',preEventPrice:1.1,features:[],history:[],asOfUtc:'2026-09-16T12:00:00Z'});
  assert.equal(none.state,'INSUFFICIENT_DATA'); assert.equal(none.reason,'NO_EVENT_ALIGNED_HISTORY');
  const history=[sample(1,-2,1.098),sample(2,-1,1.099),sample(3,0,1.1002),sample(4,1,1.101),sample(5,2,1.102),sample(6,3,1.103)];
  const ready=buildAdvanceModel({event,symbol:'EUR/USD',preEventPrice:1.1,features:[],history,asOfUtc:'2026-09-16T12:00:00Z'});
  assert.equal(ready.state,'READY');
  assert.equal(ready.modelMode,'ADVANCE');
  assert.equal(ready.comparableCount,6);
  assert.ok(ready.priceBand.p10<=ready.priceBand.p50 && ready.priceBand.p50<=ready.priceBand.p90);
  assert.equal(ready.scenarios.length,5);
});

// IFX reaction samples are keyed M1..MN1 (checkpoint names); the event/UI layer
// uses 5m/15m/1h/1d. Both must normalise to the same token or the advance-model
// silently drops every IFX sample (the original Phase-3 gap). Regression guard:
// reuse the READY CPI fixture but override only the window to IFX format.
test('advance model matches IFX checkpoint window names (M5) to event windows (5m)',()=>{
  const event={id:'next-cpi',title:'US CPI',eventType:'CPI',kind:'scheduled',state:'UPCOMING',eventTimeUtc:'2026-09-20T12:30:00Z',timeConfidence:'HIGH',window:'5m'};
  // Same 6 CPI samples as the READY fixture, but window:'M5' (IFX checkpoint key).
  const asIfx=(s)=>({ ...s, window:'M5', sourceQuality:'IFX_PROXY_FOREX' });
  const history=[1,2,3,4,5,6].map(i=>asIfx(sample(i,[ -2,-1,0,1,2,3][i-1],[1.098,1.099,1.1002,1.101,1.102,1.103][i-1])));
  const ready=buildAdvanceModel({event,symbol:'EUR/USD',preEventPrice:1.1,features:[],history,asOfUtc:'2026-09-16T12:00:00Z'});
  assert.equal(ready.state,'READY');            // M5 samples matched event 5m
  assert.equal(ready.sampleCount,6);
  assert.equal(ready.comparableCount,6);
  // A sample keyed to a DIFFERENT window must be filtered out (not counted).
  const mixed=[...history,{...asIfx(sample(7,4,1.104)),window:'M15'}];
  const filtered=buildAdvanceModel({event,symbol:'EUR/USD',preEventPrice:1.1,features:[],history:mixed,asOfUtc:'2026-09-16T12:00:00Z'});
  assert.equal(filtered.sampleCount,6);         // M15 sample excluded, 6 M5 kept
});

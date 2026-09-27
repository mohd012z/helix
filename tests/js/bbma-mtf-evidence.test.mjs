import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBbmaEvidence, BBMA_TIMEFRAMES } from '../../macro/bbma/mtf-evidence.mjs';

const c=(t,o={})=>({timestamp_utc:t,open:100,high:104,low:96,close:101,bb_upper:105,bb_mid:100,bb_lower:95,ma5_high:102,ma5_low:98,ma10_high:101,ma10_low:99,ema50:100,...o});
const t1='2026-09-24T06:15:00.000Z',t2='2026-09-24T06:30:00.000Z';
const neutral=()=>[c(t1,{open:100,high:101,low:99,close:100}),c(t2,{open:100,high:101,low:99,close:100})];
const buy=()=>[c(t1,{close:101}),c(t2,{high:108,close:106})];
const sell=()=>[c(t1,{open:99,high:101,low:96,close:99,ema50:110}),c(t2,{open:98,high:100,low:92,close:94,ema50:110,ma5_high:101})];
const all=(factory)=>Object.fromEntries(BBMA_TIMEFRAMES.map(tf=>[tf,factory()]));

test('canonical BBMA evidence spans MN through M5 in structural order',()=>{
  assert.deepEqual(BBMA_TIMEFRAMES,['MN','W1','D1','H4','H1','M30','M15','M5']);
  const r=aggregateBbmaEvidence({seriesByTimeframe:all(neutral)});
  assert.deepEqual(Object.keys(r.timeframes),['MN','W1','D1','H4','H1','M30','M15','M5']);
});

test('MN and W1 are accepted and independently inspectable',()=>{
  const input=all(neutral); input.MN=buy(); input.W1=sell();
  const r=aggregateBbmaEvidence({seriesByTimeframe:input});
  assert.equal(r.timeframes.MN.timeframe,'MN');
  assert.equal(r.timeframes.W1.timeframe,'W1');
  assert.ok(r.buy_timeframes.includes('MN'));
  assert.ok(r.sell_timeframes.includes('W1'));
});

test('aligned directional evidence is descriptive only',()=>{
  assert.equal(aggregateBbmaEvidence({seriesByTimeframe:all(buy)}).overall_state,'ALIGNED_BUY');
  assert.equal(aggregateBbmaEvidence({seriesByTimeframe:all(sell)}).overall_state,'ALIGNED_SELL');
});

test('opposing valid timeframes produce MIXED and preserve support lists',()=>{
  const input=all(neutral); input.H4=buy(); input.M15=sell();
  const r=aggregateBbmaEvidence({seriesByTimeframe:input});
  assert.equal(r.overall_state,'MIXED'); assert.ok(r.buy_timeframes.includes('H4')); assert.ok(r.sell_timeframes.includes('M15'));
});

test('missing required setup timeframe produces INCOMPLETE without discarding evaluated evidence',()=>{
  const input=all(buy); delete input.M5;
  const r=aggregateBbmaEvidence({seriesByTimeframe:input});
  assert.equal(r.overall_state,'INCOMPLETE'); assert.equal(r.timeframes.M5.status,'INSUFFICIENT_DATA'); assert.ok(r.buy_timeframes.includes('H4'));
});

test('neutral valid evidence is NEUTRAL and output is deterministic and frozen',()=>{
  const input=all(neutral); const a=aggregateBbmaEvidence({seriesByTimeframe:input}); const b=aggregateBbmaEvidence({seriesByTimeframe:input});
  assert.equal(a.overall_state,'NEUTRAL'); assert.deepEqual(a,b); assert.equal(Object.isFrozen(a),true); assert.equal(Object.isFrozen(a.timeframes),true);
});

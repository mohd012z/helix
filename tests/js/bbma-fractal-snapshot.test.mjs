import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBbmaFractalSnapshot, BBMA_TIMEFRAME_ROLES } from '../../macro/bbma/fractal-snapshot.mjs';

const tf=(timeframe,direction,buy=[],sell=[])=>({
  timeframe,direction,status:'OK',buy_detectors:buy,sell_detectors:sell,
  observations:['EXTREME','MHV','CSA','REENTRY','MOMENTUM'].map(detector=>({detector,detected:buy.includes(detector)||sell.includes(detector),direction:buy.includes(detector)?'BUY':sell.includes(detector)?'SELL':null,status:'OK',evidence:[]}))
});

test('preserves actual detector states instead of reducing HTF to direction only',()=>{
  const evidence={timeframes:[
    tf('MN','SELL',[],['REENTRY']),tf('W1','SELL',[],['MOMENTUM']),
    tf('D1','BUY',['EXTREME']),tf('H4','BUY',['MHV']),
    tf('H1','BUY',['REENTRY']),tf('M30','BUY',['REENTRY']),
    tf('M15','BUY',['CSA']),tf('M5','BUY',['CSA'])
  ]};
  const snapshot=buildBbmaFractalSnapshot(evidence);
  assert.equal(snapshot.MN.role,'MACRO');
  assert.deepEqual(snapshot.MN.active_detectors,['REENTRY_SELL']);
  assert.equal(snapshot.D1.role,'STRUCTURE');
  assert.deepEqual(snapshot.D1.active_detectors,['EXTREME_BUY']);
  assert.equal(snapshot.M15.role,'TRIGGER');
  assert.deepEqual(snapshot.M15.active_detectors,['CSA_BUY']);
  assert.ok(Object.isFrozen(snapshot));
});

test('role assignment changes semantics but not detector methodology',()=>{
  assert.deepEqual(BBMA_TIMEFRAME_ROLES,{MN:'MACRO',W1:'MACRO',D1:'STRUCTURE',H4:'STRUCTURE',H1:'SETUP',M30:'SETUP',M15:'TRIGGER',M5:'TRIGGER'});
});

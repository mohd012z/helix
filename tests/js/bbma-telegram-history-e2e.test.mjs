import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTelegramObservationHistory} from '../../macro/bbma/telegram-history.mjs';

const row=(id,time,detectors,readiness='SETUP')=>({alert_id:id,symbol:'XAUUSD',generated_utc:time,bbma:{direction:'BUY',readiness,fractal_snapshot:{M15:{active_detectors:detectors}}},news:{gate:'ALLOW'},evidence:{reason_codes:['DIRECTION_BUY']}});

test('history sorts persisted observations chronologically and finds predecessor by alert id',()=>{
 const h=buildTelegramObservationHistory([row('b','2026-09-26T06:10:00Z',['EXTREME_BUY','CSA_BUY']),row('a','2026-09-26T06:05:00Z',['EXTREME_BUY'])]);
 assert.equal(h.getObservation('b').alert_id,'b');
 assert.equal(h.getPrevious('b').alert_id,'a');
 assert.equal(h.getPrevious('a'),null);
});

test('history isolates symbols and returns deterministic empty delta when no predecessor exists',()=>{
 const x=row('x','2026-09-26T06:05:00Z',['EXTREME_BUY']);
 const eur={...row('e','2026-09-26T06:04:00Z',['CSA_BUY']),symbol:'EURUSD'};
 const h=buildTelegramObservationHistory([eur,x]);
 assert.equal(h.getPrevious('x'),null);
 assert.deepEqual(h.getChanges(x),{added:[],removed:[],direction_changed:false,gate_changed:false,readiness_changed:false});
});

test('changes compare the persisted predecessor and explanation stays evidence-only',()=>{
 const a=row('a','2026-09-26T06:05:00Z',['EXTREME_BUY']);
 const b=row('b','2026-09-26T06:10:00Z',['EXTREME_BUY','CSA_BUY'],'CONFIRMED');
 const h=buildTelegramObservationHistory([a,b]);
 assert.deepEqual(h.getChanges(b).added,['CSA_BUY']);
 const why=h.getExplanation(b,{now:Date.parse('2026-09-26T06:11:00Z')});
 assert.equal(why.state,'CONFIRMED');
 assert.equal('orders' in why,false);
 assert.equal('lot_size' in why,false);
});

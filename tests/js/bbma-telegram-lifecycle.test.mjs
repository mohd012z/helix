import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTelegramLifecycle,telegramLifecycleTransition} from '../../macro/bbma/telegram-lifecycle.mjs';
import {explainTelegramObservation,diffTelegramObservations} from '../../macro/bbma/telegram-delta.mjs';

const base={generated_utc:'2026-09-26T06:00:00Z',bbma:{direction:'BUY',readiness:'SETUP',fractal_snapshot:{H1:{active_detectors:['MOMENTUM_BUY']},M15:{active_detectors:['EXTREME_BUY']}}},news:{gate:'ALLOW'},evidence:{reason_codes:['DIRECTION_BUY']}};

test('SETUP maps to P3 while confirmed clean evidence maps to P2',()=>{
 assert.deepEqual(classifyTelegramLifecycle(base,{now:Date.parse('2026-09-26T06:05:00Z')}),{state:'SETUP',priority:'P3',stale:false,incomplete:false,gate:'ALLOW',readiness:'SETUP'});
 const confirmed={...base,bbma:{...base.bbma,readiness:'CONFIRMED'}};
 assert.equal(classifyTelegramLifecycle(confirmed,{now:Date.parse('2026-09-26T06:05:00Z')}).state,'CONFIRMED');
});

test('stale observation expires and incomplete evidence cannot confirm',()=>{
 assert.equal(classifyTelegramLifecycle(base,{now:Date.parse('2026-09-26T07:00:00Z')}).state,'EXPIRED');
 const incomplete={...base,bbma:{...base.bbma,readiness:'CONFIRMED'},evidence:{reason_codes:['H1_UNAVAILABLE']}};
 assert.equal(classifyTelegramLifecycle(incomplete,{now:Date.parse('2026-09-26T06:05:00Z')}).state,'WATCH');
});

test('lifecycle transition notifies only meaningful non-WATCH state changes',()=>{
 assert.equal(telegramLifecycleTransition({state:'WATCH'},{state:'SETUP'}).notify,true);
 assert.equal(telegramLifecycleTransition({state:'SETUP'},{state:'SETUP'}).notify,false);
 assert.equal(telegramLifecycleTransition({state:'SETUP'},{state:'WATCH'}).notify,false);
});

test('why and changes expose evidence without execution instructions',()=>{
 const current={...base,bbma:{...base.bbma,fractal_snapshot:{...base.bbma.fractal_snapshot,M5:{active_detectors:['CSA_BUY']}}}};
 const why=explainTelegramObservation(current,{state:'SETUP',incomplete:false,stale:false});
 assert.deepEqual(why.detectors.sort(),['CSA_BUY','EXTREME_BUY','MOMENTUM_BUY'].sort());
 const delta=diffTelegramObservations(base,current);
 assert.deepEqual(delta.added,['CSA_BUY']); assert.deepEqual(delta.removed,[]);
 assert.equal('orders' in why,false); assert.equal('sl_tp' in why,false);
});

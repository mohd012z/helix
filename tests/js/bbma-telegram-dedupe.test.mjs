import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTelegramDeliveryPlan,telegramSignalKey} from '../../macro/bbma/telegram-dedupe.mjs';

const alert=(id,state,detectors=['EXTREME_BUY'])=>({alert_id:id,symbol:'XAUUSD',timeframe:'M15',direction:'BUY',lifecycle:{state},bbma:{direction:'BUY',fractal_snapshot:{M15:{active_detectors:detectors}}},news:{gate:'ALLOW'},evidence:{reason_codes:['DIRECTION_BUY']}});

test('signal key is stable across evidence updates for same BBMA lifecycle thread',()=>{
 assert.equal(telegramSignalKey(alert('a','SETUP')),telegramSignalKey(alert('b','CONFIRMED',['EXTREME_BUY','CSA_BUY'])));
});

test('first meaningful lifecycle event sends one message',()=>{
 const plan=buildTelegramDeliveryPlan({current:alert('a','SETUP'),previous:null,delivery:null});
 assert.equal(plan.operation,'send_message'); assert.equal(plan.notify,true);
});

test('evidence evolution edits existing Telegram message instead of duplicating it',()=>{
 const plan=buildTelegramDeliveryPlan({current:alert('b','CONFIRMED',['EXTREME_BUY','CSA_BUY']),previous:alert('a','SETUP'),delivery:{message_id:77}});
 assert.equal(plan.operation,'edit_message'); assert.equal(plan.message_id,77); assert.equal(plan.notify,true);
});

test('unchanged lifecycle and evidence are suppressed',()=>{
 const same=alert('b','SETUP');
 const plan=buildTelegramDeliveryPlan({current:same,previous:alert('a','SETUP'),delivery:{message_id:77}});
 assert.equal(plan.operation,'suppress'); assert.equal(plan.notify,false);
});

test('WATCH without an existing message remains silent',()=>{
 const plan=buildTelegramDeliveryPlan({current:alert('a','WATCH'),previous:null,delivery:null});
 assert.equal(plan.operation,'suppress'); assert.equal(plan.notify,false);
});

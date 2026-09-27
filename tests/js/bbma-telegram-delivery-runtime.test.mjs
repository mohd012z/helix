import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverTelegramLifecycle} from '../../macro/bbma/telegram-delivery-runtime.mjs';

const current={alert_id:'b',symbol:'XAUUSD',timeframe:'M15',direction:'BUY',lifecycle:{state:'CONFIRMED'},bbma:{direction:'BUY',fractal_snapshot:{M15:{active_detectors:['EXTREME_BUY','CSA_BUY']}}},news:{gate:'ALLOW'},evidence:{reason_codes:['DIRECTION_BUY']}};
const previous={...current,alert_id:'a',lifecycle:{state:'SETUP'},bbma:{...current.bbma,fractal_snapshot:{M15:{active_detectors:['EXTREME_BUY']}}}};

test('sends first meaningful message and persists returned message id',async()=>{
 const calls=[]; const writes=[];
 const result=await deliverTelegramLifecycle({current,previous:null,delivery:null,sendMessage:async payload=>{calls.push(payload);return {message_id:101};},editMessage:async()=>assert.fail('edit not expected'),persistDelivery:async x=>writes.push(x)});
 assert.equal(result.operation,'send_message'); assert.equal(result.message_id,101); assert.equal(calls.length,1); assert.equal(writes[0].message_id,101);
});

test('edits existing Telegram message and preserves message id',async()=>{
 const edits=[];
 const result=await deliverTelegramLifecycle({current,previous,delivery:{message_id:77},sendMessage:async()=>assert.fail('send not expected'),editMessage:async payload=>{edits.push(payload);return {message_id:77};},persistDelivery:async()=>{}});
 assert.equal(result.operation,'edit_message'); assert.equal(result.message_id,77); assert.equal(edits[0].message_id,77);
});

test('suppressed observation performs no Telegram write',async()=>{
 let calls=0; const result=await deliverTelegramLifecycle({current,previous:current,delivery:{message_id:77},sendMessage:async()=>{calls++;},editMessage:async()=>{calls++;},persistDelivery:async()=>{calls++;}});
 assert.equal(result.operation,'suppress'); assert.equal(calls,0);
});

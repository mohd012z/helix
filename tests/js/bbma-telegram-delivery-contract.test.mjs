import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTelegramDeliveryRequest,buildTelegramDeliveryEvidence } from '../../macro/bbma/telegram-delivery-contract.mjs';

const alert={alert_id:'obs-777',symbol:'XAUUSD',display_time_myt:'14:30',bbma:{direction:'BUY',readiness:'SETUP_READY',fractal_snapshot:{}},news:{impact:'HIGH',event:'USD event'},gate:{state:'CAUTION'}};

test('delivery request contains rendered message and six lifecycle buttons but no credential fields',()=>{
 const request=buildTelegramDeliveryRequest({alert});
 assert.equal(request.channel,'telegram');
 assert.equal(request.operation,'send_message');
 assert.equal(request.correlation_id,'obs-777');
 assert.equal(request.chat_ref,'BBMA_ALERTS');
 assert.equal('token' in request,false);
 assert.equal('chat_id' in request,false);
 const buttons=request.payload.reply_markup.inline_keyboard.flat();
 assert.equal(buttons.length,6);
 assert.ok(buttons.some(button=>button.callback_data==='bbma:why:obs-777'));
 assert.ok(buttons.some(button=>button.callback_data==='bbma:changes:obs-777'));
});

test('delivery evidence is correlated without storing secrets',()=>{
 const request=buildTelegramDeliveryRequest({alert});
 const evidence=buildTelegramDeliveryEvidence({request,result:{delivered:true,delivery_id:'tg-msg-9'},observedAtUtc:'2026-09-26T05:00:00Z'});
 assert.deepEqual(evidence,{channel:'telegram',correlation_id:'obs-777',observed_at_utc:'2026-09-26T05:00:00Z',delivered:true,delivery_id:'tg-msg-9',reason:null});
});

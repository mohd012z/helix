import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBbmaTelegramMessage } from '../../macro/bbma/telegram-template.mjs';
import { parseBbmaTelegramCallback,routeBbmaTelegramCallback } from '../../macro/bbma/telegram-callback.mjs';

const alert={alert_id:'obs-123',symbol:'XAUUSD',display_time_myt:'12:26',bbma:{direction:'BUY',readiness:'SETUP_READY',macro_context:'OPPOSED',structural_bias:'BUY',setup_state:'REENTRY_BUY',trigger_state:'CSA_BUY',fractal_snapshot:{MN:{active_detectors:['REENTRY_SELL']},M15:{active_detectors:['CSA_BUY']}}},news:{impact:'HIGH',event:'USD event'},gate:{state:'CAUTION'},evidence:{reason_codes:['DIRECTION_BUY']}};

test('builds compact BBMA+news Telegram message with six lifecycle inline buttons',()=>{
 const out=buildBbmaTelegramMessage(alert);
 assert.match(out.text,/XAUUSD/); assert.match(out.text,/REENTRY_SELL/); assert.match(out.text,/USD event/);
 const buttons=out.reply_markup.inline_keyboard.flat();
 assert.equal(buttons.length,6);
 assert.equal(out.reply_markup.inline_keyboard[0][0].callback_data,'bbma:mtf:obs-123');
 assert.ok(buttons.some(button=>button.callback_data==='bbma:why:obs-123'));
 assert.ok(buttons.some(button=>button.callback_data==='bbma:changes:obs-123'));
});

test('callback parser rejects unrelated input',()=>{
 assert.deepEqual(parseBbmaTelegramCallback('bbma:news:obs-123'),{scope:'bbma',action:'news',alert_id:'obs-123'});
 assert.equal(parseBbmaTelegramCallback('trade:buy:obs-123'),null);
});

test('historical buttons read immutable observation while status is explicitly current',()=>{
 const getObservation=id=>id==='obs-123'?alert:null;
 const hist=routeBbmaTelegramCallback({data:'bbma:mtf:obs-123',getObservation});
 assert.equal(hist.mode,'HISTORICAL_SNAPSHOT'); assert.deepEqual(hist.payload,alert.bbma.fractal_snapshot);
 const current=routeBbmaTelegramCallback({data:'bbma:status:obs-123',getObservation,getCurrentStatus:()=>({direction:'BUY',readiness:'CONFIRMABLE'})});
 assert.equal(current.mode,'CURRENT'); assert.equal(current.payload.readiness,'CONFIRMABLE');
});

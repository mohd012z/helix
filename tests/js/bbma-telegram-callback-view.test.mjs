import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTelegramCallbackView} from '../../macro/bbma/telegram-callback-view.mjs';

test('renders MTF snapshot across MN to M5',()=>{
 const out=renderTelegramCallbackView({ok:true,action:'mtf',payload:{MN:{active_detectors:['REENTRY_SELL']},W1:{direction:'SELL'},D1:{direction:'BUY'},M5:{active_detectors:['CSA_BUY']}}});
 assert.match(out.text,/MN\s+REENTRY_SELL/); assert.match(out.text,/W1\s+SELL/); assert.match(out.text,/D1\s+BUY/); assert.match(out.text,/M5\s+CSA_BUY/); assert.match(out.text,/HISTORICAL/);
});

test('renders news as context not direction source',()=>{
 const out=renderTelegramCallbackView({ok:true,action:'news',payload:{event:'USD CPI',impact:'HIGH',gate:'CAUTION'}});
 assert.match(out.text,/USD CPI/); assert.match(out.text,/contextualizes\/gates only/);
});

test('labels current status explicitly CURRENT',()=>{
 const out=renderTelegramCallbackView({ok:true,action:'status',payload:{direction:'BUY',readiness:'CONFIRMABLE'}});
 assert.match(out.text,/CURRENT STATUS/); assert.match(out.text,/Mode: CURRENT/); assert.match(out.text,/No broker execution/);
});

test('fails closed for unavailable observation',()=>{
 assert.match(renderTelegramCallbackView({ok:false,reason:'OBSERVATION_NOT_FOUND'}).text,/OBSERVATION_NOT_FOUND/);
});

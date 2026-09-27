import test from 'node:test';
import assert from 'node:assert/strict';
import {handleTelegramCallback} from '../../macro/bbma/telegram-callback-runtime.mjs';

const observation={alert_id:'obs-1',bbma:{fractal_snapshot:{MN:{active_detectors:['REENTRY_BUY']},M5:{active_detectors:['CSA_BUY']}}},news:{event:'USD CPI',impact:'HIGH'},evidence:{reason_codes:['DIRECTION_BUY']}};
const update=data=>({callback_query:{id:'cb-1',data,message:{message_id:99,chat:{id:123}}}});

test('routes MTF callback, acknowledges and responds to originating chat',async()=>{
 const calls=[];
 const out=await handleTelegramCallback({update:update('bbma:mtf:obs-1'),getObservation:id=>id==='obs-1'?observation:null,answerCallback:async x=>calls.push(['ack',x]),respond:async x=>calls.push(['response',x])});
 assert.equal(out.ok,true); assert.equal(out.mode,'HISTORICAL_SNAPSHOT'); assert.equal(calls[0][0],'ack'); assert.equal(calls[1][1].chatId,123); assert.match(calls[1][1].text,/BBMA MTF DETAIL/);
});

test('current status uses explicitly injected current-state provider',async()=>{
 let response;
 const out=await handleTelegramCallback({update:update('bbma:status:obs-1'),getObservation:()=>observation,getCurrentStatus:()=>({direction:'BUY',readiness:'CONFIRMABLE'}),answerCallback:async()=>{},respond:async x=>response=x});
 assert.equal(out.mode,'CURRENT'); assert.match(response.text,/Mode: CURRENT/);
});

test('unknown observation fails closed but still acknowledges callback',async()=>{
 let ack=false,response;
 const out=await handleTelegramCallback({update:update('bbma:evidence:ghost'),getObservation:()=>null,answerCallback:async()=>{ack=true;},respond:async x=>response=x});
 assert.equal(out.ok,false); assert.equal(ack,true); assert.match(response.text,/OBSERVATION_NOT_FOUND/);
});

test('ignores non callback updates',async()=>{
 assert.deepEqual(await handleTelegramCallback({update:{message:{text:'hello'}}}),{ok:false,reason:'NOT_CALLBACK_QUERY'});
});

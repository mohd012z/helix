import test from 'node:test';
import assert from 'node:assert/strict';
import {handleTelegramCallback} from '../../macro/bbma/telegram-callback-runtime.mjs';

const observation={alert_id:'obs-1',bbma:{fractal_snapshot:{MN:{active_detectors:['REENTRY_BUY']},M5:{active_detectors:['CSA_BUY']}}},news:{event:'USD CPI',impact:'HIGH'},evidence:{reason_codes:['DIRECTION_BUY']}};
const update=cbData=>({callback_query:{id:'cb-1',data:cbData,message:{message_id:99,chat:{id:123}}}});

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

const boardRows={'XAU/USD':{symbol:'XAU/USD',ok:true,last:3875.42,changePct:-0.21},'EUR/USD':{symbol:'EUR/USD',ok:true,last:1.17,changePct:0.04},'GBP/USD':{symbol:'GBP/USD',ok:true,last:1.36,changePct:0.09},'USD/JPY':{symbol:'USD/JPY',ok:true,last:146.2,changePct:-0.03}};
const lookup=new Map(Object.entries(boardRows).map(([k,v])=>[k.toUpperCase().replace(/[^A-Z0-9]/g,''),v]));

test('status for a non-observed board symbol returns PRICE_ONLY (no BBMA fabrication)',async()=>{
 let response;
 const out=await handleTelegramCallback({update:update('bbma:status:EUR/USD'),getObservation:()=>null,getObservationBySymbol:()=>null,getBoardSymbol:s=>lookup.get(s.toUpperCase().replace(/[^A-Z0-9]/g,''))??null,boardRows,answerCallback:async()=>{},respond:async x=>response=x});
 assert.equal(out.ok,true); assert.equal(out.mode,'PRICE_ONLY');
 assert.match(response.text,/PRICE_ONLY/); assert.match(response.text,/EUR\/USD/); assert.match(response.text,/1.17/);
 assert.doesNotMatch(response.text,/Direction:/);
});

test('status card carries the dashboard + symbol keyboard row',async()=>{
 let response;
 const out=await handleTelegramCallback({update:update('bbma:status:obs-1'),getObservation:()=>observation,getCurrentStatus:()=>({direction:'BUY',readiness:'CONFIRMABLE'}),boardRows,answerCallback:async()=>{},respond:async x=>response=x});
 assert.equal(out.mode,'CURRENT');
 const kb=response.reply_markup;
 assert.ok(Array.isArray(kb)&&kb.length===1);
 const dash=kb[0].find(b=>b.text==='📈 BBMA Dashboard');
 assert.ok(dash); assert.match(dash.url,/^https:/);
 // XAU/USD is the primary symbol -> excluded; 3 symbol buttons follow (EUR/GBP/USD-JPY)
 assert.equal(kb[0].length,4);
 const data=kb[0].map(b=>b.callback_data??null);
 assert.deepEqual(data,[null,'bbma:status:EUR/USD','bbma:status:GBP/USD','bbma:status:USD/JPY']);
});

test('observed symbol id takes precedence over board price (XAU status = BBMA not price)',async()=>{
 let response;
 const out=await handleTelegramCallback({update:update('bbma:status:XAUUSD'),getObservation:id=>id==='XAUUSD'?observation:null,getObservationBySymbol:s=>s.toUpperCase().includes('XAU')?observation:null,getCurrentStatus:()=>({direction:'BUY',readiness:'CONFIRMABLE'}),getBoardSymbol:s=>lookup.get(s.toUpperCase().replace(/[^A-Z0-9]/g,''))??null,boardRows,answerCallback:async()=>{},respond:async x=>response=x});
 assert.equal(out.mode,'CURRENT'); assert.match(response.text,/Mode: CURRENT/);
});

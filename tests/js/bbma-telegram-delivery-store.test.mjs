import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelegramDeliveryStore} from '../../macro/bbma/telegram-delivery-store.mjs';

test('persist and recover signal key to Telegram message id across store instances',async()=>{
 const memory=new Map();
 const adapter={read:async key=>memory.get(key)??null,write:async(key,value)=>memory.set(key,value)};
 const a=createTelegramDeliveryStore(adapter);
 await a.persist({signal_key:'XAUUSD|M15|BUY',message_id:101,alert_id:'obs-a',operation:'send_message'});
 const b=createTelegramDeliveryStore(adapter);
 assert.deepEqual(await b.get('XAUUSD|M15|BUY'),{signal_key:'XAUUSD|M15|BUY',message_id:101,alert_id:'obs-a',operation:'send_message'});
});

test('new lifecycle update replaces metadata while preserving explicit message id',async()=>{
 const memory=new Map(); const adapter={read:async k=>memory.get(k)??null,write:async(k,v)=>memory.set(k,v)};
 const store=createTelegramDeliveryStore(adapter);
 await store.persist({signal_key:'XAUUSD|M15|BUY',message_id:77,alert_id:'a',operation:'send_message'});
 await store.persist({signal_key:'XAUUSD|M15|BUY',message_id:77,alert_id:'b',operation:'edit_message'});
 const x=await store.get('XAUUSD|M15|BUY'); assert.equal(x.message_id,77); assert.equal(x.alert_id,'b'); assert.equal(x.operation,'edit_message');
});

test('invalid persisted records fail closed',async()=>{
 const store=createTelegramDeliveryStore({read:async()=>({message_id:null}),write:async()=>{}});
 assert.equal(await store.get('XAUUSD|M15|BUY'),null);
});

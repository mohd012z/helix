import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTelegramDelivery } from '../../macro/bbma/telegram-adapter.mjs';

test('executes credential-free request through injected sender',async()=>{
 const request={channel:'telegram',operation:'send_message',chat_ref:'BBMA_ALERTS',correlation_id:'obs-1',payload:{text:'test'}};
 let received=null;
 const out=await executeTelegramDelivery({request,sendMessage:async input=>{received=input;return {delivered:true,delivery_id:'msg-1'};}});
 assert.deepEqual(received,{chatRef:'BBMA_ALERTS',payload:{text:'test'},correlationId:'obs-1'});
 assert.deepEqual(out,{delivered:true,delivery_id:'msg-1',reason:null});
});

test('fails closed when no sender is injected',async()=>{
 await assert.rejects(()=>executeTelegramDelivery({request:{channel:'telegram',operation:'send_message'}}),/sendMessage adapter is required/);
});

import {buildTelegramDeliveryPlan} from './telegram-dedupe.mjs';
import {buildBbmaTelegramMessage} from './telegram-template.mjs';

export async function deliverTelegramLifecycle({current,previous=null,delivery=null,sendMessage,editMessage,persistDelivery}={}){
 const plan=buildTelegramDeliveryPlan({current,previous,delivery});
 if(plan.operation==='suppress') return Object.freeze({...plan,message_id:plan.message_id??null});
 if(typeof persistDelivery!=='function') throw new TypeError('persistDelivery is required');
 const message=buildBbmaTelegramMessage(current);
 let result;
 if(plan.operation==='send_message'){
  if(typeof sendMessage!=='function') throw new TypeError('sendMessage is required');
  result=await sendMessage(message);
 }else{
  if(typeof editMessage!=='function') throw new TypeError('editMessage is required');
  result=await editMessage({...message,message_id:plan.message_id});
 }
 const messageId=result?.message_id??plan.message_id??null;
 if(messageId==null) throw new Error('Telegram delivery returned no message_id');
 await persistDelivery({signal_key:plan.signal_key,message_id:messageId,alert_id:String(current.alert_id??current.observation_id??''),operation:plan.operation});
 return Object.freeze({...plan,message_id:messageId,delivered:true});
}

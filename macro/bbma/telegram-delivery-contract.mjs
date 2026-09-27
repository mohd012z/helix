import { buildBbmaTelegramMessage } from './telegram-template.mjs';

export function buildTelegramDeliveryRequest({alert,chatRef='BBMA_ALERTS'}={}){
  if(!alert||typeof alert!=='object') throw new TypeError('alert is required');
  const message=buildBbmaTelegramMessage(alert);
  return Object.freeze({
    channel:'telegram',
    chat_ref:String(chatRef),
    operation:'send_message',
    payload:message,
    correlation_id:String(alert.alert_id??'unknown')
  });
}

export function buildTelegramDeliveryEvidence({request,result,observedAtUtc}={}){
  if(!request||request.channel!=='telegram') throw new TypeError('telegram delivery request is required');
  return Object.freeze({
    channel:'telegram',
    correlation_id:request.correlation_id,
    observed_at_utc:observedAtUtc??null,
    delivered:Boolean(result?.delivered),
    delivery_id:result?.delivery_id??null,
    reason:result?.reason??null
  });
}

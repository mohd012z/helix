export async function executeTelegramDelivery({request,sendMessage}={}){
  if(!request||request.channel!=='telegram'||request.operation!=='send_message') throw new TypeError('valid telegram delivery request is required');
  if(typeof sendMessage!=='function') throw new TypeError('sendMessage adapter is required');
  const result=await sendMessage({chatRef:request.chat_ref,payload:request.payload,correlationId:request.correlation_id});
  return Object.freeze({
    delivered:Boolean(result?.delivered),
    delivery_id:result?.delivery_id??null,
    reason:result?.reason??null
  });
}

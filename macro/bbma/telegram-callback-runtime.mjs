import {routeBbmaTelegramCallback} from './telegram-callback.mjs';
import {renderTelegramCallbackView} from './telegram-callback-view.mjs';

export async function handleTelegramCallback({update,getObservation,getCurrentStatus,getExplanation,getChanges,getObservationBySymbol=null,getBoardSymbol=null,boardRows=null,dashboardUrl=null,answerCallback,respond}={}){
  const q=update?.callback_query;
  if(!q?.id||typeof q.data!=='string') return Object.freeze({ok:false,reason:'NOT_CALLBACK_QUERY'});
  if(typeof answerCallback!=='function'||typeof respond!=='function') throw new TypeError('Telegram callback adapters are required');

  const routed=routeBbmaTelegramCallback({data:q.data,getObservation,getCurrentStatus,getExplanation,getChanges,getObservationBySymbol,getBoardSymbol});
  // The view reads these for the status-card keyboard (dashboard + symbol row).
  // Attach only when present so other views are unchanged.
  const view=renderTelegramCallbackView({...routed,boardRows,dashboardUrl});

  await answerCallback({callbackQueryId:q.id,text:routed.ok?'Loaded':'Unavailable'});
  const target={chatId:q.message?.chat?.id??null,messageId:q.message?.message_id??null};
  if(target.chatId==null) return Object.freeze({ok:false,reason:'CALLBACK_CHAT_UNAVAILABLE'});

  await respond({...target,...view});
  return Object.freeze({ok:Boolean(routed.ok),action:routed.action??null,alert_id:routed.alert_id??null,mode:routed.mode??null});
}

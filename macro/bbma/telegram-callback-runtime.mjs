import {routeBbmaTelegramCallback} from './telegram-callback.mjs';
import {renderTelegramCallbackView} from './telegram-callback-view.mjs';
import {ifxMenuCallbackData, renderIfxMainMenu, renderIfxMenuView, unwrapIfxMenuData} from './ifx-menu-view.mjs';

export async function handleTelegramCallback({update,getObservation,getCurrentStatus,getExplanation,getChanges,getObservationBySymbol=null,getBoardSymbol=null,boardRows=null,dashboardUrl=null,pinned=null,ifxData=null,answerCallback,respond,onChannelCallback=null}={}){
  const q=update?.callback_query;
  if(!q?.id||typeof q.data!=='string') return Object.freeze({ok:false,reason:'NOT_CALLBACK_QUERY'});
  if(typeof answerCallback!=='function'||typeof respond!=='function') throw new TypeError('Telegram callback adapters are required');

  // IFX UI menu buttons (ifx:menu:*). Rendered from the injected news/ATR/macro
  // data bundle (unwrapped to the raw {now, newsAuto, atr, atrMtf, macro} shape);
  // independent of the BBMA observation router below.
  if(q.data===ifxMenuCallbackData(null)||q.data.startsWith('ifx:menu:')){
    const action=q.data.split(':')[2]??null;

    // Linked-channel recheck (weekly/upcoming/pivots callback buttons on a
    // channel post): the bot EDITs the tapped channel post in place with fresh
    // output (zero browser, zero DM) via the injected hook.
    if(onChannelCallback && (action==='weekly'||action==='upcoming'||action==='pivots')
       && q.message?.chat?.type==='channel'){
      try{
        await answerCallback({callbackQueryId:q.id,text:'Loading…'});
        const r=await onChannelCallback({action,chatId:q.message.chat.id,messageId:q.message.message_id});
        return Object.freeze({ok:true,action:'ifx-channel-edit',section:action,channelMessageId:r?.channelMessageId??null});
      }catch(e){
        await answerCallback({callbackQueryId:q.id,text:'Retry shortly'});
        return Object.freeze({ok:false,action:'ifx-channel-edit',section:action,error:String(e?.message??e)});
      }
    }

    const bundle=unwrapIfxMenuData(ifxData);
    const view=action?renderIfxMenuView(action,bundle,{boardRows,dashboardUrl,pinned}):renderIfxMainMenu({boardRows,dashboardUrl});
    await answerCallback({callbackQueryId:q.id,text:'Loaded'});
    const target={chatId:q.message?.chat?.id??null,messageId:q.message?.message_id??null};
    if(target.chatId==null) return Object.freeze({ok:false,reason:'CALLBACK_CHAT_UNAVAILABLE'});
    await respond({...target,...view});
    return Object.freeze({ok:true,action:'ifx-menu',mode:'IFX_MENU',section:action??null});
  }

  const routed=routeBbmaTelegramCallback({data:q.data,getObservation,getCurrentStatus,getExplanation,getChanges,getObservationBySymbol,getBoardSymbol});
  // The view reads these for the status-card keyboard (dashboard + symbol row).
  // Attach only when present so other views are unchanged.
  const view=renderTelegramCallbackView({...routed,boardRows,dashboardUrl,pinned});

  await answerCallback({callbackQueryId:q.id,text:routed.ok?'Loaded':'Unavailable'});
  const target={chatId:q.message?.chat?.id??null,messageId:q.message?.message_id??null};
  if(target.chatId==null) return Object.freeze({ok:false,reason:'CALLBACK_CHAT_UNAVAILABLE'});

  await respond({...target,...view});
  return Object.freeze({ok:Boolean(routed.ok),action:routed.action??null,alert_id:routed.alert_id??null,mode:routed.mode??null});
}

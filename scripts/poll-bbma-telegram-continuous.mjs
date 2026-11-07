#!/usr/bin/env node
/* Continuous 24/7 BBMA Telegram callback poller — local primary answer path.
 *
 * The bounded "BBMA Telegram Callback Live" GitHub Action only listens for a
 * ~50s window on manual dispatch, so button clicks outside that window are
 * silently dropped (Telegram re-delivers nothing; the user sees no reply).
 * This script runs forever (supervised by s6/cron), keeps the offset persisted
 * so a restart never re-processes or loses callbacks, and answers 409
 * "conflict" (another poller, e.g. a manual GH dispatch, is in-flight) by
 * waiting instead of crashing.
 *
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (same as the bounded poller).
 * Offset state: TELEGRAM_OFFSET_FILE (default data/bbma-telegram-offset.json).
 * Ledger: BBMA_OBSERVATION_LEDGER (default data/bbma-shadow-observations.json),
 *          falling back to data/bbma-telegram-validation.json (synthetic obs).
 *
 * Loop core lives in macro/bbma/telegram-poller.mjs (DI, unit-tested).
 */
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {makeTelegramApi, makeOffsetStore, runCallbackPollLoop} from '../macro/bbma/telegram-poller.mjs';
import {handleTelegramCallback} from '../macro/bbma/telegram-callback-runtime.mjs';
import {adaptShadowObservationForTelegram} from '../macro/bbma/telegram-observation-adapter.mjs';
import {buildTelegramObservationHistory} from '../macro/bbma/telegram-history.mjs';
import {buildSymbolLookup} from '../macro/bbma/telegram-symbol-board.mjs';
import {loadIfxMenuData} from '../macro/bbma/ifx-news-source.mjs';
import {renderIfxMainMenu, parseIfxMenuPayload, renderChannelMenuCard, renderChannelRecheck, renderChannelLiveView} from '../macro/bbma/ifx-menu-view.mjs';

const token=process.env.TELEGRAM_BOT_TOKEN;
const allowedChat=String(process.env.TELEGRAM_CHAT_ID ?? '');
const offsetFile=process.env.TELEGRAM_OFFSET_FILE??path.join('data','bbma-telegram-offset.json');
const ledgerPath=process.env.BBMA_OBSERVATION_LEDGER??path.join('data','bbma-shadow-observations.json');
const fallbackPath=path.join('data','bbma-telegram-validation.json');
const boardFile=process.env.BBMA_BOARD_FILE??'xauusd-data.js';
const dashboardUrl=process.env.BBMA_DASHBOARD_URL??'https://mohd012z.github.io/helix/';
// The "ifxhelper2" Telegram CHANNEL (broadcast). The bot is an administrator
// there; inline CALLBACK buttons don't render on it (no linked chat), so the
// channel menu uses /start URL deep-links that land in the DM and trigger a
// fresh recheck + repost here. IFX_CHANNEL_ID defaults to the channel handle.
const channelChatId=process.env.IFX_CHANNEL_ID??'@ifxhelper2';
const botUsername=process.env.IFX_BOT_USERNAME??'news_ifxhelperbot';
// Comma-separated pinned symbols shown first on the symbol row.
const pinned=(process.env.BBMA_PINNED_SYMBOLS??'XAUUSD,BTCUSD').split(',').map(s=>s.trim()).filter(Boolean);
const LIFECYCLE_REFRESH_MS=Math.max(15000,Number(process.env.LIFECYCLE_REFRESH_MS??300000));
if(!token||!allowedChat){console.error('Telegram secrets are not configured');process.exit(2);}

const log=(...a)=>console.log(...a);
const api=makeTelegramApi({fetchFn:fetch,token,log});
const offsetStore=makeOffsetStore({fs,path,filePath:offsetFile,log});

// Send a rendered view to an arbitrary chat (the channel) using the same API
// client. Normalizes reply_markup: an array (DM view convention) is wrapped in
// {inline_keyboard}; an object is used as-is (channel view convention).
async function sendToChat(chatId, view){
  const payload={chat_id:chatId,text:view.text,parse_mode:view.parse_mode};
  const rb=view.reply_markup;
  if(Array.isArray(rb)&&rb.length) payload.reply_markup={inline_keyboard:rb};
  else if(rb&&typeof rb==='object') payload.reply_markup=rb;
  if(view.disable_web_page_preview) payload.disable_web_page_preview=true;
  return api('sendMessage',payload);
}

// The desk board (16 symbols, xauusd-data.js `board.symbols`) feeds the
// symbol-selection row. It's a generated artifact — parse defensively and
// fall back to an empty board (dashboard button still works) if it's stale.
function loadBoardRows(file){
  try{
    const raw=fs.readFileSync(file,'utf8');
    const m=raw.match(/window\.XAUUSD_DATA\s*=\s*/);
    if(!m) return {};
    const obj=JSON.parse(raw.slice(m.index+m[0].length).replace(/;\s*$/,''));
    const symbols=obj?.board?.symbols;
    return (symbols&&typeof symbols==='object')?symbols:{};
  }catch(e){log(`DIAG board_load=FAIL reason=${e.message}`);return {};}
}

const readRows=p=>{const raw=JSON.parse(fs.readFileSync(p,'utf8'));return Array.isArray(raw)?raw:(raw.observations??[]);};
const loadLedger=()=>{let rows=[],source='NONE';try{rows=readRows(ledgerPath);source=ledgerPath;}catch(e){try{rows=readRows(fallbackPath);source=fallbackPath;}catch(x){return {rows:[],source:'NONE'};}}const adapted=[];for(const row of rows){try{adapted.push(row?.kind==='BBMA_NEWS_SHADOW_OBSERVATION'?adaptShadowObservationForTelegram(row):row);}catch{}}return {rows:adapted,source};};

let boardRows=loadBoardRows(boardFile);
let boardLookup=buildSymbolLookup(boardRows);
const initLedger=loadLedger();
let history=buildTelegramObservationHistory(initLedger.rows);
// 0 => force a full local refresh on the first cycle (the pinned LIVE post
// appears at startup instead of after one lifecycle interval).
let lastRefresh=0;
// IFX UI menu data (news/calendar/ATR/macro) — refreshed with the lifecycle
// cycle so menu answers stay current without fetching on every button tap.
let ifxData={newsAuto:null,atr:null,atrMtf:null,macro:null,now:Date.now()};

// Pinned "LIVE" post on the channel: created once, then EDITED IN PLACE every
// data refresh so subscribers always see fresh output with zero taps. The
// post id is persisted so a restart doesn't create a duplicate.
const livePostFile=process.env.IFX_LIVE_POST_FILE??path.join('data','bbma-ifx-live-post.json');
const loadLivePostId=()=>{try{const o=JSON.parse(fs.readFileSync(livePostFile,'utf8'));return Number(o?.messageId)||null;}catch{return null;}};
const saveLivePostId=(id)=>{try{fs.mkdirSync(path.dirname(livePostFile),{recursive:true});fs.writeFileSync(livePostFile,JSON.stringify({messageId:id,updatedAt:new Date().toISOString()}));}catch(e){log(`DIAG live_post_save=FAIL reason=${e.message}`);}};
let livePostId=loadLivePostId();

async function refreshLivePost(data, { linked = false } = {}){
  if(!data?.newsAuto?.ok) return; // fail-closed: never pin an empty/failed view
  const view=renderChannelLiveView(data,{now:data.now,botUsername,linked});
  try{
    if(!livePostId){
      const sent=await api('sendMessage',{chat_id:channelChatId,text:view.text,parse_mode:view.parse_mode,disable_web_page_preview:true,reply_markup:{inline_keyboard:view.reply_markup}});
      livePostId=sent?.message_id??null;
      if(livePostId){saveLivePostId(livePostId);
        try{await api('pinChatMessage',{chat_id:channelChatId,message_id:livePostId,disable_notification:true});log(`DIAG live_post=pinned id=${livePostId}`);}
        catch(pe){log(`DIAG live_post_pin=FAIL reason=${pe.message} (post still live id=${livePostId})`);}}
    }else{
      await api('editMessageText',{chat_id:channelChatId,message_id:livePostId,text:view.text,parse_mode:view.parse_mode,disable_web_page_preview:true,reply_markup:{inline_keyboard:view.reply_markup}});
    }
    log(`DIAG live_post=updated id=${livePostId} at=${view.text.split('\n')[0].replace(/<[^>]+>/g,'')}`);
  }catch(e){
    // Post was deleted (or first send raced) -> recreate once.
    const desc=`${e?.description??''} ${e?.message??''}`;
    if(/message to edit not found/i.test(desc)){
      log('DIAG live_post=deleted, recreating');
      try{
        const sent=await api('sendMessage',{chat_id:channelChatId,text:view.text,parse_mode:view.parse_mode,disable_web_page_preview:true,reply_markup:{inline_keyboard:view.reply_markup}});
        livePostId=sent?.message_id??null;
        if(livePostId){saveLivePostId(livePostId);await api('pinChatMessage',{chat_id:channelChatId,message_id:livePostId,disable_notification:true});}
        log(`DIAG live_post=recreated id=${livePostId}`);
      }catch(e2){log(`DIAG live_post_recreate=FAIL reason=${e2.message}`);}
    }else log(`DIAG live_post=FAIL reason=${e.message}`);
  }
}

log(`DIAG start pid=${process.pid} offset=${offsetStore.load()} lifecycle_refresh_ms=${LIFECYCLE_REFRESH_MS} live_post_id=${livePostId}`);
log(`DIAG ledger_source=${initLedger.source} observations=${history.size} board_symbols=${boardLookup.size}`);

// Linked-discussion-group detection (checked each data refresh, cached 10 min):
// getChat(@ifxhelper2).linked_chat_id is only visible to the bot when it is a
// MEMBER of the linked group. true -> channel buttons become callback buttons
// and tapping one edits the channel post IN PLACE (no browser, no DM).
let linkedState={linked:false,checkedAt:0};
const LINKED_TTL_MS=10*60*1000;
const groupWelcomeFile=process.env.IFX_GROUP_WELCOME_FILE??path.join('data','bbma-ifx-group-welcomed.json');
const groupWelcomed=()=>{try{return !!JSON.parse(fs.readFileSync(groupWelcomeFile,'utf8')).ok;}catch{return false;}};
const markGroupWelcomed=(id)=>{try{fs.mkdirSync(path.dirname(groupWelcomeFile),{recursive:true});fs.writeFileSync(groupWelcomeFile,JSON.stringify({ok:true,chatId:id,at:new Date().toISOString()}));}catch(e){log(`DIAG group_welcome_save=FAIL reason=${e.message}`);}};
async function isChannelLinked(){
  if(Date.now()-linkedState.checkedAt<LINKED_TTL_MS) return linkedState.linked;
  try{
    const g=await api('getChat',{chat_id:channelChatId});
    linkedState={linked:Boolean(g?.linked_chat_id),checkedAt:Date.now()};
    log(`DIAG channel_linked=${linkedState.linked} linked_chat_id=${g?.linked_chat_id??'none'}`);
    // First time we see the group: introduce it so members/subscribers know
    // what it is for (one-time, persisted so restarts don't re-post).
    if(g?.linked_chat_id&&!groupWelcomed()){
      try{
        await api('sendMessage',{chat_id:g.linked_chat_id,text:
          '📡 This is the official discussion group for the <b>ifxhelper_Trader</b> channel (@ifxhelper2).\n'+
          '• Comments on channel posts appear here.\n'+
          '• The channel menu buttons (📰 Weekly News · 🔭 Upcoming Events) now <b>update the channel post in place</b> — no browser, no bot chat.\n\n'+
          'Research context only — not a direction call.',
          parse_mode:'HTML'});
        markGroupWelcomed(g.linked_chat_id);
        log(`DIAG group_welcome=posted chat_id=${g.linked_chat_id}`);
      }catch(e2){log(`DIAG group_welcome=FAIL reason=${e2.description??e2.message}`);}
    }
  }catch(e){log(`DIAG channel_linked=check_fail reason=${e.message} (keeping ${linkedState.linked})`);}
  return linkedState.linked;
}

// Channel callback hook: fresh data -> renderChannelRecheck -> editMessageText
// on the tapped channel post. The reply_markup re-carries the menu, so the
// post stays tappable after every tap.
async function onChannelCallback({action,chatId,messageId}){
  const fresh=await loadIfxMenuData({});
  if(!fresh.newsAuto?.ok) throw new Error('news feed not loaded yet');
  const view=renderChannelRecheck(action,fresh,{now:fresh.now,botUsername,dashboardUrl,linked:linkedState.linked});
  await api('editMessageText',{chat_id:chatId,message_id:messageId,text:view.text,parse_mode:view.parse_mode,disable_web_page_preview:true,reply_markup:{inline_keyboard:view.reply_markup}});
  return {channelMessageId:messageId};
}

const onCycle=async()=>{
  if(Date.now()-lastRefresh>=LIFECYCLE_REFRESH_MS){
    try{
      const {rows,source}=loadLedger();
      history=buildTelegramObservationHistory(rows);
      boardRows=loadBoardRows(boardFile);
      boardLookup=buildSymbolLookup(boardRows);
      ifxData=await loadIfxMenuData({});
      lastRefresh=Date.now();
      log(`DIAG ledger_refresh observations=${history.size} source=${source} board_symbols=${boardLookup.size} ifx_news=${ifxData.newsAuto?.ok?ifxData.newsAuto.source:'none'}`);
      const linked=await isChannelLinked();
      await refreshLivePost(ifxData,{linked}); // create-or-edit the pinned LIVE channel post
    }catch(e){log(`DIAG ledger_refresh=FAIL reason=${e.message}`);}
  }
};

// Menu entry: /menu /start /help and the section aliases. Any other text is
// answered with a menu pointer (never silently dropped), so the bot always acks.
const MENU_TRIGGERS=new Set(['/menu','/start','/help','menu','m','home','main','news event','bbma','news update','analysis']);
const CHANNEL_RECHECK=new Set(['weekly','upcoming']); // recheck + repost to @ifxhelper2
// "home" from a channel button: just re-post the channel menu card (no data reload needed).
async function handleMenuMessage({chatId,text},{respond}){
  const t=String(text??'').trim();
  const payload=parseIfxMenuPayload(t);

  // 1) Channel deep-link rechecks (/start ifx:menu:weekly | ifx:menu:upcoming):
  //    force a FRESH data reload, render the channel report, repost to the
  //    channel, and confirm in the DM. This is the "recheck & update" action.
  if(payload&&CHANNEL_RECHECK.has(payload)){
    try{
      const fresh=await loadIfxMenuData({});
      const view=renderChannelRecheck(payload,fresh,{now:fresh.now,botUsername,dashboardUrl,linked:linkedState.linked});
      const sent=await sendToChat(channelChatId,view);
      const myt=new Date(fresh.now+8*3600*1000).toISOString().slice(11,16);
      const label=payload==='upcoming'?'🔭 upcoming events':'📰 weekly news';
      await respond({chatId,text:`✅ Rechecked ${label} and reposted to the channel (${myt} MYT).\nChannel post id: ${sent?.message_id??'—'}`,parse_mode:'HTML'});
      return Object.freeze({ok:true,action:'ifx-channel-recheck',section:payload,channelMessageId:sent?.message_id??null});
    }catch(e){
      await respond({chatId,text:`⚠️ Recheck failed: ${String(e?.message??e)} — will retry on the next tap.`,parse_mode:'HTML'});
      return Object.freeze({ok:false,action:'ifx-channel-recheck',section:payload,error:String(e?.message??e)});
    }
  }

  // 2) "home" from a channel button: re-post the channel menu card to the channel.
  if(payload==='home'){
    try{
      const card=renderChannelMenuCard({botUsername,dashboardUrl,linked:linkedState.linked});
      const sent=await sendToChat(channelChatId,card);
      await respond({chatId,text:`✅ Reposted the channel menu card (id ${sent?.message_id??'—'}). Tap a button to recheck.`,parse_mode:'HTML'});
      return Object.freeze({ok:true,action:'ifx-channel-card',channelMessageId:sent?.message_id??null});
    }catch(e){
      await respond({chatId,text:`⚠️ Could not post the channel card: ${String(e?.message??e)}`,parse_mode:'HTML'});
      return Object.freeze({ok:false,action:'ifx-channel-card',error:String(e?.message??e)});
    }
  }

  // 3) Plain menu triggers (and the other section aliases) -> the DM keyboard.
  const isMenuTrigger=MENU_TRIGGERS.has(t.toLowerCase())||payload!=null;
  const view=isMenuTrigger?renderIfxMainMenu({boardRows,dashboardUrl,pinned})
    :{text:`📡 Send /menu for the IFX menu (News Event · BBMA · News Update · Analysis).\nChannel recheck: tap a button on the @ifxhelper2 menu card.`,parse_mode:'HTML'};
  await respond({chatId,...view});
  return Object.freeze({ok:true,action:'ifx-menu-message',triggered:isMenuTrigger});
}

try{
  // Resolve the channel handle to its numeric id (callback updates carry
  // numeric chat ids; the DM authorizedChat is already numeric).
  let channelId=null;
  try{const cg=await api('getChat',{chat_id:channelChatId});channelId=cg?.id??null;log(`DIAG channel_id=${channelId} title=${cg?.title}`);}
  catch(e){log(`DIAG channel_id=resolve_fail reason=${e.message}`);}
  await runCallbackPollLoop({
    api,
    offsetStore,
    authorizedChat:allowedChat,
    channelChatId:channelId,
    log,
    onCycle,
    allowedUpdates:['callback_query','message'],
    handleMessage:(m,ctx)=>handleMenuMessage(m,ctx),
    handleUpdate:(u,{answerCallback,respond})=>handleTelegramCallback({
      update:u,
      getObservation:id=>history.getObservation(String(id)),
      getObservationBySymbol:symbol=>history.getBySymbol(symbol),
      getCurrentStatus:obs=>({direction:obs?.bbma?.direction??obs?.direction??'UNAVAILABLE',readiness:obs?.bbma?.readiness??obs?.readiness??'UNAVAILABLE'}),
      getExplanation:obs=>history.getExplanation(obs),
      getChanges:obs=>history.getChanges(obs),
      getBoardSymbol:symbol=>boardLookup.get(String(symbol).toUpperCase().replace(/[^A-Z0-9]/g,''))??null,
      boardRows,
      dashboardUrl,
      pinned,
      ifxData,
      answerCallback,
      respond,
      onChannelCallback,
    }),
  });
}catch(e){
  console.error(`FATAL poller exited: ${e?.message}`);
  process.exit(1);
}

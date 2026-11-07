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
import {renderIfxMainMenu} from '../macro/bbma/ifx-menu-view.mjs';

const token=process.env.TELEGRAM_BOT_TOKEN;
const allowedChat=String(process.env.TELEGRAM_CHAT_ID ?? '');
const offsetFile=process.env.TELEGRAM_OFFSET_FILE??path.join('data','bbma-telegram-offset.json');
const ledgerPath=process.env.BBMA_OBSERVATION_LEDGER??path.join('data','bbma-shadow-observations.json');
const fallbackPath=path.join('data','bbma-telegram-validation.json');
const boardFile=process.env.BBMA_BOARD_FILE??'xauusd-data.js';
const dashboardUrl=process.env.BBMA_DASHBOARD_URL??'https://mohd012z.github.io/helix/';
// Comma-separated pinned symbols shown first on the symbol row.
const pinned=(process.env.BBMA_PINNED_SYMBOLS??'XAUUSD,BTCUSD').split(',').map(s=>s.trim()).filter(Boolean);
const LIFECYCLE_REFRESH_MS=Math.max(15000,Number(process.env.LIFECYCLE_REFRESH_MS??300000));
if(!token||!allowedChat){console.error('Telegram secrets are not configured');process.exit(2);}

const log=(...a)=>console.log(...a);
const api=makeTelegramApi({fetchFn:fetch,token,log});
const offsetStore=makeOffsetStore({fs,path,filePath:offsetFile,log});

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
let lastRefresh=Date.now();
// IFX UI menu data (news/calendar/ATR/macro) — refreshed with the lifecycle
// cycle so menu answers stay current without fetching on every button tap.
let ifxData={newsAuto:null,atr:null,atrMtf:null,macro:null,now:Date.now()};
log(`DIAG start pid=${process.pid} offset=${offsetStore.load()} lifecycle_refresh_ms=${LIFECYCLE_REFRESH_MS}`);
log(`DIAG ledger_source=${initLedger.source} observations=${history.size} board_symbols=${boardLookup.size}`);

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
    }catch(e){log(`DIAG ledger_refresh=FAIL reason=${e.message}`);}
  }
};

// Menu entry: /menu /start /help and the section aliases. Any other text is
// answered with a menu pointer (never silently dropped), so the bot always acks.
const MENU_TRIGGERS=new Set(['/menu','/start','/help','menu','m','home','main','news event','bbma','news update','analysis']);
async function handleMenuMessage({chatId,text,replyMarkup},{respond}){
  const t=String(text??'').trim();
  const isMenuTrigger=MENU_TRIGGERS.has(t.toLowerCase());
  const view=isMenuTrigger?renderIfxMainMenu({boardRows,dashboardUrl,pinned})
    :{text:`📡 Send /menu for the IFX menu (News Event · BBMA · News Update · Analysis).`,parse_mode:'HTML'};
  await respond({chatId,...view});
  return Object.freeze({ok:true,action:'ifx-menu-message',triggered:isMenuTrigger});
}

try{
  await runCallbackPollLoop({
    api,
    offsetStore,
    authorizedChat:allowedChat,
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
    }),
  });
}catch(e){
  console.error(`FATAL poller exited: ${e?.message}`);
  process.exit(1);
}

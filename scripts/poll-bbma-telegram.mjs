import process from 'node:process';
import fs from 'node:fs';
import {handleTelegramCallback} from '../macro/bbma/telegram-callback-runtime.mjs';
import {adaptShadowObservationForTelegram} from '../macro/bbma/telegram-observation-adapter.mjs';
import {buildTelegramObservationHistory} from '../macro/bbma/telegram-history.mjs';

import {runTelegramPolling} from '../macro/bbma/telegram-polling.mjs';

if(process.env.GITHUB_ACTIONS==='true' && (process.env.TELEGRAM_RUNTIME??'actions')!=='actions'){
  console.log('Telegram Actions polling disabled: another runtime owns updates');
  process.exit(0);
}
const token=process.env.TELEGRAM_BOT_TOKEN;
const allowedChat=String(process.env.TELEGRAM_CHAT_ID??'');
const ledgerPath=process.env.BBMA_OBSERVATION_LEDGER??'data/bbma-shadow-observations.json';
const fallbackPath='data/bbma-telegram-validation.json';
if(!token||!allowedChat){console.error('Telegram secrets are not configured');process.exit(2);}
const api=async(method,payload={})=>{const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)});const j=await r.json().catch(()=>null);if(!r.ok||j?.ok!==true){const e=new Error(`Telegram ${method} failed (${r.status}/${j?.error_code??'unknown'})`);e.status=r.status;e.telegramCode=j?.error_code;e.description=j?.description??'';throw e;}return j.result;};
const readRows=path=>{const raw=JSON.parse(fs.readFileSync(path,'utf8'));return Array.isArray(raw)?raw:(raw.observations??[]);};
const loadLedger=()=>{let rows=[],source='NONE';try{rows=readRows(ledgerPath);source=ledgerPath;}catch(e){console.log(`DIAG primary_ledger=UNAVAILABLE path=${ledgerPath} reason=${e.code??'PARSE'}`);if(process.env.TELEGRAM_RUNTIME==='persistent')return [];try{rows=readRows(fallbackPath);source=fallbackPath;}catch(x){console.log(`DIAG fallback_ledger=FAILED reason=${x.code??'PARSE'}`);}}const adapted=[];for(const row of rows){try{adapted.push(row?.kind==='BBMA_NEWS_SHADOW_OBSERVATION'?adaptShadowObservationForTelegram(row):row);}catch(e){console.log(`DIAG observation_adapt=SKIP reason=${e.message}`);}}console.log(`DIAG ledger_source=${source} observations=${adapted.length}`);return adapted;};
let history=buildTelegramObservationHistory(loadLedger());
console.log(`DIAG history_indexed=${history.size}`);
const getObservation=id=>{const x=history.getObservation(id);console.log(`DIAG observation_lookup id=${String(id).slice(0,64)} found=${Boolean(x)}`);return x;};
const getCurrentStatus=obs=>({direction:obs?.bbma?.direction??obs?.direction??'UNAVAILABLE',readiness:obs?.bbma?.readiness??obs?.readiness??'UNAVAILABLE'});
const getExplanation=obs=>history.getExplanation(obs);
const getChanges=obs=>history.getChanges(obs);
const answerCallback=async({callbackQueryId,text})=>{try{const x=await api('answerCallbackQuery',{callback_query_id:callbackQueryId,text,show_alert:false});console.log('DIAG callback_ack=OK');return x;}catch(e){if(e.status===400){console.log('DIAG callback_ack=STALE_400');return false;}throw e;}};
const respond=async({chatId,text,parse_mode})=>{const x=await api('sendMessage',{chat_id:chatId,text,parse_mode});console.log('DIAG response_send=OK');return x;};
let stopped=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopped=true;});
try {
  const result=await runTelegramPolling({
    api, allowedChat, initialOffset:Number(process.env.TELEGRAM_OFFSET??0),
    continuous:process.env.TELEGRAM_RUNTIME==='persistent',
    pollWindowMs:Number(process.env.POLL_WINDOW_MS??45000),
    shouldStop:()=>stopped,
    answerUnauthorized:id=>answerCallback({callbackQueryId:id,text:'Unauthorized chat'}),
    handleUpdate:async update=>{
      // New alerts can arrive while the persistent process is running.
      history=buildTelegramObservationHistory(loadLedger());
      await handleTelegramCallback({update,getObservation,getCurrentStatus,getExplanation,
        getChanges,answerCallback,respond});
    },
    diagnostic:event=>console.log('DIAG polling='+JSON.stringify(event)),
  });
  console.log('DIAG summary '+JSON.stringify(result));
} catch(error) {
  // Log only our sanitized category; transport exception URLs can contain the token.
  const configuration=/configuration failure|Active Telegram webhook|Invalid Telegram polling/.test(error.message??'');
  console.error(configuration?error.message:'Telegram polling transport failure');
  process.exitCode=configuration?78:1;
}

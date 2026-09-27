import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptShadowObservationForTelegram } from '../../macro/bbma/telegram-observation-adapter.mjs';
import { classifyTelegramLifecycle } from '../../macro/bbma/telegram-lifecycle.mjs';

const at='2026-09-26T06:00:00.000Z';
const base={
  kind:'BBMA_NEWS_SHADOW_OBSERVATION',
  observation_id:'obs-gate-contract-1',
  symbol:'XAUUSD',
  direction:'BUY',
  readiness:'CONFIRMED',
  generated_utc:at,
  macro:{event_name:'US CPI',impact:'HIGH'},
  candidate:{coverage:'6 TF',fractal_snapshot:{H4:{direction:'BUY',active_detectors:['MOMENTUM_BUY']}}},
  reason_codes:['DIRECTION_BUY']
};

test('authoritative BLOCK survives Telegram adaptation and cannot classify CONFIRMED',()=>{
  const telegram=adaptShadowObservationForTelegram({...base,gate:{state:'BLOCK',reason_codes:['MACRO_BLOCK']}});
  assert.equal(telegram.news.gate,'BLOCK');
  assert.ok(telegram.evidence.reason_codes.includes('MACRO_BLOCK'));
  const lifecycle=classifyTelegramLifecycle(telegram,{now:Date.parse('2026-09-26T06:05:00.000Z')});
  assert.equal(lifecycle.state,'INVALIDATED');
  assert.notEqual(lifecycle.state,'CONFIRMED');
});

test('WATCH_ONLY is preserved instead of degrading to OBSERVE',()=>{
  const telegram=adaptShadowObservationForTelegram({...base,readiness:'SETUP',gate:{state:'WATCH_ONLY',reason_codes:['MACRO_WATCH_ONLY']}});
  assert.equal(telegram.news.gate,'WATCH_ONLY');
  assert.ok(telegram.evidence.reason_codes.includes('MACRO_WATCH_ONLY'));
});

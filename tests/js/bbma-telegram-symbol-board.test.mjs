import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSymbolKey,
  findObservationBySymbol,
  buildDashboardRow,
  buildBbmaKeyboard,
  dashboardCallbackData,
} from '../../macro/bbma/telegram-symbol-board.mjs';

test('normalizeSymbolKey is case/punct insensitive', () => {
  assert.equal(normalizeSymbolKey('XAU/USD'), 'XAUUSD');
  assert.equal(normalizeSymbolKey('xau/usd'), 'XAUUSD');
  assert.equal(normalizeSymbolKey('GBP USD'), 'GBPUSD');
  assert.equal(normalizeSymbolKey(''), '');
});

test('findObservationBySymbol resolves by normalized key, null on miss', () => {
  const byId = new Map([['XAUUSD', {symbol: 'XAUUSD'}]]);
  assert.deepEqual(findObservationBySymbol(byId, 'XAU/USD'), {symbol: 'XAUUSD'});
  assert.equal(findObservationBySymbol(byId, 'EUR/USD'), null);
  assert.equal(findObservationBySymbol(null, 'XAUUSD'), null);
});

test('buildDashboardRow: dashboard first, then pinned XAUUSD+BTCUSD, remainder from board order', () => {
  const rows = {
    'EUR/USD': {symbol: 'EUR/USD', ok: true, changePct: -0.2},
    'GBP/USD': {symbol: 'GBP/USD', ok: true, changePct: 1.1},
    'XAU/USD': {symbol: 'XAU/USD', ok: true, changePct: 0.5},
    'BTC/USD': {symbol: 'BTC/USD', ok: true, changePct: -1.3},
    'USD/JPY': {symbol: 'USD/JPY', ok: true, changePct: 0},
    'AUD/USD': {symbol: 'AUD/USD', ok: true, changePct: 0.9},
    'BROKEN': {symbol: 'BROKEN', ok: false},
  };
  const row = buildDashboardRow({rows});
  assert.equal(row[0].text, '📈 BBMA Dashboard');
  assert.match(row[0].url, /^https:/);
  // dashboard + 3 symbols max (2 pinned + 1 from board order)
  assert.equal(row.length, 4);
  const syms = row.slice(1).map((b) => b.text);
  assert.deepEqual(syms, ['📊 XAU/USD +0.5%', '📊 BTC/USD -1.3%', '📊 EUR/USD -0.2%']);
  const expected = ['XAU/USD', 'BTC/USD', 'EUR/USD'];
  assert.deepEqual(row.slice(1).map((b) => b.callback_data), expected.map((s) => `bbma:status:${s}`));
});

test('buildDashboardRow: pinned symbol missing from board is skipped, slot backfilled', () => {
  const rows = {
    'EUR/USD': {symbol: 'EUR/USD', ok: true, changePct: 0.1},
    'GBP/USD': {symbol: 'GBP/USD', ok: true, changePct: 0.2},
  };
  const row = buildDashboardRow({rows}); // BTCUSD pinned but absent
  assert.deepEqual(row.map((b) => b.text), ['📈 BBMA Dashboard', '📊 EUR/USD +0.1%', '📊 GBP/USD +0.2%']);
});

test('buildDashboardRow: unavailable symbols skipped (even if pinned)', () => {
  const rows = {
    'XAU/USD': {symbol: 'XAU/USD', ok: false},
    'C/D': {symbol: 'C/D', ok: true},
  };
  const row = buildDashboardRow({rows});
  assert.deepEqual(row.map((b) => b.text), ['📈 BBMA Dashboard', '📊 C/D']);
});

test('buildBbmaKeyboard: empty board -> dashboard-only row; custom pinned order honored', () => {
  assert.deepEqual(buildBbmaKeyboard({rows: {}}), [[{text: '📈 BBMA Dashboard', url: 'https://mohd012z.github.io/helix/'}]]);
  const kb = buildBbmaKeyboard({
    rows: {
      'EUR/USD': {symbol: 'EUR/USD', ok: true, changePct: 0.1},
      'BTC/USD': {symbol: 'BTC/USD', ok: true, changePct: 0.3},
    },
    pinned: ['BTCUSD'],
  });
  // only BTC pinned -> row = dashboard + BTC/USD (EUR not in the 3-slot fill? it is: 1+1)
  assert.deepEqual(kb[0].map((b) => b.callback_data ?? b.text), ['📈 BBMA Dashboard', 'bbma:status:BTC/USD', 'bbma:status:EUR/USD']);
});

test('dashboardCallbackData is a stable bbma:dashboard token', () => {
  assert.equal(dashboardCallbackData(), 'bbma:dashboard');
});

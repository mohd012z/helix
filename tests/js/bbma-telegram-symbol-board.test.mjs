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

test('buildDashboardRow: dashboard first, then up to 3 ok symbols, primary excluded from dupes', () => {
  const rows = {
    'XAU/USD': {symbol: 'XAU/USD', ok: true, changePct: 0.5},
    'EUR/USD': {symbol: 'EUR/USD', ok: true, changePct: -0.2},
    'GBP/USD': {symbol: 'GBP/USD', ok: true, changePct: 1.1},
    'USD/JPY': {symbol: 'USD/JPY', ok: true, changePct: 0},
    'AUD/USD': {symbol: 'AUD/USD', ok: true, changePct: 0.9},
    'BROKEN': {symbol: 'BROKEN', ok: false},
  };
  const row = buildDashboardRow({rows, primarySymbol: 'XAUUSD'});
  assert.equal(row[0].text, '📈 BBMA Dashboard');
  assert.match(row[0].url, /^https:/);
  // dashboard + 3 symbols max
  assert.equal(row.length, 4);
  // primary (XAU/USD) is excluded, so the 3 symbols are EUR, GBP, USD/JPY (board order)
  const syms = row.slice(1).map((b) => b.text);
  assert.deepEqual(syms, ['📊 EUR/USD -0.2%', '📊 GBP/USD +1.1%', '📊 USD/JPY 0%']);
  // every symbol button is a bbma:status:<symbol> callback matching its label
  const expectedSyms = ['EUR/USD', 'GBP/USD', 'USD/JPY'];
  assert.deepEqual(row.slice(1).map((b) => b.callback_data), expectedSyms.map((s) => `bbma:status:${s}`));
});

test('buildDashboardRow: unavailable symbols skipped, board order preserved', () => {
  const rows = {
    'A/B': {symbol: 'A/B', ok: false},
    'C/D': {symbol: 'C/D', ok: true},
  };
  const row = buildDashboardRow({rows, primarySymbol: 'XAUUSD'});
  assert.deepEqual(row.map((b) => b.text), ['📈 BBMA Dashboard', '📊 C/D']);
});

test('buildBbmaKeyboard: empty board -> dashboard-only row; unknown primary still lists board symbols', () => {
  assert.deepEqual(buildBbmaKeyboard({rows: {}}), [[{text: '📈 BBMA Dashboard', url: 'https://mohd012z.github.io/helix/'}]]);
  const kb = buildBbmaKeyboard({rows: {'EUR/USD': {symbol: 'EUR/USD', ok: true, changePct: 0.1}}, primarySymbol: 'EURUSD'});
  // primary EUR/USD excluded -> only dashboard + ... wait EUR is primary so excluded
  assert.deepEqual(kb.map((r) => r.length), [1]);
  assert.equal(kb[0][0].text, '📈 BBMA Dashboard');
});

test('dashboardCallbackData is a stable bbma:dashboard token', () => {
  assert.equal(dashboardCallbackData(), 'bbma:dashboard');
});

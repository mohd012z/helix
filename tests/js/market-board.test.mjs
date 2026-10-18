import test from 'node:test';
import assert from 'node:assert/strict';
import { boardSymbols, buildBoardGroups, formatBoardRow } from '../../macro/ui/market-board.mjs';
import { MARKET_BOARD_GROUPS, listBoardSymbols } from '../../macro/core/instruments.mjs';

const board = {
  label: 'test board',
  priceType: 'DAILY_CLOSE',
  symbols: {
    'EUR/USD': { symbol: 'EUR/USD', assetClass: 'fx', group: 'major', ok: true, last: 1.1842, changePct: -0.21, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'USD/JPY': { symbol: 'USD/JPY', assetClass: 'fx', group: 'major', ok: true, last: 151.342, changePct: 0.42, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'EUR/JPY': { symbol: 'EUR/JPY', assetClass: 'fx', group: 'minor', ok: true, last: 179.22, changePct: 0.21, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'XAG/USD': { symbol: 'XAG/USD', assetClass: 'metal', group: 'metal', ok: true, last: 38.123, changePct: 1.05, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'BTC/USD': { symbol: 'BTC/USD', assetClass: 'digital', group: 'digital', ok: true, last: 91234.5, changePct: 2.31, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'ETH/USD': { symbol: 'ETH/USD', assetClass: 'digital', group: 'digital', ok: false, last: null, changePct: null, barDate: null, detail: '404 not found' }
  }
};

test('boardSymbols tolerates missing and malformed boards', () => {
  assert.deepEqual(boardSymbols(null), {});
  assert.deepEqual(boardSymbols({}), {});
  assert.deepEqual(boardSymbols({ symbols: 'x' }), {});
  assert.equal(Object.keys(boardSymbols(board)).length, 6);
});

test('formatBoardRow renders an available symbol with digits and signed pct', () => {
  const row = formatBoardRow('EUR/USD', board.symbols['EUR/USD']);
  assert.equal(row.state, 'OK');
  assert.equal(row.price, '1.18420');
  assert.equal(row.change.text, '-0.21%');
  assert.equal(row.change.tone, 'down');
  assert.match(row.detail, /provider bar 2026-10-17/);
});

test('formatBoardRow keeps JPY pairs at 3 digits and metals at 3 decimals', () => {
  assert.equal(formatBoardRow('USD/JPY', board.symbols['USD/JPY']).price, '151.342');
  assert.equal(formatBoardRow('XAG/USD', board.symbols['XAG/USD']).price, '38.123');
  assert.equal(formatBoardRow('BTC/USD', board.symbols['BTC/USD']).price, '91,234.50');
});

test('formatBoardRow never fabricates: missing or failed entries are UNAVAILABLE with detail', () => {
  const missing = formatBoardRow('NZD/USD', null);
  assert.equal(missing.state, 'UNAVAILABLE');
  assert.equal(missing.price, '—');
  assert.equal(missing.change, null);

  const failed = formatBoardRow('ETH/USD', board.symbols['ETH/USD']);
  assert.equal(failed.state, 'UNAVAILABLE');
  assert.equal(failed.detail, '404 not found');
});

test('buildBoardGroups scopes views: BRIEF shows all groups, FX only fx groups', () => {
  const brief = buildBoardGroups('BRIEF', board);
  assert.deepEqual(brief.map(g => g.group), MARKET_BOARD_GROUPS.map(g => g.id));
  const fx = buildBoardGroups('FX', board);
  assert.deepEqual(fx.map(g => g.group), ['major', 'minor']);
  const digital = buildBoardGroups('DIGITAL ASSETS', board);
  assert.deepEqual(digital.map(g => g.group), ['digital']);
  assert.deepEqual(buildBoardGroups('EVENTS', board), []);
});

test('buildBoardGroups drops empty groups and orders rows by symbol', () => {
  const metalsOnly = { symbols: { 'XAU/USD': { symbol: 'XAU/USD', group: 'metal', ok: false, last: null } } };
  const groups = buildBoardGroups('BRIEF', metalsOnly);
  assert.deepEqual(groups.map(g => g.group), ['metal']);
  assert.equal(groups[0].rows[0].state, 'UNAVAILABLE');
});

test('board symbol inventory covers the desk scope: 7 majors, 5 minors, 2 metals, 2 digital', () => {
  assert.equal(listBoardSymbols('major').length, 7);
  assert.equal(listBoardSymbols('minor').length, 5);
  assert.equal(listBoardSymbols('metal').length, 2);
  assert.equal(listBoardSymbols('digital').length, 2);
  assert.ok(listBoardSymbols().includes('XAU/USD'));
});

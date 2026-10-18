import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSnapshot } from '../../macro/adapters/snapshot-adapter.mjs';

test('daily XAU snapshot normalizes as metal and never claims streaming', () => {
  const snapshot = {
    meta: {
      generatedAt: '2026-09-16T12:01:54+08:00',
      cadence: 'daily',
      verified: true,
      sourceStatus: { xau: { ok: true, label: 'XAU provider' } }
    },
    updated: '2026-09-16 12:01 MYT',
    price: { spot: 4327.23, change: 33.44, changePct: 0.78, dayRange: '4275.88 - 4339.71' },
    calendar: [],
    sources: ['XAU provider']
  };

  const out = adaptSnapshot(snapshot);
  assert.equal(out.status, 'SNAPSHOT');
  assert.equal(out.updatedAt, '2026-09-16T12:01:54+08:00');
  assert.equal(out.instruments['XAU/USD'].assetClass, 'metal');
  assert.equal(out.instruments['XAU/USD'].price, 4327.23);
  assert.deepEqual(out.events, []);
  assert.deepEqual(out.sources, ['XAU provider']);
});

test('explicit daily close overrides the legacy spot alias and exposes price semantics', () => {
  const snapshot = {
    meta: { cadence: 'daily', verified: true },
    price: {
      latestDailyClose: 4327.23,
      spot: 9999,
      priceType: 'DAILY_CLOSE',
      rollingHigh: 4500.5,
      rollingWindowBars: 370
    }
  };
  const out = adaptSnapshot(snapshot);
  const xau = out.instruments['XAU/USD'];
  assert.equal(xau.price, 4327.23);
  assert.equal(xau.priceType, 'DAILY_CLOSE');
  assert.equal(xau.rollingHigh, 4500.5);
  assert.equal(xau.rollingWindowBars, 370);
});

test('unknown fields remain null instead of fabricated', () => {
  const out = adaptSnapshot({ meta: {}, price: {}, sources: [] });
  assert.equal(out.instruments['XAU/USD'].price, null);
  assert.equal(out.instruments['EUR/USD'].price, null);
  assert.equal(out.instruments['BTC/USD'].price, null);
});

test('market board passes through verbatim and defaults to null when absent', () => {
  const board = {
    label: 'b',
    priceType: 'DAILY_CLOSE',
    symbols: { 'EUR/USD': { symbol: 'EUR/USD', group: 'major', ok: true, last: 1.18, changePct: -0.1, barDate: '2026-10-17' } }
  };
  const withBoard = adaptSnapshot({ meta: {}, price: {}, board, sources: [] });
  assert.equal(withBoard.board, board, 'board object must not be mutated or cloned into a different identity contract');
  assert.equal(withBoard.board.symbols['EUR/USD'].last, 1.18);

  const without = adaptSnapshot({ meta: {}, price: {}, sources: [] });
  assert.equal(without.board, null);
  const bad = adaptSnapshot({ meta: {}, price: {}, board: 'nope', sources: [] });
  assert.equal(bad.board, null);
});

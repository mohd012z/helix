import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRecords, parseInput, MAX_RECORDS } from '../../invo-methods/signal-lab.mjs';

const NOW = Date.parse('2026-10-18T08:00:00Z');
const trade = (overrides = {}) => ({
  type: 'signal', postId: 'post-01', action: 'open', owner: { username: 'sample' },
  trade: { coin: 'BTC', side: 'long', leverage: 2, entryPrice: 100 },
  observedAt: '2026-10-18T07:59:00Z', ...overrides,
});

test('parses array, single JSON object, and JSONL', () => {
  assert.equal(parseInput(JSON.stringify([trade()])).length, 1);
  assert.equal(parseInput(JSON.stringify(trade())).length, 1);
  assert.equal(parseInput(`${JSON.stringify(trade())}\n${JSON.stringify(trade({ postId: 'post-02' }))}`).length, 2);
});
test('empty input returns empty result', () => {
  assert.deepEqual(analyzeRecords(parseInput('   ')), { total: 0, accepted: 0, duplicates: 0, rejected: {}, signals: [] });
});
test('malformed JSONL identifies line and fails closed', () => {
  assert.throws(() => parseInput(`${JSON.stringify(trade())}\ninvalid`), /line 2/);
});
test('rejects oversize inputs and batches', () => {
  assert.throws(() => parseInput('x'.repeat(1_000_001)), /1 MB/);
  assert.throws(() => analyzeRecords(Array.from({ length: MAX_RECORDS + 1 })), /1,000/);
});
test('deduplicates identical IDs and actions, retains separate close event', () => {
  const result = analyzeRecords([trade(), trade(), trade({ action: 'close' })], { nowMs: NOW });
  assert.equal(result.accepted, 2);
  assert.equal(result.duplicates, 1);
});
test('rejects malformed assets, numeric values and side without leaking into display', () => {
  const result = analyzeRecords([
    trade({ trade: { coin: '<img>', side: 'long' } }),
    trade({ trade: { coin: 'BTC', side: 'buy' } }),
    trade({ trade: { coin: 'BTC', side: 'long', leverage: 'Infinity' } }),
    trade({ trade: { coin: 'BTC', side: 'long', entryPrice: -1 } }),
  ], { nowMs: NOW });
  assert.deepEqual(result.rejected, { INVALID_ASSET: 1, INVALID_SIDE: 1, INVALID_LEVERAGE: 1, INVALID_PRICE: 1 });
});
test('distinguishes recent, stale, future and missing time', () => {
  const records = [
    trade(),
    trade({ postId: 'p2', observedAt: '2026-10-18T05:00:00Z' }),
    trade({ postId: 'p3', observedAt: '2026-10-19T00:00:00Z' }),
    trade({ postId: 'p4', observedAt: undefined }),
  ];
  assert.deepEqual(analyzeRecords(records, { nowMs: NOW }).signals.map(s => s.freshness), [
    'RECENT_BY_DEVICE_CLOCK', 'STALE', 'FUTURE_TIME', 'UNKNOWN_TIME',
  ]);
});
test('source verification is never inferred from user supplied JSON', () => {
  const result = analyzeRecords([trade({ verifiedTrade: true })], { nowMs: NOW });
  assert.equal(result.signals[0].provenance, 'UNVERIFIED_USER_SUPPLIED_DATA');
});
test('rejects non-signal objects and invalid clocks', () => {
  assert.equal(analyzeRecords([{}, null, 'bad'], { nowMs: NOW }).rejected.NOT_A_SIGNAL, 3);
  assert.throws(() => analyzeRecords([], { nowMs: NaN }), /Invalid clock/);
});

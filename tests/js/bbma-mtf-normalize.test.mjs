import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMtfEvidence } from '../../macro/bbma/mtf-normalize.mjs';

const row = (timeframe, direction = 'BUY') => ({ timeframe, direction, status: 'OK' });

test('normalizes canonical keyed timeframe evidence', () => {
  const normalized = normalizeMtfEvidence({
    timeframes: { MN: row('MN'), W1: row('W1'), D1: row('D1'), H4: row('H4') },
    rule_version: 'bbma-v2', status: 'OK', overall_state: 'ALIGNED_BUY'
  });
  assert.equal(normalized.byTimeframe.MN.direction, 'BUY');
  assert.equal(normalized.byTimeframe.H4.direction, 'BUY');
  assert.equal(normalized.ruleVersion, 'bbma-v2');
  assert.equal(normalized.dataStatus, 'OK');
  assert.equal(normalized.sourceState, 'ALIGNED_BUY');
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.byTimeframe));
});

test('supports legacy array evidence during migration', () => {
  const normalized = normalizeMtfEvidence({ timeframes: [row('MN'), row('W1'), row('D1')] });
  assert.deepEqual(Object.keys(normalized.byTimeframe), ['MN', 'W1', 'D1']);
});

test('ignores unknown timeframes deterministically', () => {
  const normalized = normalizeMtfEvidence({ timeframes: [row('D1'), row('H2')] });
  assert.deepEqual(Object.keys(normalized.byTimeframe), ['D1']);
});

test('rejects duplicate legacy timeframe rows', () => {
  assert.throws(
    () => normalizeMtfEvidence({ timeframes: [row('D1'), row('D1', 'SELL')] }),
    error => error?.code === 'MTF_DUPLICATE_TIMEFRAME'
  );
});

test('rejects malformed top-level evidence', () => {
  assert.throws(() => normalizeMtfEvidence(null), TypeError);
  assert.throws(() => normalizeMtfEvidence({ timeframes: 'bad' }), TypeError);
});

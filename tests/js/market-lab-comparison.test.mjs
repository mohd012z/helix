import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHistorical, monthlyReturns, correlation } from '../../market-lab/comparison.mjs';

const series = points => points.map(([date,close]) => ({date,close}));
const PRICE = {
  AAA: series([['2026-01-05',100],['2026-01-06',110],['2026-01-08',99],['2026-01-09',120],['2026-01-12',108]]),
  BBB: series([['2026-01-06',50],['2026-01-08',55],['2026-01-09',60],['2026-01-12',66]]),
};

test('aligns only shared dates and rebases both assets to 100 without synthesizing bars', () => {
  const v=compareHistorical(PRICE,['AAA','BBB']);
  assert.equal(v.state,'ALIGNED_HISTORY');
  assert.deepEqual(v.commonDates,['2026-01-06','2026-01-08','2026-01-09','2026-01-12']);
  assert.equal(v.rows[0].indexed[0].index,100);
  assert.equal(v.rows[1].indexed[0].index,100);
  assert.equal(v.diagnostics.AAA.discardedNonOverlapping,1);
  assert.equal(v.rows[0].last.price,108);
  assert.equal(v.rows[1].totalReturnPct,32);
});
test('range intersection is inclusive and screens out nonoverlapping series',()=>{
  const result=compareHistorical(PRICE,['AAA','BBB'],{start:'2026-01-08',end:'2026-01-09'});
  assert.deepEqual(result.commonDates,['2026-01-08','2026-01-09']);
  assert.equal(result.correlations[0][1],null);
});
test('missing series and insufficient overlap explicitly fail closed',()=>{
  assert.deepEqual(compareHistorical(PRICE,['ABC']).missing,['ABC']);
  assert.equal(compareHistorical({AAA:PRICE.AAA,CCC:series([['2026-01-05',10]])},['AAA','CCC']).state,'INSUFFICIENT_OVERLAP');
});
test('reject duplicate and malformed symbols, date ranges and incompatible arrays',()=>{
  assert.throws(()=>compareHistorical(PRICE,['AAA','AAA']),/Duplicate/);
  assert.throws(()=>compareHistorical(PRICE,['bad<>']),/symbol/);
  assert.throws(()=>compareHistorical(PRICE,['AAA'],{start:'2026-02-30'}),/Invalid date/);
  assert.throws(()=>compareHistorical(PRICE,['AAA'],{start:'2026-03-01',end:'2026-01-01'}),/Start date/);
  assert.throws(()=>compareHistorical({AAA:series([['2026-01-05',0]])},['AAA']),/Invalid or duplicate daily close/);
});
test('no false correlation for constant returns or too few periods',()=>{
  assert.equal(correlation([1,1,1,1],[1,2,3,4]),null);
  assert.equal(correlation([1,2],[1,2]),null);
  assert.equal(correlation([1,2,3,4],[2,4,6,8]),1);
  assert.equal(correlation([1,2,3,4],[8,6,4,2]),-1);
});
test('monthly returns use observed month-end only with a consecutive preceding month',()=>{
  const s=series([['2026-01-02',100],['2026-01-30',120],['2026-02-10',130],['2026-02-27',132],['2026-04-15',150]]);
  assert.deepEqual(monthlyReturns(s),[{month:'2026-02',returnPct:10}]);
});
test('historical comparison rejects oversized selections and series',()=>{
  assert.throws(()=>compareHistorical(PRICE,Array.from({length:9},(_,i)=>`T${i}`)),/Select 1–8/);
  assert.throws(()=>compareHistorical({AAA:Array(5001).fill(PRICE.AAA[0])},['AAA']),/5,000/);
});
test('returned overlap matrices are symmetric for valid aligned price data',()=>{
  const result=compareHistorical(PRICE,['AAA','BBB']);
  assert.equal(result.correlations[0][1],result.correlations[1][0]);
  assert.equal(result.correlations[0][0],1);
});

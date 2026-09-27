import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBbmaConfluence } from '../../macro/bbma/confluence.mjs';

const order=['MN','W1','D1','H4','H1','M30','M15','M5'];
const rows=order.map(timeframe=>({timeframe,direction:['D1','H4','H1','M15','M5'].includes(timeframe)?'BUY':'NEUTRAL',status:'OK',observations:[]}));
const common={rule_version:'bbma-shadow-v1',overall_state:'ALIGNED_BUY',status:'OK'};

test('confluence accepts canonical array evidence',()=>{
  const result=evaluateBbmaConfluence({evidence:{...common,timeframes:rows}});
  assert.equal(result.direction,'BUY');
  assert.equal(result.readiness,'CONFIRMABLE');
});

test('confluence normalizes actual detector timeframe map without throwing',()=>{
  const timeframes=Object.fromEntries(rows.map(row=>[row.timeframe,row]));
  const result=evaluateBbmaConfluence({evidence:{...common,timeframes}});
  assert.equal(result.direction,'BUY');
  assert.equal(result.readiness,'CONFIRMABLE');
  assert.ok(result.supporting_timeframes.includes('H4'));
});

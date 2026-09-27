import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBbmaTimeframe, BBMA_DETECTOR_ORDER } from '../../macro/bbma/timeframe-evidence.mjs';

const TIMEFRAMES=['MN','W1','D1','H4','H1','M30','M15','M5'];
const EXPECTED=['EXTREME','MHV','CSA','REENTRY','MOMENTUM'];
const RULE_VERSION='bbma-shadow-v1';

test('same BBMA detector stack is applied fractally from MN through M5', () => {
  assert.deepEqual(BBMA_DETECTOR_ORDER, EXPECTED);
  for (const timeframe of TIMEFRAMES) {
    const result=evaluateBbmaTimeframe({series:[],timeframe,ruleVersion:RULE_VERSION});
    assert.equal(result.timeframe,timeframe);
    assert.equal(result.rule_version,RULE_VERSION);
    assert.deepEqual(result.observations.map(x=>x.detector),EXPECTED);
  }
});

test('timeframe role does not change detector order', () => {
  const htf=evaluateBbmaTimeframe({series:[],timeframe:'W1',ruleVersion:RULE_VERSION});
  const ltf=evaluateBbmaTimeframe({series:[],timeframe:'M5',ruleVersion:RULE_VERSION});
  assert.deepEqual(htf.observations.map(x=>x.detector),ltf.observations.map(x=>x.detector));
});

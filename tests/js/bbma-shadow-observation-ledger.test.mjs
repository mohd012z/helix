import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {persistShadowObservation} from '../../macro/bbma/shadow-observation-ledger.mjs';

const obs=(id,utc)=>({kind:'BBMA_NEWS_SHADOW_OBSERVATION',observation_id:id,symbol:'XAUUSD',direction:'BUY',readiness:'OBSERVE',generated_utc:utc,candidate:{},macro:{},gate:{},reason_codes:['TEST']});

test('persists, deduplicates and preserves evidence-only safety boundary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbma-ledger-'));const file=path.join(dir,'ledger.json');
 persistShadowObservation(obs('o1','2026-09-26T01:00:00Z'),{ledgerPath:file});
 persistShadowObservation(obs('o1','2026-09-26T01:00:00Z'),{ledgerPath:file});
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(data.kind,'BBMA_SHADOW_OBSERVATION_LEDGER');assert.equal(data.observations.length,1);
 assert.equal(data.observations[0].alert_id,'o1');assert.equal(data.observations[0].persistence.broker_execution,false);assert.equal(data.observations[0].persistence.orders,false);
});

test('retains only bounded newest observations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bbma-ledger-'));const file=path.join(dir,'ledger.json');
 persistShadowObservation(obs('o1','2026-09-26T01:00:00Z'),{ledgerPath:file,maxEntries:2});
 persistShadowObservation(obs('o2','2026-09-26T02:00:00Z'),{ledgerPath:file,maxEntries:2});
 persistShadowObservation(obs('o3','2026-09-26T03:00:00Z'),{ledgerPath:file,maxEntries:2});
 const data=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(data.observations.map(x=>x.alert_id),['o2','o3']);
});

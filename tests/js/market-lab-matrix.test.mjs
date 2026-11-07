import test from 'node:test';
import assert from 'node:assert/strict';
import { MATRIX_TIERS, MATRIX_METRICS, classifyMarketCap, metricValue, median, buildMarketMatrix } from '../../market-lab/matrix.mjs';
import { validateMapEmbed } from '../../market-lab/map-embed.mjs';

const stock=(symbol,overrides={})=>({
  symbol,sector:'Technology',industry:'Software',marketCap:15e9,price:100,
  low52:80,high52:125,changePct:5,pe:20,volume:1000,...overrides,
});
test('nonoverlapping cap tiers and explicit unknown classifications',()=>{
  assert.deepEqual([200e9,10e9,2e9,300e6,299e6,0,null].map(classifyMarketCap),
    ['mega','large','mid','small','micro','unknown','unknown']);
  assert.equal(new Set(MATRIX_TIERS.map(t=>t.id)).size,6);
});
test('metric calculations use explicit finite inputs without assigning a missing value',()=>{
  assert.equal(metricValue(stock('AAA'),'changePct'),5);
  assert.ok(Math.abs(metricValue(stock('AAA'),'drawdown52')-(-20)) < 1e-10);
  assert.equal(metricValue(stock('AAA'),'aboveLow52'),25);
  assert.equal(metricValue(stock('AAA',{high52:null}),'drawdown52'),null);
  assert.equal(metricValue(stock('AAA',{price:0}),'drawdown52'),null);
  assert.equal(metricValue(stock('AAA',{pe:null}),'pe'),null);
  assert.throws(()=>metricValue(stock('AAA'),'relativeVolume'),/Unsupported/);
});
test('industry rows separate identically named industries in different sectors',()=>{
  const model=buildMarketMatrix([stock('AAA'),stock('BBB',{sector:'Financials',industry:'Software',marketCap:3e9})]);
  assert.equal(model.rows.length,2);
  assert.deepEqual(model.sectors,['Financials','Technology']);
  assert.equal(model.stats.included,2);
  assert.equal(model.coverage,'IMPORTED_RECORDS_ONLY');
});
test('cell median is deterministic; unknown and missing values are explicit',()=>{
  const items=[stock('AAA',{changePct:1}),stock('BBB',{changePct:7}),stock('CCC',{changePct:null}),stock('DDD',{marketCap:null,changePct:-2})];
  const model=buildMarketMatrix(items);
  const large=model.rows[0].cells.find(c=>c.tier==='large');
  assert.deepEqual([large.total,large.valid,large.missing,large.value],[3,2,1,4]);
  const unknown=model.rows[0].cells.find(c=>c.tier==='unknown');
  assert.equal(unknown.value,-2);
  assert.equal(model.stats.marketCapUnknown,1);
  assert.equal(model.stats.unavailable,1);
  assert.equal(median([8,2]),5);
  assert.equal(median([]),null);
  assert.throws(()=>median([NaN]),/Invalid metric/);
});
test('matrix filters sector and validates upper bounds',()=>{
  assert.equal(buildMarketMatrix([stock('AAA')],{sector:'Financials'}).stats.included,0);
  assert.throws(()=>buildMarketMatrix(Array(2001).fill(stock('AAA'))),/Maximum 2,000/);
  assert.throws(()=>buildMarketMatrix([stock('AAA')],{metric:'__proto__'}),/Unsupported/);
  assert.throws(()=>buildMarketMatrix([stock('<script>')]),/normalized/);
  assert.ok(Object.keys(MATRIX_METRICS).includes('volume'));
});
test('nonperformance metrics remain distinct from direction and can be missing',()=>{
  const v=buildMarketMatrix([stock('AAA',{pe:-10}),stock('BBB',{pe:null})],{metric:'pe'});
  assert.equal(v.metricInfo.kind,'neutral');
  assert.equal(v.rows[0].cells.find(c=>c.tier==='large').value,-10);
  assert.equal(v.stats.measured,1);
});
test('official HTTPS Finviz map route and quoted iframe src are parsed without markup',()=>{
  assert.equal(validateMapEmbed('https://finviz.com/map?t=sec'),'https://finviz.com/map?t=sec');
  const src=validateMapEmbed('<iframe width="100%" src="https://finviz.com/embed/map?theme=dark&amp;period=1w" onload="evil()"></iframe>');
  assert.equal(src,'https://finviz.com/embed/map?theme=dark&period=1w');
  assert.equal(validateMapEmbed('https://www.finviz.com/map.ashx?t=sec'),'https://www.finviz.com/map.ashx?t=sec');
});
test('rejects injected map URL schemes, domains, credentials and unrelated Finviz paths',()=>{
  for(const invalid of [
    'javascript:alert(1)','http://finviz.com/map','https://finviz.com.evil.test/map',
    'https://finviz.com@evil.example/map','https://user:pass@finviz.com/map',
    'https://finviz.com/elite','https://finviz.com/map?api_key=secret',
    'https://finviz.com/map#hidden','<img src="https://finviz.com/map">',
    '<iframe src="https://example.org/map"></iframe>',
  ])assert.throws(()=>validateMapEmbed(invalid),undefined,invalid);
});

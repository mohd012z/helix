import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_PRESETS, getTemplate, validateChartTemplate, normalizeSymbolCandles, availableScreenCharts } from '../../market-lab/chart-templates.mjs';
const bar=(symbol,date='2026-10-17')=>({symbol,date,open:100,high:105,low:96,close:102,volume:100});
test('four built-in chart templates have safe bounded definitions',()=>{
  assert.equal(Object.keys(CHART_PRESETS).length,4);
  for(const name of Object.keys(CHART_PRESETS))assert.ok(getTemplate(name).bars<=500);
});
test('rejects unrecognized CSS payloads and invalid indicator flags',()=>{
  assert.throws(()=>validateChartTemplate({mode:'line',bars:90,sma:true,rsi:false,palette:'url(evil)'}),/Unknown palette/);
  assert.throws(()=>validateChartTemplate({mode:'html',bars:90,sma:true,rsi:false,palette:'calm'}),/Unknown chart mode/);
  assert.throws(()=>validateChartTemplate({mode:'line',bars:10000,sma:true,rsi:false,palette:'calm'}),/bar count/);
  assert.throws(()=>validateChartTemplate({mode:'line',bars:90,sma:'false',rsi:false,palette:'calm'}),/Indicator/);
});
test('custom templates are sanitized and override no built-in name',()=>{
  const original={mode:'line',bars:120,sma:false,rsi:true,palette:'mono',unexpected:'untrusted'};
  assert.deepEqual(getTemplate('mine',{mine:original}),{mode:'line',bars:120,sma:false,rsi:true,palette:'mono'});
  assert.equal(getTemplate('calm',{calm:original}).palette,'calm');
  assert.throws(()=>getTemplate('missing'),/Unknown/);
});
test('symbol-scoped OHLC accepts duplicate dates for different symbols only',()=>{
  const groups=normalizeSymbolCandles([bar('AAA'),bar('BBB'),bar('aaa','2026-10-18')]);
  assert.deepEqual(Object.keys(groups),['AAA','BBB']);
  assert.equal(groups.AAA.length,2);
  assert.equal(groups.BBB.length,1);
  assert.throws(()=>normalizeSymbolCandles([bar('AAA'),bar('AAA')]),/Duplicate/);
});
test('unlabeled OHLC remains separate imported generic series',()=>{
  const entries=normalizeSymbolCandles([{date:'2026-10-17',open:1,high:2,low:1,close:1.5}]);
  assert.deepEqual(Object.keys(entries),['IMPORTED']);
  assert.equal(entries.IMPORTED[0].close,1.5);
  assert.throws(()=>normalizeSymbolCandles([bar('AAA'),{date:'2026-10-18',open:1,high:2,low:1,close:1.5}]),/Every candle/);
});
test('rejects suspicious ticker characters, malformed candle data and oversized groups',()=>{
  assert.throws(()=>normalizeSymbolCandles([bar('<svg>')]),/Invalid OHLC ticker/);
  assert.throws(()=>normalizeSymbolCandles([bar('AAA','not-a-date')]),/Invalid candle date/);
  assert.throws(()=>normalizeSymbolCandles(Array.from({length:201},(_,i)=>bar('T'+i))),/Maximum 200/);
});
test('screener charts only display data for corresponding imported ticker',()=>{
  const collection=availableScreenCharts([{symbol:'AAA'},{symbol:'BBB'},{symbol:'CCC'}],normalizeSymbolCandles([bar('AAA')]),{max:2});
  assert.equal(collection.length,2);
  assert.equal(collection[0].state,'AVAILABLE');
  assert.equal(collection[1].state,'NO_MATCHING_OHLC');
  assert.deepEqual(collection[1].candles,[]);
  assert.throws(()=>availableScreenCharts([],{},{max:51}),/size/);
});

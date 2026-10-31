import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, parseTabular, normalizeStocks, screenStocks, groupHeatmap, normalizeCandles, normalizeDailyCloses, sma, rsi, assessSnapshot, exportCsv } from '../../market-lab/core.mjs';

const stock = (x={}) => ({symbol:'ABC',name:'Alpha Corp',sector:'Technology',industry:'Software',price:25,changePct:2,marketCap:10e9,volume:100_000,pe:20,...x});
test('quoted CSV and JSON arrays parse with original column names',()=>{
  assert.deepEqual(parseTabular('symbol,name\nABC,"Alpha, Corp"\n')[0],{symbol:'ABC',name:'Alpha, Corp'});
  assert.equal(parseTabular(JSON.stringify([stock()])).length,1);
  assert.deepEqual(parseTabular(''),[]);
});
test('rejects broken quotes, excessive input and malformed JSON',()=>{
  assert.throws(()=>parseTabular('symbol,name\nABC,"unclosed'),/Unclosed/);
  assert.throws(()=>parseTabular('symbol\nABC,'.repeat(300_000)),/2 MB/);
  assert.throws(()=>parseTabular('[malformed]'),/Invalid JSON/);
});
test('validates symbols, fields, duplicate entries and 52-week range',()=>{
  const v=normalizeStocks([stock(),stock(),stock({symbol:'A<script>'}),stock({symbol:'BAD',price:'Infinity'}),stock({symbol:'RANGE',low52:8,high52:4})]);
  assert.equal(v.rows.length,1);
  assert.deepEqual(v.errors.map(e=>e.reason),['DUPLICATE_SYMBOL','INVALID_SYMBOL','INVALID_PRICE','INVALID_52_WEEK_RANGE']);
});
test('failing numeric filters do not become permissive screens',()=>{
  const a=stock(),b=stock({symbol:'X',sector:'Energy',volume:null,marketCap:null,changePct:-1});
  assert.deepEqual(screenStocks([a,b],{sector:'Technology',minMarketCap:100}).map(x=>x.symbol),['ABC']);
  assert.deepEqual(screenStocks([a,b],{minVolume:1}).map(x=>x.symbol),['ABC']);
  assert.throws(()=>screenStocks([a],{minVolume:'NaN'}),/Invalid filter/);
});
test('sorted results are deterministic with missing values last',()=>{
  const r=screenStocks([stock({symbol:'D',price:null}),stock({symbol:'B',price:7}),stock({symbol:'A',price:3})],{sort:'price',descending:true});
  assert.deepEqual(r.map(x=>x.symbol),['B','A','D']);
});
test('heatmap is grouped and not misrepresented as full-market coverage',()=>{
  const g=groupHeatmap([stock(),stock({symbol:'E',sector:'Energy',marketCap:100})]);
  assert.deepEqual(g.map(x=>x.sector),['Technology','Energy']);
  assert.equal(g[0].entries.length,1);
});
test('OHLC requires genuine coherent bars, unique dates, and valid prices',()=>{
  assert.deepEqual(normalizeCandles([{date:'2026-10-17',open:'1',high:'3',low:'1',close:'2'}])[0].close,2);
  assert.throws(()=>normalizeCandles([{date:'2026-10-17',open:1,high:1,low:1,close:2}]),/Invalid OHLC/);
  assert.throws(()=>normalizeCandles([{date:'2026-02-30',open:1,high:1,low:1,close:1}]),/Invalid candle date/);
  assert.throws(()=>normalizeCandles([{date:'2026-10-17',open:1,high:1,low:1,close:1},{date:'2026-10-17',open:1,high:1,low:1,close:1}]),/Duplicate candle/);
});
test('daily close is never inflated into synthetic candles',()=>{
  const d=normalizeDailyCloses([{x:'2026-10-02',y:3},{x:'2026-10-01',y:2}]);
  assert.deepEqual(d.map(x=>x.close),[2,3]);
  assert.equal(d[0].open,undefined);
  assert.throws(()=>normalizeDailyCloses([{x:'2026-10-01',y:1},{x:'2026-10-01',y:2}]),/duplicate/);
});
test('SMA and RSI honor warm-up windows, flat series and rising series',()=>{
  assert.deepEqual(sma([1,2,3,4],3),[null,null,2,3]);
  assert.equal(rsi(Array(20).fill(100))[14],50);
  assert.equal(rsi(Array.from({length:20},(_,i)=>100+i))[14],100);
  assert.throws(()=>sma([1,NaN],2),/Non-finite/);
});
test('verified snapshot labels daily close only when fresh and timestamp valid',()=>{
  const now=Date.parse('2026-10-18T08:00:00Z');
  const m={verified:true,seed:false,generatedAt:'2026-10-18T07:00:00Z',staleAfterHours:30};
  assert.equal(assessSnapshot(m,now).state,'DAILY_CLOSE');
  assert.equal(assessSnapshot(m,now+32*3_600_000).state,'STALE');
  assert.equal(assessSnapshot({...m,generatedAt:'2026-10-20'},now).state,'INVALID_TIME');
  assert.equal(assessSnapshot({...m,verified:false},now).state,'UNVERIFIED');
});
test('CSV protects untrusted string cells from spreadsheet formula injection',()=>{
  const csv=exportCsv([stock({symbol:'ABC',name:'=HYPERLINK("https://example.invalid")'})]);
  assert.ok(csv.includes("'=HYPERLINK"));
});
test('bulk inputs have strict upper bounds',()=>{
  assert.throws(()=>normalizeStocks(Array(LIMITS.rows+1).fill(stock())),/Maximum/);
  assert.throws(()=>normalizeCandles(Array(LIMITS.candles+1).fill({date:'2026-01-01'})),/Maximum/);
});

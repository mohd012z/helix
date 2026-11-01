import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChartRows, renderLightweightChart, releaseChart, releaseChartsWithin
} from '../../market-lab/chart-adapter.mjs';

const day = i => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
const candles = Array.from({length:30},(_,i)=>({
  date:day(i),open:100+i,high:104+i,low:99+i,close:102+i,volume:150+i
}));

function environment({failCreate=false}={}) {
  const previous=globalThis.document;
  const stats={created:0,removed:0,series:[],options:[]};
  const element = tag => ({
    tag,className:'',children:[],
    setAttribute(){},
    replaceChildren(...nodes){this.children=nodes;},
    appendChild(node){this.children.push(node);},
  });
  globalThis.document={
    createElement:element,
    documentElement:{classList:{contains:()=>false}},
  };
  const host={
    clientWidth:390,
    children:[],
    replaceChildren(...nodes){this.children=nodes;},
    appendChild(node){this.children.push(node);},
    querySelectorAll(){return [];},
  };
  const lib={
    LineSeries:'line',CandlestickSeries:'candles',HistogramSeries:'volume',
    createChart(_stage,opts){
      if(failCreate)throw new Error('Browser renderer unavailable');
      stats.created++;stats.options.push(opts);
      return {
        addSeries(type,seriesOpts){
          const state={type,options:seriesOpts,data:null};
          stats.series.push(state);
          return {
            setData(data){state.data=data;},
            priceScale(){return {applyOptions(options){state.scale=options;}};},
          };
        },
        timeScale(){return {fitContent(){}};},
        remove(){stats.removed++;},
      };
    },
  };
  return {host,lib,stats,restore(){globalThis.document=previous;}};
}

test('converts genuine daily close and OHLC without inventing missing prices',()=>{
  assert.deepEqual(normalizeChartRows([{date:'2026-01-01',close:12}], 'line'),
    [{time:'2026-01-01',value:12}]);
  assert.deepEqual(normalizeChartRows([candles[0]],'candles'),
    [{time:candles[0].date,open:100,high:104,low:99,close:102}]);
  assert.throws(()=>normalizeChartRows([{date:'2026-01-01',close:12}],'candles'),
    /genuine, valid OHLC/i);
});

test('rejects invalid, duplicate, reversed, nonfinite, impossible, and future calendar dates',()=>{
  const valid={date:'2026-01-01',close:100};
  for(const data of [
    [{date:'2026-02-31',close:100}],
    [{date:'2026-01-01',close:NaN}],
    [{date:'2026-01-01',close:Infinity}],
    [{date:'2026-01-01',close:-1}],
    [valid,valid],
    [{date:'2026-01-02',close:1},valid],
  ])assert.throws(()=>normalizeChartRows(data));
  assert.throws(()=>normalizeChartRows([{...candles[0],high:99}], 'candles'),/OHLC/);
  assert.throws(()=>normalizeChartRows(Array(5001).fill(valid)),/length/);
});

test('renders native candlesticks, finite volume, SMA5, SMA20, RSI readout',()=>{
  const env=environment();
  try{
    assert.equal(renderLightweightChart(env.host,candles,{
      mode:'candles',bars:5,sma:true,showRsi:true,title:'Verified historical',
    },env.lib),true);
    assert.equal(env.stats.created,1);
    assert.equal(env.stats.series.length,4);
    assert.deepEqual(env.stats.series.map(s=>s.type),['candles','line','line','volume']);
    assert.equal(env.stats.series[0].data.length,5);
    assert.equal(env.stats.series[0].data[0].time,candles[25].date);
    assert.equal(env.stats.series[2].data.length,5,'SMA20 should use full historical lookback');
    assert.equal(env.stats.series[3].data.length,5);
    assert.equal(env.stats.series[3].scale.scaleMargins.top,.78);
    assert.match(env.host.children.at(-1).textContent,/RSI/);
    releaseChartsWithin(env.host);
    assert.equal(env.stats.removed,1);
  }finally{env.restore();}
});

test('daily closing price displays line only: no artificial volume or candles',()=>{
  const env=environment();
  try{
    const closeOnly=candles.map(({date,close})=>({date,close}));
    assert.equal(renderLightweightChart(env.host,closeOnly,{mode:'line',sma:true},env.lib),true);
    assert.ok(env.stats.series.every(s=>s.type==='line'));
    releaseChart(env.host);
    assert.equal(env.stats.removed,1);
  }finally{env.restore();}
});

test('switching charts disposes stale canvas instances without leaking',()=>{
  const env=environment();
  try{
    assert.equal(renderLightweightChart(env.host,candles,{mode:'line'},env.lib),true);
    assert.equal(renderLightweightChart(env.host,candles,{mode:'candles'},env.lib),true);
    assert.equal(env.stats.created,2);
    assert.equal(env.stats.removed,1);
    releaseChart(env.host);
    releaseChart(env.host);
    assert.equal(env.stats.removed,2);
  }finally{env.restore();}
});

test('charting exceptions fail closed so HELIX SVG remains available',()=>{
  const env=environment({failCreate:true});
  try{
    assert.equal(renderLightweightChart(env.host,candles,{mode:'line'},env.lib),false);
    assert.deepEqual(env.host.children,[]);
  }finally{env.restore();}
  assert.equal(renderLightweightChart({},candles),false,'no dependency present');
});

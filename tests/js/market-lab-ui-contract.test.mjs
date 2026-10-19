import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const html=await fs.readFile(new URL('../../market-lab/index.html',import.meta.url),'utf8');
const ui=await fs.readFile(new URL('../../market-lab/market-lab.mjs',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../../market-lab/market-lab.css',import.meta.url),'utf8');
const compare=await fs.readFile(new URL('../../market-lab/compare-view.mjs',import.meta.url),'utf8');
const matrix=await fs.readFile(new URL('../../market-lab/matrix-view.mjs',import.meta.url),'utf8');

test('UI script references only IDs declared in its HTML document',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=new Set([...ui.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]).filter(ref=>!ref.startsWith('[')));
  const missing=[...refs].filter(ref=>!ids.has(ref));
  assert.deepEqual(missing,[],'Missing DOM element IDs: '+missing.join(', '));
});
test('primary views each have a navigation button and a page section',()=>{
  for(const name of ['overview','screener','charts','heatmap','matrix','maps','compare','watchlist','sources']){
    assert.ok(html.includes(`data-nav="${name}"`));
    assert.ok(html.includes(`data-page="${name}"`));
  }
});
test('chart templates, stock import, OHLC source and screener charts controls are present',()=>{
  for(const id of ['chart-template','apply-chart-template','save-chart-template','chart-bars','chart-palette','ohlc-symbol','screen-charts','screen-view','screener-table','stock-file','ohlc-file','compare-run','compare-plot','compare-symbol-options','compare-ranking','compare-correlation','compare-monthly','matrix-body','matrix-metric','matrix-sector','matrix-status','matrix-previous','matrix-next','matrix-details','map-embed-input','map-embed-load','map-embed-clear','map-embed-host'])
    assert.ok(html.includes(`id="${id}"`),`Missing UI: ${id}`);
  assert.match(css,/\.screen-grid/);
});
test('market lab has no execution or external quote API calls in its runtime module',()=>{
  assert.doesNotMatch(ui,/\bfetch\s*\(/);
  assert.doesNotMatch(ui,/\bnew\s+WebSocket\s*\(/);
  assert.doesNotMatch(ui,/\binnerHTML\s*=/);
  assert.ok(html.includes('src="../xauusd-data.js"'));
});
test('no chart library or Finviz script is remotely included',()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(scripts,['../xauusd-data.js','./market-lab.mjs']);
});

test('comparison renderer IDs exist and contain no remote feed or raw HTML injection',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=new Set([...compare.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
  assert.deepEqual([...refs].filter(x=>!ids.has(x)),[]);
  assert.doesNotMatch(compare,/\bfetch\s*\(/);
  assert.doesNotMatch(compare,/\binnerHTML\s*=/);
});

test('matrix and map controls exist; renderer cannot inject third-party markup',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const refs=new Set([...matrix.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]));
  assert.deepEqual([...refs].filter(id=>!ids.has(id)),[]);
  assert.doesNotMatch(matrix,/\binnerHTML\s*=/);
  assert.doesNotMatch(matrix,/\bfetch\s*\(/);
});

test('interactive renderer is opt-in, version pinned, and attributed',()=>{
  assert.match(html,/id="enable-advanced-charts"/);
  assert.match(html,/id="chart-engine-status"/);
  assert.match(html,/TradingView Lightweight Charts/);
  assert.match(html,/https:\/\/www\.tradingview\.com\//);
  assert.match(ui,/lightweight-charts@5\.2\.1\/dist\/lightweight-charts\.standalone\.production\.js/);
  assert.match(ui,/interactiveCharts=false/);
  assert.match(ui,/releaseChartsWithin\(grid\)/);
});

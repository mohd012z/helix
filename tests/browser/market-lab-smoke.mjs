/**
 * Full-page HELIX Market Lab smoke test. Serves repository files locally, blocks
 * all internet requests, and uses only synthetic fixture securities/prices.
 *
 * Run from repo root after installing playwright in tests/browser:
 *   node tests/browser/market-lab-smoke.mjs
 */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=resolve(root,'tests/browser/artifacts');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const fixtures=[
  {symbol:'AAA',name:'Synthetic AA',sector:'Technology',industry:'Software',price:110,changePct:5,volume:200000,marketCap:15000000000,low52:80,high52:125,pe:20},
  {symbol:'BBB',name:'Synthetic BB',sector:'Technology',industry:'Software',price:54,changePct:null,volume:220000,marketCap:3000000000,low52:44,high52:70,pe:null},
  {symbol:'CCC',name:'Synthetic CC',sector:'Energy',industry:'Services',price:80,changePct:-2,volume:90000,marketCap:500000000,low52:65,high52:120,pe:17},
];
const dates=['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09'];
const ohlc=[
  ...dates.map((date,i)=>({symbol:'AAA',date,open:100+i,high:111+i,low:99+i,close:102+i,volume:1000+i})),
  ...dates.map((date,i)=>({symbol:'BBB',date,open:50+i,high:56+i,low:49+i,close:52+i,volume:1000+i})),
];
const screenshots=[
  {name:'phone-390',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
  {name:'tablet-820',viewport:{width:820,height:1180},hasTouch:true},
  {name:'desktop-1440',viewport:{width:1440,height:900}},
];
const server=createServer(async(req,res)=>{
  let path;
  try {
    const url=new URL(req.url,'http://localhost');
    path=decodeURIComponent(url.pathname);
    if (!path.startsWith('/market-lab/') && path!=='/xauusd-data.js' && path!=='/favicon.ico') {
      res.writeHead(404);res.end('Not found');return;
    }
    if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const absolute=resolve(root,'.'+path);
    if(!absolute.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const content=await readFile(absolute);
    res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(content);
  }catch(error){res.writeHead(404);res.end('Missing: '+String(error.code??'error'));}
});
let browser;
const fail=(message)=>{throw new Error(message);};
async function click(page,selector){await page.locator(selector).click();}
async function oneScenario(test,origin) {
  const context=await browser.newContext({viewport:test.viewport,isMobile:test.isMobile??false,hasTouch:test.hasTouch??false,reducedMotion:'reduce'});
  const errors=[],external=[];
  await context.route('**/*',async route=>{
    const address=route.request().url();
    if(address.startsWith(origin+'/'))await route.continue();
    else {external.push(address);await route.abort('blockedbyclient');}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(11000);
  page.on('pageerror',e=>errors.push(e.message));
  try {
    const response=await page.goto(origin+'/market-lab/index.html',{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.match(await page.locator('#page-title').textContent(),/Research overview/);
    assert.equal(await page.locator('[data-nav]').count(),9,'all nine navigation tabs must load');
    assert.equal(external.length,0,'no third-party asset fetch on startup');
    const horizontal=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(horizontal.scroll<=horizontal.width+2,'document horizontal overflow at '+test.name+': '+JSON.stringify(horizontal));
    await click(page,'[data-nav="screener"]');
    await click(page,'#sample-stocks');
    assert.match(await page.locator('#screener-status').textContent(),/FICTIONAL SAMPLE/);
    await click(page,'[data-nav="matrix"]');
    assert.match(await page.locator('#matrix-status').textContent(),/FICTIONAL SAMPLE ONLY/);
    assert.ok(await page.locator('#matrix-body .mx-value').count()>=4,'sample Matrix cells missing');
    await page.locator('#matrix-body .mx-value').first().click();
    assert.match(await page.locator('#matrix-details').textContent(),/imported/);
    await page.locator('#matrix-palette').selectOption('accessible');
    assert.ok(await page.locator('#matrix-body .mx-accessible').count()>0,'accessible palette not applied');
    await click(page,'[data-nav="screener"]');
    await page.locator('#stock-file').setInputFiles({
      name:'synthetic-stocks.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixtures)),
    });
    await page.locator('#screener-status').filter({hasText:'UNVERIFIED USER INPUT'}).waitFor();
    await click(page,'[data-nav="matrix"]');
    const coverage=await page.locator('#matrix-status').textContent();
    assert.match(coverage,/3 imported securities/);
    assert.match(coverage,/1 missing/);
    await page.locator('#matrix-search').fill('Software');
    assert.match(await page.locator('#matrix-page').textContent(),/1 of 1/);
    await click(page,'[data-nav="charts"]');
    await page.locator('#ohlc-file').setInputFiles({
      name:'synthetic-bars.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ohlc)),
    });
    await page.locator('#ohlc-symbol option[value="AAA"]').waitFor({state:'attached'});
    await click(page,'[data-nav="compare"]');
    await click(page,'#compare-clear');
    await page.locator('.compare-option input[value="AAA"]').check();
    await page.locator('.compare-option input[value="BBB"]').check();
    await click(page,'#compare-run');
    assert.match(await page.locator('#compare-status').textContent(),/5 exact shared dates/);
    assert.equal(await page.locator('#compare-ranking tbody tr').count(),2);
    assert.equal(await page.locator('#compare-correlation tbody tr').count(),2);
    assert.equal(await page.locator('#compare-plot svg').count(),1);
    await click(page,'[data-nav="maps"]');
    assert.equal(await page.locator('#map-embed-host iframe').count(),0);
    await page.locator('#map-embed-input').fill('https://finviz.com.evil.invalid/map');
    await click(page,'#map-embed-load');
    assert.match(await page.locator('#map-embed-status').textContent(),/Rejected/);
    assert.equal(await page.locator('#map-embed-host iframe').count(),0);
    assert.equal(external.length,0,'invalid embed may not initiate network traffic');
    await page.locator('#map-embed-input').fill('https://finviz.com/map?t=sec');
    await click(page,'#map-embed-load');
    assert.equal(await page.locator('#map-embed-host iframe').count(),1);
    assert.match(await page.locator('#map-embed-host iframe').getAttribute('src'),/^https:\/\/finviz\.com\/map/);
    await click(page,'#map-embed-clear');
    assert.equal(await page.locator('#map-embed-host iframe').count(),0);
    const nonFinviz=external.filter(url=>!url.startsWith('https://finviz.com/map'));
    assert.deepEqual(nonFinviz,[],'unexpected external web requests');
    // Opt-in external chart loader is blocked by this offline browser test.
    // Failure must preserve imported OHLC in the original SVG chart.
    await click(page,'[data-nav="charts"]');
    await page.locator('#chart-mode').selectOption('candles');
    assert.ok(await page.locator('#chart-grid svg').count()>0,'offline OHLC SVG missing');
    await click(page,'#enable-advanced-charts');
    await page.locator('#chart-engine-status').filter({hasText:'SVG fallback'}).waitFor();
    assert.ok(await page.locator('#chart-grid svg').count()>0,'SVG fallback lost after CDN failure');
    assert.ok(external.some(url=>url==='https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js'),
      'opt-in chart loader must request only a pinned package');
    const unexpected=external.filter(url=>!url.startsWith('https://finviz.com/map') &&
      url!=='https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js');
    assert.deepEqual(unexpected,[],'unexpected third-party network');
    await click(page,'[data-nav="matrix"]');
    await page.screenshot({path:join(output,'market-lab-'+test.name+'.png'),fullPage:true});
    assert.deepEqual(errors,[],'uncaught JavaScript errors');
    console.log('PASS '+test.name+': no horizontal overflow, samples, imports, Matrix, Compare, iframe consent');
  }catch(error){
    await page.screenshot({path:join(output,'FAILED-'+test.name+'.png'),fullPage:true}).catch(()=>{});
    throw new Error(test.name+': '+error.message);
  }finally{await context.close();}
}

/**
 * Load the actual published v5.2.1 standalone bundle from the pinned test
 * dependency. It is served by an explicit Playwright route, not fetched from
 * the internet at test time. This proves Canvas rendering (not just a mock).
 */
async function realCanvasScenario(origin){
  const asset=await readFile(join(root,'tests/browser/node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js'));
  assert.ok(asset.length>100_000,'unexpectedly small upstream chart distribution');
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[],requests=[];
  await ctx.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/'))return route.continue();
    requests.push(url);
    if(url==='https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js'){
      return route.fulfill({status:200,contentType:'application/javascript',body:asset});
    }
    return route.abort('blockedbyclient');
  });
  const page=await ctx.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(origin+'/market-lab/index.html',{waitUntil:'domcontentloaded'});
    await click(page,'[data-nav="charts"]');
    await page.locator('#ohlc-file').setInputFiles({
      name:'actual-lib-bars.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(ohlc)),
    });
    await page.locator('#ohlc-symbol option[value="AAA"]').waitFor({state:'attached'});
    await page.locator('#chart-mode').selectOption('candles');
    await click(page,'#enable-advanced-charts');
    await page.locator('#chart-engine-status').filter({hasText:'TradingView charts'}).waitFor();
    assert.equal(await page.locator('#chart-grid .lwc-chart-stage').count(),1);
    assert.ok(await page.locator('#chart-grid canvas').count()>=1,
      'real v5 Canvas rendering absent');
    await page.locator('#chart-layout').selectOption('4');
    assert.equal(await page.locator('#chart-grid .chart-box').count(),4);
    assert.ok(await page.locator('#chart-grid canvas').count()>=1,
      'chart vanished after 4-pane lifecycle replacement');
    await page.locator('#chart-layout').selectOption('1');
    await page.locator('#chart-palette').selectOption('contrast');
    assert.ok(await page.locator('#chart-grid canvas').count()>=1,
      'chart vanished after palette repaint');
    const metrics=await page.evaluate(()=>({
      client:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
    }));
    assert.ok(metrics.scroll<=metrics.client+2,'real chart created horizontal overflow');
    assert.deepEqual(requests,['https://unpkg.com/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js']);
    assert.deepEqual(errors,[],'real v5 chart produced uncaught browser error');
    await page.screenshot({path:join(output,'market-lab-real-lightweight-charts-mobile.png'),fullPage:true});
    console.log('PASS actual official v5 Canvas: imported OHLC, responsive multi-pane, palette and cleanup');
  }finally{await ctx.close();}
}

try{
  await mkdir(output,{recursive:true});
  await new Promise((resolveReady,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolveReady);
  });
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const test of screenshots)await oneScenario(test,origin);
  await realCanvasScenario(origin);
  console.log('PASS ALL: '+screenshots.length+' full-page browser flows; all third-party requests blocked');
}catch(error){
  console.error(error.stack??error);
  process.exitCode=1;
}finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}

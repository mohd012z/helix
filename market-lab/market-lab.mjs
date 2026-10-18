import {
  parseTabular, normalizeStocks, screenStocks, groupHeatmap, normalizeCandles,
  normalizeDailyCloses, sma, rsi, assessSnapshot, exportCsv
} from './core.mjs';
import { CHART_PRESETS, getTemplate, validateChartTemplate, normalizeSymbolCandles, availableScreenCharts } from './chart-templates.mjs';

const $=id=>document.getElementById(id);
const $$=selector=>Array.from(document.querySelectorAll(selector));
const paint=(id,value)=>{const el=$(id);if(el)el.textContent=String(value);};
const snapshot=window.XAUUSD_DATA??null;
const state={stocks:[],errors:[],filtered:[],candles:[],history:[],watch:new Set(),presets:{},chartTemplates:{},ohlcBySymbol:{},sample:false,snapshotQuality:assessSnapshot(snapshot?.meta)};
const NAV_TITLES={overview:'Research overview',screener:'Stock screener',charts:'Market charts',heatmap:'Performance heatmap',watchlist:'Saved watchlist',sources:'Data sources'};
const STORE_KEY='helix-market-lab-v1';
const SAMPLE=[
  {symbol:'EXM1',name:'Example Software (Fictional)',sector:'Technology',industry:'Sample',price:50,changePct:2.1,volume:100000,marketCap:5e9,pe:18},
  {symbol:'EXM2',name:'Example Energy (Fictional)',sector:'Energy',industry:'Sample',price:35,changePct:-1.8,volume:250000,marketCap:3e9,pe:9},
  {symbol:'EXM3',name:'Example Healthcare (Fictional)',sector:'Healthcare',industry:'Sample',price:90,changePct:0.6,volume:45000,marketCap:8e9,pe:30},
  {symbol:'EXM4',name:'Example Banking (Fictional)',sector:'Financials',industry:'Sample',price:18,changePct:-2.7,volume:300000,marketCap:2e9,pe:12},
];
const nf=(value,digits=2)=>value==null?'—':Number(value).toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const money=value=>value==null?'—':(Math.abs(value)>=1e12?'$'+nf(value/1e12,2)+'T':Math.abs(value)>=1e9?'$'+nf(value/1e9,2)+'B':Math.abs(value)>=1e6?'$'+nf(value/1e6,2)+'M':'$'+nf(value,2));
const tone=value=>value==null?'':value>0?'trend-up':value<0?'trend-down':'';
const safeStore=()=>{
  try {localStorage.setItem(STORE_KEY,JSON.stringify({watch:[...state.watch],presets:state.presets,chartTemplates:state.chartTemplates,theme:document.documentElement.classList.contains('light')?'light':'dark'}));}
  catch { /* Browsers can disable local storage: page remains functional in-memory. */ }
};
function restore() {
  try {
    const saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
    if(Array.isArray(saved.watch)) state.watch=new Set(saved.watch.filter(s=>typeof s==='string'&&/^[A-Z0-9.^/_-]{1,20}$/.test(s)).slice(0,300));
    if(saved.presets&&typeof saved.presets==='object'&&!Array.isArray(saved.presets)){
      state.presets=Object.fromEntries(Object.entries(saved.presets).filter(([k,v])=>typeof k==='string'&&k.length<46&&v&&typeof v==='object').slice(0,30));
    }
    if(saved.chartTemplates&&typeof saved.chartTemplates==='object'&&!Array.isArray(saved.chartTemplates)){
      const safe={};
      for(const [key,value] of Object.entries(saved.chartTemplates).slice(0,20)){
        if(typeof key!=='string'||key.length>45||Object.hasOwn(CHART_PRESETS,key))continue;
        try{safe[key]=validateChartTemplate(value);}catch{}
      }
      state.chartTemplates=safe;
    }
    if(saved.theme==='light')document.documentElement.classList.add('light');
  } catch { /* Invalid persisted settings are ignored. */ }
}
function nav(name){
  if(!NAV_TITLES[name])return;
  $$('[data-nav]').forEach(el=>{const current=el.dataset.nav===name;el.classList.toggle('active',current);el.setAttribute('aria-current',current?'page':'false');});
  $$('[data-page]').forEach(el=>{el.hidden=el.dataset.page!==name;});
  paint('page-title',NAV_TITLES[name]);
  if(name==='charts')renderCharts();
  if(name==='heatmap')renderHeatmap();
  if(name==='watchlist')renderWatchlist();
  if(name==='sources')renderSources();
}
function make(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!=null)el.textContent=String(text);
  return el;
}
function row3(left,middle,right) {
  const e=make('div','row');e.append(make('strong','',left),make('span','',middle),make('span','right',right));return e;
}
function snapshotInit(){
  if(snapshot){
    try {state.history=normalizeDailyCloses(snapshot.priceSeries?.points??[]);}
    catch {state.history=[];state.snapshotQuality={state:'INVALID_SERIES',detail:'XAU close data failed validation'};}
  }
  const quality=state.snapshotQuality;
  paint('feed-state',quality.state);
  paint('feed-detail',quality.detail+' • Stock universe & streaming prices are not connected.');
  if(state.history.length){
    paint('xau-last',nf(state.history.at(-1).close,2));
    paint('xau-kind',`Historical daily close • ${state.history.at(-1).date}`);
    renderSvg($('overview-chart'),state.history,{mode:'line',title:'XAU/USD historical daily closes',sma:true});
    paint('overview-meta',`Twelve Data via HELIX • ${state.history.length} published daily closes • Snapshot: ${quality.state}`);
  } else {
    showEmpty($('overview-chart'),'Verified historical XAU price series unavailable.');
    paint('overview-meta','No valid historical price series available.');
  }
  renderReadiness();
  renderSources();
}
function renderReadiness(){
  const host=$('readiness');host.replaceChildren();
  const rows=[
    ['XAU source',state.snapshotQuality.state,state.history.length?'History loaded':'No verified history'],
    ['Stock universe',state.stocks.length?state.stocks.length+' rows':'UNAVAILABLE',state.sample?'Sample only':'Local import required'],
    ['Live quotes','NOT CONNECTED','Licensed feed required'],
    ['Local exports','AVAILABLE','CSV on user action'],
    ['Trade execution','DISABLED','No broker integration'],
  ];
  for(const r of rows)host.append(row3(...r));
}
const SVG='http://www.w3.org/2000/svg';
function addSvg(parent,type,attributes={},text){
  const node=document.createElementNS(SVG,type);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=String(text);
  parent.appendChild(node);
  return node;
}
function showEmpty(host,message){host.replaceChildren(make('div','no-data',message));}
function renderSvg(host,series,{mode='line',title='Historical series',sma:showSma=false,showRsi=false,bars=90,palette='calm'}={}){
  const colors={
    calm:{line:'#6ce0d3',up:'#4edaac',down:'#fd718e',sma5:'#e9be79',sma20:'#6ea8ff'},
    classic:{line:'#f2ae55',up:'#32c18e',down:'#ed5577',sma5:'#e9be79',sma20:'#9c8aff'},
    contrast:{line:'#fbdf5a',up:'#3de4fb',down:'#ff8b49',sma5:'#ffffff',sma20:'#ff60ee'},
    mono:{line:'#dddddd',up:'#ffffff',down:'#878787',sma5:'#aaaaaa',sma20:'#707070'},
  }[palette]??{line:'#6ce0d3',up:'#4edaac',down:'#fd718e',sma5:'#e9be79',sma20:'#6ea8ff'};
  host.replaceChildren();
  if(!Array.isArray(series)||series.length===0){showEmpty(host,'No validated price history available for this view.');return;}
  const items=series.slice(-Math.max(5,Math.min(500,Number.isInteger(bars)?bars:90)));
  if(mode==='candles'&&items.some(p=>!Number.isFinite(p.open)||!Number.isFinite(p.high)||!Number.isFinite(p.low))){
    showEmpty(host,'Candlestick chart unavailable: genuine OHLC is required.');return;
  }
  const w=760,h=280,L=20,R=74,T=22,B=32,plotW=w-L-R,plotH=h-T-B;
  const vals=items.flatMap(x=>mode==='candles'?[x.low,x.high]:[x.close]);
  let low=Math.min(...vals),high=Math.max(...vals);
  const pad=(high-low||high*0.01||1)*0.09;low-=pad;high+=pad;
  const y=p=>T+(high-p)/(high-low)*plotH;
  const x=i=>L+(items.length===1?plotW/2:(i/(items.length-1))*plotW);
  const svg=addSvg(host,'svg',{viewBox:`0 0 ${w} ${h}`,role:'img','aria-label':title,preserveAspectRatio:'none'});
  for(let i=0;i<5;i++){
    const val=low+(high-low)*(1-i/4),pos=T+plotH*i/4;
    addSvg(svg,'line',{x1:L,x2:w-R,y1:pos,y2:pos,stroke:'var(--border)','stroke-width':1});
    addSvg(svg,'text',{x:w-R+7,y:pos+4,fill:'var(--muted)','font-size':11},nf(val,2));
  }
  for(const frac of [0,.33,.66,1]){
    const j=Math.round(frac*(items.length-1));
    addSvg(svg,'text',{x:x(j),y:h-8,'text-anchor':'middle',fill:'var(--muted)','font-size':10},items[j].date.slice(5));
  }
  if(mode==='candles'){
    const candleW=Math.max(2,Math.min(13,plotW/Math.max(items.length,1)*0.65));
    items.forEach((p,i)=>{
      const c=p.close>=p.open?colors.up:colors.down;
      addSvg(svg,'line',{x1:x(i),x2:x(i),y1:y(p.high),y2:y(p.low),stroke:c,'stroke-width':1.5});
      addSvg(svg,'rect',{x:x(i)-candleW/2,y:Math.min(y(p.open),y(p.close)),width:candleW,height:Math.max(1,Math.abs(y(p.open)-y(p.close))),fill:c});
    });
  }else{
    const d=items.map((p,i)=>`${i?'L':'M'} ${x(i).toFixed(2)} ${y(p.close).toFixed(2)}`).join(' ');
    addSvg(svg,'path',{d,fill:'none',stroke:colors.line,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});
  }
  if(showSma){
    for(const [period,color] of [[5,colors.sma5],[20,colors.sma20]]){
      const values=sma(items.map(p=>p.close),period);
      const d=values.map((value,i)=>value==null?'':`${i===period-1?'M':'L'} ${x(i).toFixed(2)} ${y(value).toFixed(2)}`).filter(Boolean).join(' ');
      if(d)addSvg(svg,'path',{d,stroke:color,'stroke-width':1.8,fill:'none'});
    }
  }
  const caption=make('div','chart-tooltip',`${items.at(-1).date} • Close ${nf(items.at(-1).close,4)}`);
  host.appendChild(caption);
  svg.addEventListener('pointermove',ev=>{
    const rect=svg.getBoundingClientRect();
    if(!rect.width)return;
    const coord=(ev.clientX-rect.left)/rect.width*w;
    const index=items.length===1?0:Math.round((coord-L)/plotW*(items.length-1));
    const p=items[Math.max(0,Math.min(items.length-1,index))];
    caption.textContent=`${p.date} • Close ${nf(p.close,4)}${mode==='candles'?' • Open '+nf(p.open,4)+' • High '+nf(p.high,4)+' • Low '+nf(p.low,4):''}`;
  });
  svg.addEventListener('pointerleave',()=>{caption.textContent=`${items.at(-1).date} • Close ${nf(items.at(-1).close,4)}`;});
  if(showRsi){
    const value=rsi(items.map(p=>p.close)).at(-1);
    host.append(make('div','chart-tooltip',`RSI(14): ${value===null?'insufficient history':nf(value,1)} • Historical indicator only`));
  }
}
function filteredOptions(){
  return {search:$('stock-search').value,sector:$('sector-filter').value,
    minMarketCap:$('min-cap').value,minVolume:$('min-volume').value,minChangePct:$('min-change').value,
    sort:$('sort-field').value,descending:$('sort-dir').value==='desc'};
}
function renderStockFilters(){
  const el=$('sector-filter'),selected=el.value;
  el.replaceChildren(new Option('All sectors','ALL'));
  [...new Set(state.stocks.map(s=>s.sector))].sort().forEach(sector=>el.add(new Option(sector,sector)));
  el.value=[...el.options].some(o=>o.value===selected)?selected:'ALL';
}
function renderScreener(){
  let rows=[];
  try{rows=screenStocks(state.stocks,filteredOptions());paint('screener-status',state.stocks.length
    ?`${rows.length} of ${state.stocks.length} imported rows • ${state.sample?'FICTIONAL SAMPLE — not real prices':'UNVERIFIED USER INPUT'} • ${state.errors.length} rejected records`
    :'No stock dataset loaded. Import data you are authorized to use.');}
  catch(error){paint('screener-status',`Filter error: ${error.message}`);rows=[];}
  state.filtered=rows;
  paint('security-count',state.stocks.length);paint('match-count',rows.length);paint('watch-count',state.watch.size);
  const body=$('screener-body');body.replaceChildren();
  renderScreenCharts();
  if(!rows.length){const tr=make('tr'),td=make('td','empty',state.stocks.length?'No matching securities.':'No stock records yet.');td.colSpan=9;tr.append(td);body.append(tr);return;}
  for(const row of rows){
    const tr=make('tr');const watch=make('td'),btn=make('button','watch-button',state.watch.has(row.symbol)?'★':'☆');
    btn.type='button';btn.setAttribute('aria-label',`Toggle ${row.symbol} watchlist`);btn.addEventListener('click',()=>toggleWatch(row.symbol));watch.append(btn);
    const fields=[row.symbol,row.name,row.sector,row.price==null?'—':nf(row.price),row.changePct==null?'—':nf(row.changePct)+'%',row.volume==null?'—':nf(row.volume,0),money(row.marketCap),row.pe==null?'—':nf(row.pe)];
    tr.append(watch);
    fields.forEach((value,index)=>{const td=make('td',index===0?'ticker':index===4?tone(row.changePct):'',value);tr.append(td);});
    body.append(tr);
  }
}
function renderScreenCharts() {
  const chartMode=$('screen-view').value==='charts';
  $('screener-table').hidden=chartMode;
  $('screen-charts').hidden=!chartMode;
  $('screen-chart-summary').hidden=!chartMode;
  if(!chartMode)return;
  const host=$('screen-charts');host.replaceChildren();
  const selected=availableScreenCharts(state.filtered,state.ohlcBySymbol,{max:24});
  const bars=Number($('chart-bars').value)||90,palette=$('chart-palette').value;
  if(!selected.length){host.append(make('p','empty','No matching securities to chart.'));paint('screen-chart-summary','No rows available.');return;}
  for(const item of selected){
    const box=make('article','chart-box'),h=make('h3','',item.symbol),plot=make('div','chart');
    box.append(h,plot);host.append(box);
    if(item.state!=='AVAILABLE'){showEmpty(plot,'No matching imported OHLC.');continue;}
    renderSvg(plot,item.candles,{mode:'candles',title:item.symbol+' imported OHLC',bars,palette});
  }
  const present=selected.filter(x=>x.state==='AVAILABLE').length;
  paint('screen-chart-summary',`${present} of ${selected.length} displayed symbols have valid imported OHLC. Only the first 24 filtered results are shown. Unverified local files; not streaming quotes.`);
}
function renderHeatmap(){
  const host=$('heatmap-grid');host.replaceChildren();
  if(!state.stocks.length){host.append(make('div','empty','No stock data. Import from Screener.'));return;}
  for(const group of groupHeatmap(state.stocks)){
    const box=make('article','heat-sector'),head=make('h3','',`${group.sector} • ${group.entries.length} imported`),tiles=make('div','heat-tiles');box.append(head);
    for(const stock of group.entries){
      const tile=make('button','heat-tile');
      const v=stock.changePct,mag=v==null?0:Math.min(Math.abs(v)/8,1);
      tile.style.backgroundColor=v==null?'#4b5768':v>=0?`rgb(${Math.round(24*(1-mag)+8)},${Math.round(80+55*mag)},${Math.round(85+10*mag)})`:`rgb(${Math.round(92+68*mag)},${Math.round(45*(1-mag)+15)},${Math.round(65*(1-mag)+24)})`;
      tile.title=`${stock.name} • ${stock.symbol} • ${v==null?'change unavailable':nf(v)+'%'} • import only`;
      tile.append(make('strong','',stock.symbol),make('span','',v==null?'N/A':nf(v)+'%'));
      tile.addEventListener('click',()=>{nav('screener');$('stock-search').value=stock.symbol;renderScreener();});
      tiles.append(tile);
    }
    box.append(tiles);host.append(box);
  }
}
function toggleWatch(symbol){
  if(state.watch.has(symbol))state.watch.delete(symbol);
  else if(state.watch.size<300)state.watch.add(symbol);
  safeStore();renderScreener();renderWatchlist();paint('watch-count',state.watch.size);
}
function renderWatchlist(){
  const host=$('watchlist-items');host.replaceChildren();
  if(!state.watch.size){host.append(make('div','empty','No saved symbols. Add a ticker manually or star a screened row.'));return;}
  for(const symbol of [...state.watch].sort()){
    const found=state.stocks.find(s=>s.symbol===symbol);
    const row=row3(symbol,found?nf(found.price):'No imported quote',found&&found.changePct!=null?nf(found.changePct)+'%':'—');
    const btn=make('button','btn-mini','Remove');btn.addEventListener('click',()=>toggleWatch(symbol));row.append(btn);host.append(row);
  }
}
function renderChartSelectors(){
  const host=$('ohlc-symbol'),prior=host.value,keys=Object.keys(state.ohlcBySymbol).sort();
  host.replaceChildren();
  if(!keys.length){host.add(new Option('No imported OHLC',''));return;}
  keys.forEach(symbol=>host.add(new Option(symbol,symbol)));
  host.value=keys.includes(prior)?prior:keys[0];
}
function renderTemplateList(){
  const host=$('chart-template'),prior=host.value;
  host.replaceChildren();
  for(const [id,preset] of Object.entries(CHART_PRESETS))host.add(new Option(preset.label,id));
  for(const name of Object.keys(state.chartTemplates).sort())host.add(new Option('Custom: '+name,name));
  host.value=[...host.options].some(o=>o.value===prior)?prior:'calm';
}
function applyChartTemplate(){
  try{
    const template=getTemplate($('chart-template').value,state.chartTemplates);
    $('chart-mode').value=template.mode;$('chart-bars').value=String(template.bars);
    $('sma-toggle').checked=template.sma;$('rsi-toggle').checked=template.rsi;
    $('chart-palette').value=template.palette;
    renderCharts();renderScreenCharts();
    paint('chart-feedback','Applied chart template. Data-source provenance remains unchanged.');
  }catch(error){paint('chart-feedback',`Template rejected: ${error.message}`);}
}
function saveChartTemplate(){
  const name=$('chart-template-name').value.trim();
  if(!name||name.length>45||Object.hasOwn(CHART_PRESETS,name)){paint('chart-feedback','Enter a distinct custom template name (1–45 characters).');return;}
  if(!Object.hasOwn(state.chartTemplates,name)&&Object.keys(state.chartTemplates).length>=20){paint('chart-feedback','Maximum 20 custom chart templates.');return;}
  try{
    state.chartTemplates[name]=validateChartTemplate({
      mode:$('chart-mode').value,bars:Number($('chart-bars').value),
      sma:$('sma-toggle').checked,rsi:$('rsi-toggle').checked,palette:$('chart-palette').value
    });
    safeStore();renderTemplateList();$('chart-template').value=name;
    paint('chart-feedback',`Saved reusable chart template: ${name}`);
  }catch(error){paint('chart-feedback',`Template rejected: ${error.message}`);}
}
function renderCharts(){
  const grid=$('chart-grid'),mode=$('chart-mode').value,panes=Number($('chart-layout').value);
  grid.classList.toggle('multi',panes>1);grid.replaceChildren();
  const symbol=$('ohlc-symbol').value;
  state.candles=state.ohlcBySymbol[symbol]??[];
  const settings={sma:$('sma-toggle').checked,showRsi:$('rsi-toggle').checked,
    bars:Number($('chart-bars').value)||90,palette:$('chart-palette').value};
  const entries=mode==='candles'
    ?[{label:`${symbol||'Imported'} genuine OHLC (unverified)`,series:state.candles,mode:'candles'},
      {label:'HELIX XAU daily close — not OHLC',series:state.history,mode:'line'}]
    :[{label:'HELIX XAU daily close',series:state.history,mode:'line'},
      {label:`${symbol||'Imported'} OHLC close history`,series:state.candles,mode:'line'}];
  for(let index=0;index<panes;index++){
    const entry=entries[index]??{label:`Panel ${index+1}: no additional provider series`,series:[],mode:'line'};
    const box=make('div','chart-box'),head=make('h3','',entry.label),plot=make('div','chart');
    box.append(head,plot);grid.append(box);
    renderSvg(plot,entry.series,{mode:entry.mode,title:entry.label,...settings});
  }
  paint('chart-provenance',mode==='candles'?'IMPORTED OHLC IS UNVERIFIED':'HELIX DAILY CLOSE + UNVERIFIED IMPORTS');
  paint('chart-feedback',`HELIX closes: ${state.history.length} • Selected symbol: ${symbol||'none'} • Imported bars: ${state.candles.length}. No licensed live feed is connected.`);
}
function renderSources(){
  const host=$('source-diagnostics');host.replaceChildren();
  const sources=[
    ['XAU historical snapshot',`${state.snapshotQuality.state}: ${state.snapshotQuality.detail}`],
    ['Generated at',snapshot?.meta?.generatedAt??'Unknown'],
    ['Historical closing records',String(state.history.length)],
    ['Stock data',state.stocks.length?`${state.stocks.length} local records; ${state.sample?'FICTIONAL SAMPLE':'UNVERIFIED USER IMPORT'}`:'Not connected'],
    ['Imported OHLC',state.candles.length?`${state.candles.length} unverified local bars`:'Not loaded'],
    ['Exchange live stream','NOT CONNECTED — licensed gateway required'],
    ['External services','NONE — this page makes no quote API calls'],
  ];
  for(const [title,detail] of sources){const node=make('article');node.append(make('strong','',title),make('p','',detail));host.append(node);}
}
async function loadStocks(file) {
  if(!file)return;
  if(file.size>2_000_000){paint('screener-status','Rejected: import exceeds 2 MB.');return;}
  try{
    const entries=parseTabular(await file.text());
    const {rows,errors}=normalizeStocks(entries);
    state.stocks=rows;state.errors=errors;state.sample=false;
    renderStockFilters();renderScreener();renderReadiness();renderHeatmap();renderSources();
  }catch(error){paint('screener-status',`Import rejected: ${error.message}. Previous data retained.`);}
}
async function loadCandles(file){
  if(!file)return;
  if(file.size>2_000_000){paint('chart-feedback','OHLC import rejected: over 2 MB.');return;}
  try{
    const records=parseTabular(await file.text());
    const mapping=normalizeSymbolCandles(records);
    state.ohlcBySymbol=mapping;
    renderChartSelectors();
    const active=$('ohlc-symbol').value;
    state.candles=mapping[active]??[];
    renderCharts();renderScreenCharts();renderSources();
  }catch(error){paint('chart-feedback',`OHLC rejected: ${error.message}. Previous series retained.`);}
}
function csvDownload(){
  if(!state.filtered.length){paint('screener-status','Nothing to export.');return;}
  const csv=exportCsv(state.filtered),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='helix-market-lab-filtered.csv';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function fieldsToPreset(){const o=filteredOptions();return {search:o.search,sector:o.sector,minMarketCap:o.minMarketCap,minVolume:o.minVolume,minChangePct:o.minChangePct,sort:o.sort,descending:o.descending};}
function fillPreset(p){
  if(!p||typeof p!=='object')return;
  $('stock-search').value=typeof p.search==='string'?p.search.slice(0,90):'';
  $('sector-filter').value=typeof p.sector==='string'&&[...$('sector-filter').options].some(o=>o.value===p.sector)?p.sector:'ALL';
  $('min-cap').value=p.minMarketCap??'';$('min-volume').value=p.minVolume??'';$('min-change').value=p.minChangePct??'';
  $('sort-field').value=['symbol','price','changePct','marketCap','volume','pe'].includes(p.sort)?p.sort:'symbol';
  $('sort-dir').value=p.descending===true?'desc':'asc';renderScreener();
}
function renderPresetList(){
  const el=$('presets');el.replaceChildren(new Option('Choose preset',''));
  Object.keys(state.presets).sort().forEach(name=>el.add(new Option(name,name)));
}
function addWatch(){
  const symbol=$('watch-symbol').value.trim().toUpperCase();
  if(!/^[A-Z0-9.^/_-]{1,20}$/.test(symbol)){paint('alert-result','Invalid ticker format.');return;}
  toggleWatch(symbol);$('watch-symbol').value='';
}
function checkPrice(){
  const symbol=$('alert-symbol').value.trim().toUpperCase(),limit=Number($('alert-above').value);
  const row=state.stocks.find(r=>r.symbol===symbol);
  if(!symbol||!$('alert-above').value||!Number.isFinite(limit)||limit<=0){paint('alert-result','Enter a ticker and a positive price threshold.');return;}
  if(!row||row.price==null){paint('alert-result','No matching imported price. No live quotes are available.');return;}
  paint('alert-result',`${symbol} imported price ${nf(row.price)} ${row.price>limit?'is above':'is NOT above'} ${nf(limit)}. ${state.sample?'FICTIONAL SAMPLE; ':''}Local check only, not a notification.`);
}
restore();
snapshotInit();
renderPresetList();
renderStockFilters();
renderScreener();
renderWatchlist();
renderCharts();
$$('[data-nav]').forEach(button=>button.addEventListener('click',()=>nav(button.dataset.nav)));
$('theme-toggle').addEventListener('click',()=>{document.documentElement.classList.toggle('light');safeStore();});
$('stock-file').addEventListener('change',ev=>{void loadStocks(ev.target.files?.[0]);});
$('ohlc-file').addEventListener('change',ev=>{void loadCandles(ev.target.files?.[0]);});
for(const id of ['stock-search','sector-filter','min-cap','min-volume','min-change','sort-field','sort-dir'])$(id).addEventListener('input',renderScreener);
for(const id of ['chart-mode','chart-layout','sma-toggle','rsi-toggle'])$(id).addEventListener('change',renderCharts);
$('sample-stocks').addEventListener('click',()=>{const {rows,errors}=normalizeStocks(SAMPLE);state.stocks=rows;state.errors=errors;state.sample=true;renderStockFilters();renderScreener();renderHeatmap();renderReadiness();renderSources();});
$('export-stocks').addEventListener('click',csvDownload);
$('reset-filters').addEventListener('click',()=>fillPreset({}));
$('save-preset').addEventListener('click',()=>{
  const name=$('preset-name').value.trim();
  if(!name||name.length>45){paint('screener-status','Enter a preset name (1–45 characters).');return;}
  if(!Object.hasOwn(state.presets,name)&&Object.keys(state.presets).length>=30){paint('screener-status','Maximum 30 saved presets.');return;}
  state.presets[name]=fieldsToPreset();safeStore();renderPresetList();$('presets').value=name;
  paint('screener-status',`Saved local filter preset: ${name}`);
});
$('apply-preset').addEventListener('click',()=>{const p=state.presets[$('presets').value];if(p)fillPreset(p);});
$('add-watch').addEventListener('click',addWatch);
$('check-alert').addEventListener('click',checkPrice);
nav('overview');

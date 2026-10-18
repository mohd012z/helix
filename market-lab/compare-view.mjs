/**
 * UI adapter for read-only comparisons of independently observed daily closes.
 * Uses SVG text nodes only; imported strings never become markup.
 */
import { compareHistorical, monthlyReturns } from './comparison.mjs';

const NS = 'http://www.w3.org/2000/svg'; // XML namespace identifier, not a network endpoint.
const COLORS = ['#6ce0d3','#ffbd62','#8ab4ff','#ff779f','#b993ff','#79df82','#ffe276','#d8a789'];
const $ = id => document.getElementById(id);
const node = (tag,text,cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (cls) el.className = cls;
  return el;
};
const svgNode = (tag,attrs={},text) => {
  const el = document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
  if (text !== undefined)el.textContent = String(text);
  return el;
};
const show = (id,message) => {$(id).textContent = String(message);};
const nf = n => Number(n).toFixed(2);
const pct = n => (n >= 0 ? '+' : '') + nf(n) + '%';

function table(host,headers,rows) {
  host.replaceChildren();
  const t=node('table'),thead=node('thead'),hrow=node('tr'),tbody=node('tbody');
  for(const title of headers)hrow.append(node('th',title));
  thead.append(hrow);
  for(const cells of rows){const tr=node('tr');for(const cell of cells)tr.append(node('td',cell));tbody.append(tr);}
  t.append(thead,tbody);host.append(t);
}

function draw(host,result) {
  host.replaceChildren();
  const width=780,height=310,left=58,right=24,top=26,bottom=38;
  const dates=result.commonDates;
  const ms=dates.map(d=>Date.parse(d+'T00:00:00Z'));
  const low=Math.min(100,...result.rows.flatMap(r=>r.indexed.map(p=>p.index)));
  const high=Math.max(100,...result.rows.flatMap(r=>r.indexed.map(p=>p.index)));
  const pad=Math.max((high-low)*.12,0.5),min=low-pad,max=high+pad;
  const x=t=>left+(t-ms[0])/(ms.at(-1)-ms[0])*(width-left-right);
  const y=v=>top+(max-v)/(max-min)*(height-top-bottom);
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Historical indexed performance chart; all series rebased to 100 on their earliest common date',preserveAspectRatio:'xMidYMid meet'});
  for(let i=0;i<=4;i++){
    const val=min+(max-min)*(1-i/4),row=top+(height-top-bottom)*i/4;
    svg.append(svgNode('line',{x1:left,x2:width-right,y1:row,y2:row,stroke:'var(--border)','stroke-width':1}));
    svg.append(svgNode('text',{x:8,y:row+4,fill:'var(--muted)','font-size':12},nf(val)));
  }
  for(const [i,r] of result.rows.entries()){
    const d=r.indexed.map((p,j)=>(j?'L':'M')+x(ms[j]).toFixed(2)+','+y(p.index).toFixed(2)).join(' ');
    svg.append(svgNode('path',{d,fill:'none',stroke:COLORS[i%COLORS.length],'stroke-width':2.7,'stroke-linejoin':'round','stroke-linecap':'round'}));
  }
  svg.append(svgNode('text',{x:left,y:height-9,fill:'var(--muted)','font-size':11},dates[0]));
  svg.append(svgNode('text',{x:width-right,y:height-9,'text-anchor':'end',fill:'var(--muted)','font-size':11},dates.at(-1)));
  host.append(svg);
}

/** @param {{getSeries:Function,getWatchlist:Function,getProvenance:Function}} options */
export function initComparison(options) {
  if (!options || typeof options.getSeries!=='function' || typeof options.getWatchlist!=='function' || typeof options.getProvenance!=='function')throw new TypeError('Missing comparison adapter');
  const checked=new Set();
  let hasSeeded=false;
  function clearOutputs(){
    $('compare-plot').replaceChildren();$('compare-legend').replaceChildren();
    for(const id of ['compare-ranking','compare-correlation','compare-monthly'])$(id).replaceChildren();
  }
  function refresh() {
    const series=options.getSeries(),keys=Object.keys(series).sort();
    const host=$('compare-symbol-options');host.replaceChildren();
    for(const key of [...checked])if(!keys.includes(key))checked.delete(key);
    if(!hasSeeded && keys.includes('HELIX.XAU/USD'))checked.add('HELIX.XAU/USD');
    hasSeeded=true;
    if(!keys.length){host.append(node('p','No historical datasets loaded. Import OHLC data in the Charts tab.','empty'));}
    else for(const key of keys){
      const label=node('label',undefined,'compare-option'),input=document.createElement('input');
      input.type='checkbox';input.value=key;input.checked=checked.has(key);
      input.addEventListener('change',()=>{
        if(input.checked && checked.size>=8){input.checked=false;show('compare-status','Maximum eight histories per comparison.');return;}
        if(input.checked)checked.add(key);else checked.delete(key);
        show('compare-status',`${checked.size} selected; click Run comparison to recalculate.`);
      });
      label.append(input,node('span',key));host.append(label);
    }
    clearOutputs();
    show('compare-status',`${keys.length} price series available. Select 1–8 and run historical comparison. ${options.getProvenance()}`);
  }
  function run() {
    clearOutputs();
    const source=options.getSeries(),symbols=[...checked].sort();
    if(symbols.length<1){show('compare-status','Select at least one available price history.');return;}
    let result;
    try{result=compareHistorical(source,symbols,{start:$('compare-start').value,end:$('compare-end').value});}
    catch(error){show('compare-status',`Comparison rejected: ${error.message}`);return;}
    if(result.state!=='ALIGNED_HISTORY'){
      show('compare-status',result.state==='MISSING_SERIES'?`Missing price histories: ${result.missing.join(', ')}`:'Not enough dates shared by every selected series.');return;
    }
    draw($('compare-plot'),result);
    const legend=$('compare-legend');
    result.rows.forEach((row,i)=>{
      const entry=node('span',`${row.symbol} · ${pct(row.totalReturnPct)}`,'compare-legend-item');
      entry.style.borderLeftColor=COLORS[i];legend.append(entry);
    });
    const ranked=result.rows.slice().sort((a,b)=>b.totalReturnPct-a.totalReturnPct || a.symbol.localeCompare(b.symbol));
    table($('compare-ranking'),['Symbol','First','Last','Return','Common bars'],ranked.map(row=>[row.symbol,nf(row.first.price),nf(row.last.price),pct(row.totalReturnPct),String(result.commonDates.length)]));
    table($('compare-correlation'),['Symbol',...symbols],symbols.map((s,i)=>[s,...result.correlations[i].map(v=>v===null?'N/A':nf(v))]));
    const monthsBySymbol=new Map(result.rows.map(row=>[row.symbol,new Map(monthlyReturns(row.indexed.map(p=>({date:p.date,close:p.close}))).map(m=>[m.month,m.returnPct]))]));
    const months=[...new Set([...monthsBySymbol.values()].flatMap(map=>[...map.keys()]))].sort().slice(-18);
    table($('compare-monthly'),['Month',...symbols],months.map(month=>[month,...symbols.map(symbol=>monthsBySymbol.get(symbol).has(month)?pct(monthsBySymbol.get(symbol).get(month)):'N/A')]));
    const discarded=Object.values(result.diagnostics).reduce((sum,d)=>sum+d.discardedNonOverlapping,0);
    show('compare-status',`${result.commonDates.length} exact shared dates · ${discarded} nonoverlapping records excluded across series · ${result.commonDates.length-1} return intervals · ${options.getProvenance()} Historical only; no gap filling, forecast, or live quotes.`);
  }
  $('compare-run').addEventListener('click',run);
  $('compare-clear').addEventListener('click',()=>{checked.clear();refresh();});
  $('compare-watchlist').addEventListener('click',()=>{
    checked.clear();const available=new Set(Object.keys(options.getSeries()));
    for(const symbol of options.getWatchlist())if(available.has(symbol)&&checked.size<8)checked.add(symbol);
    refresh();
  });
  return {refresh,run};
}

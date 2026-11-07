import { buildMarketMatrix, MATRIX_METRICS, MATRIX_TIERS, metricValue, classifyMarketCap } from './matrix.mjs';
import { validateMapEmbed } from './map-embed.mjs';

const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text);
  if(cls)el.className=cls;
  return el;
};
const PAGE_SIZE=50;
const fmt=(n,unit)=>n===null?'N/A':Number(n).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2})+unit;

/** @param {{getStocks:()=>Array, isSample:()=>boolean, onSymbol?:(symbol:string)=>void}} dependencies */
export function initMatrix(dependencies) {
  if(!dependencies || typeof dependencies.getStocks!=='function' || typeof dependencies.isSample!=='function')throw new TypeError('Invalid Matrix integration');
  const host=$('matrix-body'),pager=$('matrix-page'),prev=$('matrix-previous'),next=$('matrix-next');
  let page=0,lastMetric='',lastSector='',model=null;
  const fields=['matrix-metric','matrix-sector','matrix-palette','matrix-search'];
  function renderDetails(cell,sector,industry) {
    const node=$('matrix-details');node.replaceChildren();
    node.append(make('h3',`${sector} / ${industry} / ${cell.label}`));
    const summary=make('p',`${cell.total} imported • ${cell.valid} measured • ${cell.missing} missing. Metric: ${MATRIX_METRICS[lastMetric].label}.`);
    node.append(summary);
    const table=make('div',undefined,'matrix-detail-list');
    let count=0;
    for(const item of dependencies.getStocks()) {
      if((item.sector||'Unclassified')!==sector ||
         (item.industry||'Unclassified industry')!==industry ||
         classifyMarketCap(item.marketCap)!==cell.tier)continue;
      const value=metricValue(item,lastMetric);
      const button=make('button',`${item.symbol} · ${value===null?'N/A':fmt(value,MATRIX_METRICS[lastMetric].unit)}`,'matrix-detail-symbol');
      button.type='button';
      if(typeof dependencies.onSymbol==='function')button.addEventListener('click',()=>dependencies.onSymbol(item.symbol));
      else button.disabled=true;
      table.append(button);
      if(++count===100)break;
    }
    node.append(table);
    if(cell.total>100)node.append(make('p',`Showing first 100 of ${cell.total} securities.`,'subtitle'));
  }
  function render() {
    const stocks=dependencies.getStocks();
    const metric=$('matrix-metric').value,sector=$('matrix-sector').value,palette=$('matrix-palette').value;
    const search=$('matrix-search').value.trim().toLowerCase().slice(0,90);
    lastMetric=metric;lastSector=sector;
    try {model=buildMarketMatrix(stocks,{metric,sector});}
    catch(error){host.replaceChildren();$('matrix-status').textContent='Matrix unavailable: '+error.message;return;}
    const rows=model.rows.filter(r=>!search||r.industry.toLowerCase().includes(search)||r.sector.toLowerCase().includes(search));
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    page=Math.max(0,Math.min(page,pages-1));
    const current=rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    host.replaceChildren();
    for(const row of current){
      const tr=make('tr');
      const heading=make('th',undefined,'mx-industry');
      heading.scope='row';
      heading.append(make('strong',row.industry),make('small',`${row.sector} · ${row.total} imported`));
      tr.append(heading);
      for(const cell of row.cells){
        const td=make('td',undefined,'mx-cell');
        if(!cell.total){td.append(make('span','—','mx-empty'));tr.append(td);continue;}
        const button=make('button',undefined,'mx-value');
        button.type='button';
        const label=cell.value===null?'N/A':fmt(cell.value,model.metricInfo.unit);
        button.append(make('strong',label),make('small',`${cell.valid}/${cell.total} measured`));
        button.setAttribute('aria-label',`${row.industry}, ${cell.label}: ${label}, ${cell.valid} of ${cell.total} values present`);
        button.title=`${cell.symbols.join(', ').slice(0,220)} • ${cell.missing} missing`;
        button.classList.add(cell.value===null?'mx-missing':model.metricInfo.kind==='neutral'?'mx-neutral':cell.value>0?'mx-positive':cell.value<0?'mx-negative':'mx-neutral');
        if(palette==='accessible')button.classList.add('mx-accessible');
        button.addEventListener('click',()=>renderDetails(cell,row.sector,row.industry));
        td.append(button);tr.append(td);
      }
      host.append(tr);
    }
    if(!rows.length){const tr=make('tr'),td=make('td','No matching industries in the imported dataset.','empty');td.colSpan=1+MATRIX_TIERS.length;tr.append(td);host.append(tr);}
    pager.textContent=rows.length?`Industries ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,rows.length)} of ${rows.length}`:'No industry rows';
    prev.disabled=page===0;next.disabled=page>=pages-1;
    $('matrix-status').textContent=`${model.stats.included} imported securities across ${model.stats.industries} industries • ${model.stats.measured} measured / ${model.stats.unavailable} missing ${model.metricInfo.label} values • ${model.stats.marketCapUnknown} unknown market caps • ${dependencies.isSample()?'FICTIONAL SAMPLE ONLY':'UNVERIFIED USER IMPORT'} • not a full-market dataset.`;
  }
  function refresh() {
    const select=$('matrix-sector'),selected=select.value;
    select.replaceChildren(new Option('All imported sectors','ALL'));
    const values=[...new Set(dependencies.getStocks().map(r=>r.sector||'Unclassified'))].sort();
    for(const value of values)select.add(new Option(value,value));
    select.value=values.includes(selected)?selected:'ALL';
    page=0;$('matrix-details').textContent='Select a populated cell to inspect its securities.';
    render();
  }
  for(const id of fields)$(id).addEventListener(id==='matrix-search'?'input':'change',()=>{page=0;render();});
  prev.addEventListener('click',()=>{if(page>0){page--;render();}});
  next.addEventListener('click',()=>{page++;render();});
  return {refresh,render};
}

export function initHostedMaps() {
  const host=$('map-embed-host'),status=$('map-embed-status');
  $('map-embed-load').addEventListener('click',()=>{
    host.replaceChildren();
    let src;
    try{src=validateMapEmbed($('map-embed-input').value);}
    catch(error){status.textContent='Rejected: '+error.message;return;}
    const frame=make('iframe');
    frame.title='Finviz-hosted market map (third-party external content)';
    frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.sandbox='allow-scripts allow-same-origin allow-popups';
    frame.src=src;
    frame.width='100%';frame.height='520';
    host.append(frame);
    const link=make('a','Open this map directly on Finviz ↗','map-external-link');
    link.href=src;link.target='_blank';link.rel='noopener noreferrer';
    host.append(link);
    status.textContent='An authorized Finviz-hosted map was requested. Rendering and data availability depend on Finviz and the browser. HELIX does not independently authenticate these prices.';
  });
  $('map-embed-clear').addEventListener('click',()=>{
    host.replaceChildren();$('map-embed-input').value='';
    status.textContent='Removed the hosted map. No content is loaded.';
  });
}

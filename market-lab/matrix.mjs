/**
 * Independent market-cap x industry Matrix for HELIX.
 * Only analyzes validated, user-imported records. Never requests market data.
 */
export const MATRIX_TIERS = Object.freeze([
  Object.freeze({id:'mega',label:'Mega',min:200_000_000_000}),
  Object.freeze({id:'large',label:'Large',min:10_000_000_000}),
  Object.freeze({id:'mid',label:'Mid',min:2_000_000_000}),
  Object.freeze({id:'small',label:'Small',min:300_000_000}),
  Object.freeze({id:'micro',label:'Micro',min:0}),
  Object.freeze({id:'unknown',label:'Unknown cap',min:null}),
]);
export const MATRIX_METRICS = Object.freeze({
  changePct: Object.freeze({label:'Reported change %',unit:'%',kind:'signed'}),
  drawdown52: Object.freeze({label:'Distance from 52-week high',unit:'%',kind:'signed'}),
  aboveLow52: Object.freeze({label:'Distance above 52-week low',unit:'%',kind:'signed'}),
  pe: Object.freeze({label:'Reported P/E',unit:'×',kind:'neutral'}),
  volume: Object.freeze({label:'Reported volume',unit:'shares',kind:'neutral'}),
});

const MAX_STOCKS=2_000, MAX_TEXT=120;
function cleanText(value,fallback) {
  return typeof value==='string' && value.trim()?value.trim().slice(0,MAX_TEXT):fallback;
}
export function classifyMarketCap(cap) {
  if (typeof cap!=='number' || !Number.isFinite(cap) || cap<=0) return 'unknown';
  for (const tier of MATRIX_TIERS) if (tier.min!==null && cap>=tier.min)return tier.id;
  return 'unknown';
}
export function metricValue(row,metric) {
  if (!Object.hasOwn(MATRIX_METRICS,metric))throw new RangeError('Unsupported Matrix metric');
  const finite=value=>typeof value==='number' && Number.isFinite(value)?value:null;
  if(metric==='changePct'||metric==='pe'||metric==='volume')return finite(row[metric]);
  const price=finite(row.price),anchor=finite(metric==='drawdown52'?row.high52:row.low52);
  if(price===null||price<=0||anchor===null||anchor<=0)return null;
  const output=100*(price/anchor-1);
  return Number.isFinite(output)?output:null;
}
export function median(items) {
  if(!Array.isArray(items)||!items.length)return null;
  if(items.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new TypeError('Invalid metric values');
  const sorted=items.slice().sort((a,b)=>a-b);
  const m=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[m]:sorted[m-1]/2+sorted[m]/2;
}
/**
 * Matrix rows are industry + sector, preventing identical industry names from
 * collapsing across separate sectors. Cell values are medians, not invented
 * cap-weighted returns. Missing market caps occupy an explicit unknown tier.
 */
export function buildMarketMatrix(stocks,{metric='changePct',sector='ALL'}={}) {
  if(!Array.isArray(stocks)||stocks.length>MAX_STOCKS)throw new RangeError('Maximum 2,000 stock rows');
  if(!Object.hasOwn(MATRIX_METRICS,metric))throw new RangeError('Unsupported Matrix metric');
  if(typeof sector!=='string'||sector.length>120)throw new TypeError('Invalid sector');
  const groups=new Map();
  let included=0, unavailable=0;
  for(const item of stocks){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.symbol!=='string'||!/^[A-Z0-9.^\/_-]{1,20}$/.test(item.symbol))throw new TypeError('Matrix requires normalized stock records');
    const sectorName=cleanText(item.sector,'Unclassified');
    if(sector!=='ALL'&&sector!==sectorName)continue;
    const industry=cleanText(item.industry,'Unclassified industry');
    const key=JSON.stringify([sectorName,industry]),tier=classifyMarketCap(item.marketCap);
    if(!groups.has(key))groups.set(key,{key,sector:sectorName,industry,cells:new Map()});
    const row=groups.get(key),measure=metricValue(item,metric);
    if(!row.cells.has(tier))row.cells.set(tier,[]);
    row.cells.get(tier).push({symbol:item.symbol,value:measure,marketCap:item.marketCap??null});
    included++;if(measure===null)unavailable++;
  }
  const rows=[...groups.values()].map(group=>{
    const cells=MATRIX_TIERS.map(tier=>{
      const entries=group.cells.get(tier.id)??[];
      const values=entries.map(r=>r.value).filter(v=>v!==null);
      return {
        tier:tier.id,label:tier.label,
        total:entries.length,valid:values.length,missing:entries.length-values.length,
        value:median(values),symbols:entries.map(e=>e.symbol).sort(),
        positive:values.filter(v=>v>0).length,negative:values.filter(v=>v<0).length,zero:values.filter(v=>v===0).length,
      };
    });
    return {key:group.key,sector:group.sector,industry:group.industry,total:cells.reduce((n,c)=>n+c.total,0),cells};
  }).sort((a,b)=>a.sector.localeCompare(b.sector)||a.industry.localeCompare(b.industry));
  const sectors=[...new Set(rows.map(r=>r.sector))].sort();
  return {
    metric,metricInfo:MATRIX_METRICS[metric],rows,sectors,
    stats:{included,unavailable,measured:included-unavailable,industries:rows.length,
      marketCapUnknown:rows.reduce((n,r)=>n+(r.cells.find(c=>c.tier==='unknown')?.total??0),0)},
    provenance:'USER_IMPORTED_UNVERIFIED',coverage:'IMPORTED_RECORDS_ONLY',
  };
}

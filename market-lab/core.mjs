/**
 * HELIX Market Lab data boundary.
 * Pure, dependency-free validation: no network, credentials, scraping, or execution.
 */
export const LIMITS = Object.freeze({ bytes: 2_000_000, rows: 2_000, candles: 5_000 });
const COLUMNS = Object.freeze(['symbol','name','sector','industry','price','changePct','volume','marketCap','pe','low52','high52']);
const NUMBERS = Object.freeze(['price','changePct','volume','marketCap','pe','low52','high52']);
const SYMBOL = /^[A-Z0-9.^/_-]{1,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function bounded(text, max = LIMITS.bytes) {
  if (typeof text !== 'string') throw new TypeError('Expected UTF-8 text');
  if (new TextEncoder().encode(text).length > max) throw new RangeError('Import exceeds 2 MB limit');
  return text.replace(/^\uFEFF/, '');
}

function parseDelimited(text) {
  const raw = bounded(text);
  let records = [], row = [], field = '', quoted = false, atFieldStart = true;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && atFieldStart) { quoted = true; atFieldStart = false; }
    else if (c === ',') { row.push(field); field = ''; atFieldStart = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && raw[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(item => item.trim())) records.push(row);
      row = []; field = ''; atFieldStart = true;
      if (records.length > LIMITS.candles + 1) throw new RangeError('Import contains too many rows');
    } else if (c === '"') throw new SyntaxError('Unexpected quote in CSV field');
    else { field += c; atFieldStart = false; }
  }
  if (quoted) throw new SyntaxError('Unclosed CSV quote');
  row.push(field);
  if (row.some(item => item.trim())) records.push(row);
  if (!records.length) return [];
  const headers = records.shift().map(x => x.trim());
  if (new Set(headers).size !== headers.length) throw new SyntaxError('Duplicate CSV column name');
  return records.map((cells, index) => {
    if (cells.length !== headers.length) throw new SyntaxError(`CSV row ${index + 2}: column count mismatch`);
    return Object.fromEntries(headers.map((key, i) => [key, cells[i].trim()]));
  });
}

export function parseTabular(text) {
  const raw = bounded(text).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    let value;
    try { value = JSON.parse(raw); } catch { throw new SyntaxError('Invalid JSON array'); }
    if (!Array.isArray(value)) throw new TypeError('Import JSON must be an array');
    return value;
  }
  return parseDelimited(raw);
}

function numeric(value, { positive = false, zero = true } = {}) {
  if (value == null || value === '') return null;
  if (!['number','string'].includes(typeof value)) return NaN;
  const n = Number(value);
  if (!Number.isFinite(n) || (positive && (zero ? n < 0 : n <= 0))) return NaN;
  return n;
}

export function normalizeStocks(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Stocks must be an array');
  if (entries.length > LIMITS.rows) throw new RangeError('Maximum 2,000 securities per import');
  const seen = new Set(), rows = [], errors = [];
  entries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push({ row:idx+1, reason:'INVALID_RECORD' }); return; }
    const symbol = String(entry.symbol ?? '').trim().toUpperCase();
    if (!SYMBOL.test(symbol)) { errors.push({ row:idx+1, reason:'INVALID_SYMBOL' }); return; }
    if (seen.has(symbol)) { errors.push({ row:idx+1, reason:'DUPLICATE_SYMBOL' }); return; }
    const values = {};
    for (const key of NUMBERS) {
      const n = numeric(entry[key], { positive:key !== 'changePct' && key !== 'pe', zero:key !== 'price' });
      if (Number.isNaN(n)) { errors.push({ row:idx+1, reason:`INVALID_${key.toUpperCase()}` }); return; }
      values[key] = n;
    }
    if (values.low52 !== null && values.high52 !== null && values.low52 > values.high52) {
      errors.push({ row:idx+1, reason:'INVALID_52_WEEK_RANGE' }); return;
    }
    seen.add(symbol);
    rows.push({
      symbol, name:String(entry.name ?? '').slice(0,100), sector:String(entry.sector ?? 'Unclassified').slice(0,50) || 'Unclassified',
      industry:String(entry.industry ?? '').slice(0,80), ...values,
    });
  });
  return { rows, errors, source:'USER_IMPORTED_UNVERIFIED' };
}

export function screenStocks(rows, opts = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Rows must be an array');
  const query = String(opts.search ?? '').trim().toLowerCase().slice(0,90);
  const sector = String(opts.sector ?? 'ALL');
  const minCap = numeric(opts.minMarketCap);
  const minVolume = numeric(opts.minVolume);
  const minChange = numeric(opts.minChangePct);
  if ([minCap,minVolume,minChange].some(Number.isNaN)) throw new RangeError('Invalid filter');
  const sort = ['symbol','price','changePct','marketCap','volume','pe'].includes(opts.sort) ? opts.sort : 'symbol';
  const descending = opts.descending === true;
  return rows.filter(r =>
    (!query || r.symbol.toLowerCase().includes(query) || r.name.toLowerCase().includes(query)) &&
    (sector === 'ALL' || r.sector === sector) &&
    (minCap === null || (r.marketCap !== null && r.marketCap >= minCap)) &&
    (minVolume === null || (r.volume !== null && r.volume >= minVolume)) &&
    (minChange === null || (r.changePct !== null && r.changePct >= minChange))
  ).sort((a,b) => {
    const av=a[sort], bv=b[sort];
    if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return (descending ? -cmp : cmp) || a.symbol.localeCompare(b.symbol);
  });
}

export function groupHeatmap(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.sector)) groups.set(row.sector, []);
    groups.get(row.sector).push(row);
  }
  return [...groups.entries()].map(([sector, entries]) => ({
    sector,
    entries:entries.slice().sort((a,b)=>(b.marketCap??-1)-(a.marketCap??-1) || a.symbol.localeCompare(b.symbol)),
    size:entries.reduce((sum,r)=>sum+(r.marketCap??1),0),
  })).sort((a,b)=>b.size-a.size || a.sector.localeCompare(b.sector));
}

function validDate(s) { return typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10) === s; }

export function normalizeCandles(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Candles must be an array');
  if (rows.length > LIMITS.candles) throw new RangeError('Maximum 5,000 candles');
  const result = [], seen = new Set();
  for (const [i,r] of rows.entries()) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || !validDate(r.date)) throw new TypeError(`Invalid candle date at row ${i+1}`);
    if (seen.has(r.date)) throw new TypeError(`Duplicate candle date: ${r.date}`);
    seen.add(r.date);
    const o = numeric(r.open,{positive:true,zero:false}), h=numeric(r.high,{positive:true,zero:false}),
      l=numeric(r.low,{positive:true,zero:false}), c=numeric(r.close,{positive:true,zero:false}),
      v=numeric(r.volume,{positive:true});
    if ([o,h,l,c].some(x=>x==null || !Number.isFinite(x)) || Number.isNaN(v) || h<Math.max(o,c) || l>Math.min(o,c) || l>h) {
      throw new TypeError(`Invalid OHLC values at row ${i+1}`);
    }
    result.push({date:r.date,open:o,high:h,low:l,close:c,volume:v});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}

export function normalizeDailyCloses(points) {
  if (!Array.isArray(points) || points.length > LIMITS.candles) throw new TypeError('Invalid daily-close series');
  const seen = new Set();
  return points.map((p,i) => {
    if (!p || !validDate(p.x)) throw new TypeError(`Invalid daily close date at row ${i+1}`);
    const close = numeric(p.y,{positive:true,zero:false});
    if (close === null || Number.isNaN(close) || seen.has(p.x)) throw new TypeError('Invalid or duplicate daily close');
    seen.add(p.x);
    return { date:p.x, close };
  }).sort((a,b)=>a.date.localeCompare(b.date));
}

export function sma(values, period) {
  if (!Number.isInteger(period) || period <= 0) throw new RangeError('Period must be a positive integer');
  const result=[]; let sum=0;
  values.forEach((v,i)=>{
    if (!Number.isFinite(v)) throw new TypeError('Non-finite series value');
    sum+=v; if(i>=period)sum-=values[i-period]; result.push(i>=period-1?sum/period:null);
  });
  return result;
}

export function rsi(values, period=14) {
  if (!Number.isInteger(period) || period<2) throw new RangeError('RSI period must be >= 2');
  if (values.some(v=>!Number.isFinite(v))) throw new TypeError('Non-finite series value');
  const out=values.map(()=>null);
  if(values.length<=period)return out;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const delta=values[i]-values[i-1];gain+=Math.max(0,delta);loss+=Math.max(0,-delta);}
  gain/=period;loss/=period;
  const score=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  out[period]=score();
  for(let i=period+1;i<values.length;i++){const delta=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(0,delta))/period;loss=(loss*(period-1)+Math.max(0,-delta))/period;out[i]=score();}
  return out;
}

export function assessSnapshot(meta, nowMs=Date.now()) {
  if (!meta || meta.verified !== true || meta.seed === true) return { state:'UNVERIFIED', detail:'Snapshot is not marked verified' };
  const stamp=Date.parse(meta.generatedAt ?? '');
  if (!Number.isFinite(stamp)) return { state:'UNKNOWN_TIME', detail:'Missing or invalid generation timestamp' };
  if (!Number.isFinite(nowMs) || stamp > nowMs + 60_000) return { state:'INVALID_TIME', detail:'Timestamp is in the future or device clock is invalid' };
  const maxHours=Number.isFinite(meta.staleAfterHours) && meta.staleAfterHours>0 ? Math.min(meta.staleAfterHours,72) : 30;
  if ((nowMs-stamp)/3_600_000 > maxHours) return { state:'STALE', detail:'Verified snapshot is too old' };
  return { state:'DAILY_CLOSE', detail:'Verified historical daily-close snapshot, NOT live ticks' };
}

export function exportCsv(rows, keys=COLUMNS) {
  const escape = v => {
    const text = v == null ? '' : String(v);
    // Guard spreadsheet formula interpretation when exported CSV is opened.
    const safe=/^[\s]*[=+@-]/.test(text) && typeof v !== 'number' ? "'"+text : text;
    return /[",\n\r]/.test(safe) ? '"'+safe.replaceAll('"','""')+'"' : safe;
  };
  return [keys.join(','),...rows.map(r=>keys.map(key=>escape(r[key])).join(','))].join('\r\n')+'\r\n';
}

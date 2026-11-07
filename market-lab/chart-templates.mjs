import { LIMITS, normalizeCandles } from './core.mjs';

/** Reusable, bounded, browser-safe settings. These are research visualizations only. */
export const CHART_PRESETS = Object.freeze({
  calm: Object.freeze({ label:'Calm / low-noise', mode:'line', bars:90, sma:true, rsi:false, palette:'calm' }),
  compact: Object.freeze({ label:'Compact technical', mode:'candles', bars:60, sma:true, rsi:true, palette:'classic' }),
  accessible: Object.freeze({ label:'High-contrast', mode:'line', bars:120, sma:true, rsi:true, palette:'contrast' }),
  minimal: Object.freeze({ label:'Minimal reference', mode:'line', bars:30, sma:false, rsi:false, palette:'mono' }),
});
const MODES=new Set(['line','candles']);
const PALETTES=new Set(['calm','classic','contrast','mono']);

export function validateChartTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid chart template');
  if (!MODES.has(input.mode)) throw new TypeError('Unknown chart mode');
  if (!PALETTES.has(input.palette)) throw new TypeError('Unknown palette');
  if (typeof input.sma !== 'boolean' || typeof input.rsi !== 'boolean') throw new TypeError('Indicator flags must be boolean');
  const bars=Number(input.bars);
  if (!Number.isInteger(bars) || bars<5 || bars>500) throw new RangeError('Chart bar count must be 5–500');
  return Object.freeze({ mode:input.mode, bars, sma:input.sma, rsi:input.rsi, palette:input.palette });
}
export function getTemplate(name, saved={}) {
  if (Object.hasOwn(CHART_PRESETS,name)) return validateChartTemplate(CHART_PRESETS[name]);
  if (Object.hasOwn(saved,name)) return validateChartTemplate(saved[name]);
  throw new RangeError('Unknown chart template');
}

export function normalizeSymbolCandles(records) {
  if (!Array.isArray(records)) throw new TypeError('Expected OHLC record array');
  if (records.length>LIMITS.candles) throw new RangeError('Maximum 5,000 candles');
  const hasNames=records.some(record=>record&&typeof record==='object'&&record.symbol!=null&&record.symbol!=='');
  const groups=new Map();
  for (const [i,record] of records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError(`Invalid OHLC record ${i+1}`);
    if (hasNames && (record.symbol==null || record.symbol==='')) throw new TypeError('Every candle must contain a symbol when grouping by symbol');
    const ticker=hasNames?String(record.symbol).trim().toUpperCase():'IMPORTED';
    if (!/^[A-Z0-9.^/_-]{1,20}$/.test(ticker)) throw new TypeError(`Invalid OHLC ticker at row ${i+1}`);
    if(!groups.has(ticker))groups.set(ticker,[]);
    groups.get(ticker).push(record);
  }
  if(groups.size>200)throw new RangeError('Maximum 200 distinct OHLC symbols');
  // Validate *each* symbol independently so duplicate dates across symbols are fine.
  const entries=[...groups].map(([symbol,rows])=>[symbol,normalizeCandles(rows)]);
  return Object.fromEntries(entries);
}

export function availableScreenCharts(rows,bySymbol,{max=24}={}) {
  if (!Array.isArray(rows) || !bySymbol || typeof bySymbol!=='object') throw new TypeError('Expected screen and OHLC map');
  if (!Number.isInteger(max)||max<1||max>50)throw new RangeError('Invalid chart collection size');
  return rows.slice(0,max).map(stock=>({
    symbol:stock.symbol,
    candles:Array.isArray(bySymbol[stock.symbol])?bySymbol[stock.symbol]:[],
    state:Array.isArray(bySymbol[stock.symbol])&&bySymbol[stock.symbol].length?'AVAILABLE':'NO_MATCHING_OHLC',
  }));
}

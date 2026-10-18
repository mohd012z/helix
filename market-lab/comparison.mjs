/**
 * HELIX Market Lab: data-only, read-only historical price comparison.
 * Does not fetch prices, interpolate gaps, forecast, or place orders.
 */

const SYMBOL = /^[A-Z0-9.^/_-]{1,20}$/;
const MAX_SYMBOLS = 8;
const MAX_CANDLES = 5000;
const MAX_INPUT_SERIES = 201;
const MAX_MONTHS = 240;
const ROUND = value => Math.round(value * 1e8) / 1e8;

function checkSymbol(value) {
  if (typeof value !== 'string' || !SYMBOL.test(value)) throw new TypeError('Invalid comparison symbol');
  return value;
}
function checkDay(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) throw new TypeError('Invalid date range');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new TypeError('Invalid date range');
  return value;
}
function normalizePriceSeries(records) {
  if (!Array.isArray(records) || records.length > MAX_CANDLES) throw new TypeError('Invalid price series or over 5,000 bars');
  const seen = new Set();
  return records.map((p, i) => {
    const date = checkDay(p?.date);
    const close = p?.close;
    if (!date || typeof close !== 'number' || !Number.isFinite(close) || close <= 0 || seen.has(date)) {
      throw new TypeError(`Invalid or duplicate daily close at row ${i + 1}`);
    }
    seen.add(date);
    return { date, close };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
function pct(from, to) {
  const ratio = to / from, change = (ratio - 1) * 100;
  if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(change)) throw new RangeError('Price ratio exceeds safe numeric range');
  return ROUND(change);
}
function previousMonth(key) {
  const year = Number(key.slice(0, 4)), month = Number(key.slice(5));
  return month === 1 ? String(year - 1).padStart(4, '0') + '-12' : String(year).padStart(4, '0') + '-' + String(month - 1).padStart(2, '0');
}

/**
 * Month-end close comparisons (previous observed month must be the immediately prior calendar month).
 * Missing months are explicitly omitted, not filled forward with invented values.
 */
export function monthlyReturns(series) {
  if (!Array.isArray(series) || series.length > MAX_CANDLES) throw new TypeError('Invalid price series');
  const points = normalizePriceSeries(series);
  const months = new Map();
  for (const item of points) months.set(item.date.slice(0, 7), item.close);
  if (months.size > MAX_MONTHS) throw new RangeError('Too many months');
  const results = [];
  for (const [month, close] of months) {
    const previous = months.get(previousMonth(month));
    if (previous != null) results.push({ month, returnPct: pct(previous, close) });
  }
  return results;
}

/** Pearson correlation of log price relatives, using only dates common to all selected series. */
export function correlation(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) throw new TypeError('Unequal return sequences');
  if (left.some(v => !Number.isFinite(v)) || right.some(v => !Number.isFinite(v))) throw new TypeError('Non-finite return sequence');
  if (left.length < 3) return null;
  const n = left.length, meanA = left.reduce((a, b) => a + b, 0) / n, meanB = right.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const a = left[i] - meanA, b = right[i] - meanB;
    cov += a * b; varA += a * a; varB += b * b;
  }
  if (varA < 1e-22 || varB < 1e-22) return null;
  return Math.max(-1, Math.min(1, ROUND(cov / Math.sqrt(varA * varB))));
}

/**
 * @param {Record<string, Array<{date:string,close:number}>>} bySymbol
 * @param {string[]} selected one to eight tickers, optionally XAU/USD
 * @returns {{state:string, ...}} aligned observations and transparent availability diagnostics
 */
export function compareHistorical(bySymbol, selected, { start = null, end = null } = {}) {
  if (!bySymbol || typeof bySymbol !== 'object' || Array.isArray(bySymbol)) throw new TypeError('Expected historical price map');
  if (Object.keys(bySymbol).length > MAX_INPUT_SERIES) throw new RangeError('Too many imported price series');
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > MAX_SYMBOLS) throw new RangeError('Select 1–8 symbols');
  const symbols = selected.map(checkSymbol);
  if (new Set(symbols).size !== symbols.length) throw new TypeError('Duplicate selected symbols');
  const first = checkDay(start), last = checkDay(end);
  if (first && last && first > last) throw new RangeError('Start date must not exceed end date');
  const missing = symbols.filter(symbol => !Object.hasOwn(bySymbol, symbol) || !Array.isArray(bySymbol[symbol]) || bySymbol[symbol].length === 0);
  if (missing.length) return { state: 'MISSING_SERIES', selected: symbols, missing, commonDates: [], rows: [], correlations: [], diagnostics: {} };
  const maps = new Map();
  for (const symbol of symbols) {
    const records = bySymbol[symbol];
    if (records.length > MAX_CANDLES) throw new RangeError('Maximum 5,000 bars per series');
    const normalized = normalizePriceSeries(records);
    const filtered = normalized.filter(p => (!first || p.date >= first) && (!last || p.date <= last));
    maps.set(symbol, new Map(filtered.map(p => [p.date, p.close])));
  }
  const dateSets = [...maps.values()].map(map => new Set(map.keys()));
  const commonDates = [...dateSets[0]].filter(date => dateSets.every(set => set.has(date))).sort();
  const diagnostics = Object.fromEntries(symbols.map(symbol => [symbol, {
    availablePoints: maps.get(symbol).size,
    commonPoints: commonDates.length,
    discardedNonOverlapping: maps.get(symbol).size - commonDates.length,
  }]));
  if (commonDates.length < 2) return { state: 'INSUFFICIENT_OVERLAP', selected: symbols, missing: [], commonDates, rows: [], correlations: [], diagnostics };
  const rows = symbols.map(symbol => {
    const prices = commonDates.map(date => maps.get(symbol).get(date));
    const base = prices[0];
    const indexed = commonDates.map((date, i) => {
      const rebased = (prices[i] / base) * 100;
      if (!Number.isFinite(rebased) || rebased <= 0) throw new RangeError('Unsafe rebased price');
      return { date, index: ROUND(rebased), close: prices[i] };
    });
    const returns = prices.slice(1).map((p, i) => {
      const ratio = p / prices[i];
      if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError('Unsafe return interval');
      return Math.log(ratio);
    });
    return {
      symbol, indexed, logReturns: returns,
      first: { date: commonDates[0], price: prices[0] },
      last: { date: commonDates.at(-1), price: prices.at(-1) },
      totalReturnPct: pct(prices[0], prices.at(-1)),
    };
  });
  const correlations = rows.map(a => rows.map(b => correlation(a.logReturns, b.logReturns)));
  return { state: 'ALIGNED_HISTORY', selected: symbols, missing: [], commonDates, rows, correlations, diagnostics, methodology: 'Same-date index=100 at earliest common observation; correlations use aligned log returns; no interpolation or forecasts.' };
}

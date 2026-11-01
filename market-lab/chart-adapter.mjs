/**
 * Read-only TradingView Lightweight Charts v5 adapter for HELIX Market Lab.
 *
 * User-imported OHLC remains UNVERIFIED; official HELIX XAU observations remain
 * historical daily closes. This module never fetches or manufactures prices.
 *
 * The standalone TradingView dependency is optional. The caller must load it
 * explicitly and retain its existing SVG fallback when this function returns false.
 */
import { sma, rsi } from './core.mjs';

const active = new WeakMap();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PALETTES = Object.freeze({
  calm:     {line:'#6ce0d3',up:'#4edaac',down:'#fd718e',sma5:'#e9be79',sma20:'#6ea8ff'},
  classic:  {line:'#f2ae55',up:'#32c18e',down:'#ed5577',sma5:'#e9be79',sma20:'#9c8aff'},
  contrast: {line:'#fbdf5a',up:'#3de4fb',down:'#ff8b49',sma5:'#ffffff',sma20:'#ff60ee'},
  mono:     {line:'#dddddd',up:'#ffffff',down:'#878787',sma5:'#aaaaaa',sma20:'#707070'},
});

/** Fail-closed conversion of validated HELIX {date,...} into v5 {time,...}. */
export function normalizeChartRows(rows, mode = 'line') {
  if (!Array.isArray(rows) || rows.length > 5_000) throw new TypeError('Invalid chart series length');
  if (mode !== 'line' && mode !== 'candles') throw new TypeError('Unsupported chart mode');
  let previous = '';
  return rows.map((item, i) => {
    if (!item || typeof item !== 'object' || typeof item.date !== 'string' || !DAY.test(item.date)) {
      throw new TypeError('Invalid ISO date at chart row ' + (i + 1));
    }
    const parsed = new Date(item.date + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== item.date || item.date <= previous) {
      throw new TypeError('Chart dates must be valid, sorted and unique');
    }
    previous = item.date;
    if (typeof item.close !== 'number' || !Number.isFinite(item.close) || item.close <= 0) {
      throw new TypeError('Invalid close at chart row ' + (i + 1));
    }
    if (mode === 'line') return {time:item.date, value:item.close};
    const {open,high,low,close} = item;
    if (![open,high,low].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0) ||
        low > high || high < Math.max(open, close) || low > Math.min(open, close)) {
      throw new TypeError('Genuine, valid OHLC is required');
    }
    return {time:item.date, open,high,low,close};
  });
}

/** Destroy a previously displayed canvas before DOM removal or series replacement. */
export function releaseChart(host) {
  const instance = active.get(host);
  if (!instance) return;
  active.delete(host);
  instance.remove();
}

/** Release all charts beneath an element before replaceChildren(). */
export function releaseChartsWithin(root) {
  if (!root) return;
  releaseChart(root);
  if (typeof root.querySelectorAll === 'function') {
    for (const node of root.querySelectorAll('.chart')) releaseChart(node);
  }
}

/**
 * Returns true only if a genuine v5 chart successfully rendered.
 * Throws no charting-provider errors into the existing HELIX UI.
 */
export function renderLightweightChart(host, rows, options = {}, library = globalThis.LightweightCharts) {
  if (!host || !library || typeof library.createChart !== 'function' ||
      !library.LineSeries || !library.CandlestickSeries) return false;
  const mode = options.mode === 'candles' ? 'candles' : 'line';
  const count = Math.max(5, Math.min(500, Number.isInteger(options.bars) ? options.bars : 90));
  if (!Array.isArray(rows) || rows.length === 0) return false;

  let points;
  try { points = normalizeChartRows(rows.slice(-count), mode); }
  catch { return false; }

  const theme = PALETTES[options.palette] ?? PALETTES.calm;
  let chart;
  releaseChart(host);
  try {
    const stage = document.createElement('div');
    stage.className = 'lwc-chart-stage';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', String(options.title ?? 'Historical price chart'));
    host.replaceChildren(stage);
    const light = document.documentElement.classList.contains('light');
    const autoSize = typeof globalThis.ResizeObserver === 'function';
    chart = library.createChart(stage, {
      autoSize,
      width:Math.max(host.clientWidth || 300, 300),
      height:260,
      layout:{
        attributionLogo:true,
        background:{type:'solid',color:light?'#ffffff':'#111c2a'},
        textColor:light?'#142334':'#c7d4e6',
      },
      grid:{
        vertLines:{color:light?'#e9f0f5':'#203047'},
        horzLines:{color:light?'#e9f0f5':'#203047'},
      },
      timeScale:{timeVisible:false,borderVisible:false},
      rightPriceScale:{borderVisible:false},
      crosshair:{mode:1},
    });
    const series = chart.addSeries(
      mode === 'candles' ? library.CandlestickSeries : library.LineSeries,
      mode === 'candles'
        ? {upColor:theme.up,downColor:theme.down,borderUpColor:theme.up,borderDownColor:theme.down,
           wickUpColor:theme.up,wickDownColor:theme.down}
        : {color:theme.line,lineWidth:2}
    );
    series.setData(points);

    // Build indicators from the full validated lookback, not only visible bars.
    if (options.sma === true) {
      const closes = rows.map(r => r.close);
      for (const [period,color] of [[5,theme.sma5],[20,theme.sma20]]) {
        const values = sma(closes, period);
        const start = rows.length - points.length;
        const lineData = [];
        for (let i = start; i < rows.length; i++) {
          if (values[i] != null && Number.isFinite(values[i])) {
            lineData.push({time:rows[i].date,value:values[i]});
          }
        }
        if (lineData.length) {
          const overlay = chart.addSeries(library.LineSeries, {color,lineWidth:1,lastValueVisible:false,
            priceLineVisible:false,crosshairMarkerVisible:false});
          overlay.setData(lineData);
        }
      }
    }

    // Volume values are never synthesized for close-only reference datasets.
    if (mode === 'candles' && library.HistogramSeries) {
      const volumePoints = rows.slice(-count).filter(r => typeof r.volume === 'number' &&
        Number.isFinite(r.volume) && r.volume >= 0)
        .map(r => ({time:r.date,value:r.volume,color:r.close >= r.open ? theme.up : theme.down}));
      if (volumePoints.length) {
        const volume = chart.addSeries(library.HistogramSeries, {priceFormat:{type:'volume'},
          priceScaleId:'volume',lastValueVisible:false,priceLineVisible:false});
        volume.priceScale().applyOptions({scaleMargins:{top:0.78,bottom:0},visible:false});
        volume.setData(volumePoints);
      }
    }
    chart.timeScale().fitContent();

    if (options.showRsi === true) {
      const readout = document.createElement('div');
      readout.className = 'chart-tooltip';
      const last = rsi(rows.map(r => r.close)).at(-1);
      readout.textContent = 'RSI(14): ' + (last == null ? 'insufficient history' : last.toFixed(1)) +
        ' · Historical indicator only';
      host.appendChild(readout);
    }
    active.set(host, chart);
    return true;
  } catch {
    if (chart) chart.remove();
    host.replaceChildren();
    return false;
  }
}

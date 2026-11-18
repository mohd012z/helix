/* IFX news data source for the news_ifxhelperbot UI menu.
 *
 * The 24/7 News_ifxhelper poller (host: /opt/data/ifx-live, one-way Telegram
 * sends + [skip ci] commits) keeps News_ifxhelper@main current with:
 *   - news-auto.js     (ForexFactory this-week calendar + classified news/speakers)
 *   - atr.js / atr-mtf.js (ATR context)
 *   - macro-auto.js    (DXY / US 10Y / Brent)
 *
 * This source reads those files directly (no network) so the interactive menu
 * answers instantly with the SAME data the auto-push uses. Falls back to a
 * remote raw.githubusercontent.com fetch when the local files are missing
 * (e.g. the poller is deployed somewhere other than this host).
 *
 * Pure + fail-closed: every reader returns {ok:false,...} on bad input; the
 * view renders an honest "no data" line rather than fabricating numbers.
 */
import fs from 'node:fs';

const LOCAL_DIR = process.env.IFX_DATA_DIR ?? '/opt/data/ifx-live/repo';
const REMOTE_BASE = 'https://raw.githubusercontent.com/mohd012z/News_ifxhelper/main/';
const MYT_OFFSET_MS = 8 * 3600 * 1000; // MYT = UTC+8, fixed, no DST

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/* Parse an FF timeMyt string ("Tue, 2026-11-03 12:30" = MYT) to a UTC Date.
 * Mirrors the logic in News_ifxhelper telegram-notify.js so upcoming counts
 * match the auto-push exactly. Returns null when unparseable (never throws). */
export function parseMytToUtc(timeMyt, now = Date.now()) {
  if (!timeMyt) return null;
  let m = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{1,2}):(\d{2})/.exec(timeMyt);
  let day, month, hour, min;
  if (m) { day = +m[1]; month = MONTHS[m[2]]; hour = +m[3]; min = +m[4]; }
  else {
    m = /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(timeMyt);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]));
  }
  if (month == null) return null;
  const year = new Date(now).getUTCFullYear();
  let d = new Date(Date.UTC(year, month, day, hour - 8, min));
  if (d.getTime() < now - 200 * 86400000) d = new Date(Date.UTC(year + 1, month, day, hour - 8, min));
  return d;
}

/* "in 3h 12m" / "in 42m" / "past" style countdown, MYT-relative, honest. */
export function countdownLabel(eventAt, now = Date.now()) {
  if (!eventAt) return '—';
  const mins = Math.round((eventAt.getTime() - now) / 60000);
  if (mins < 0) return `past (${Math.abs(mins)}m ago)`;
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60), mm = mins % 60;
  if (h < 48) return `in ${h}h${mm ? ' ' + mm + 'm' : ''}`;
  return `in ${Math.round(h / 24)}d`;
}

function readWindowJs(file, globalName) {
  const win = {};
  const code = fs.readFileSync(file, 'utf8');
  new Function('window', code)(win);
  return win[globalName] ?? null;
}

async function fetchText(url, { timeoutMs = 8000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function parseInlineWindowJs(text, globalName) {
  const marker = 'window.' + globalName + ' = ';
  const i = text.indexOf(marker);
  if (i < 0) throw new Error('marker missing: ' + globalName);
  let j = i + marker.length;
  // consume the balanced JSON object that follows
  const start = text.indexOf('{', j);
  if (start < 0) throw new Error('no object start');
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < text.length; k += 1) {
    const c = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return JSON.parse(text.slice(start, k + 1)); }
  }
  throw new Error('unbalanced object');
}

async function loadObject(globalName, file, { timeoutMs = 8000 } = {}) {
  // 1) local (primary — the ifx poller keeps these current)
  try {
    const local = readWindowJs(file, globalName);
    if (local) return Object.freeze({ ok: true, source: 'local:' + file, data: local });
  } catch { /* fall through to remote */ }
  // 2) remote raw main (fallback for hosts without the local clone)
  const fileName = file.split('/').pop();
  try {
    const text = await fetchText(REMOTE_BASE + fileName, { timeoutMs });
    return Object.freeze({ ok: true, source: 'remote:' + fileName, data: parseInlineWindowJs(text, globalName) });
  } catch (e) {
    return Object.freeze({ ok: false, source: 'none', error: e?.message ?? String(e) });
  }
}

/* The full menu data bundle. Each section is independently fail-closed. */
export async function loadIfxMenuData({ now = Date.now(), files = {} } = {}) {
  const dir = files.dir ?? LOCAL_DIR;
  const newsAuto = await loadObject('NEWS_AUTO', (files.newsAuto ?? (dir + '/news-auto.js')));
  const atr = await loadObject('ATR_DATA', (files.atr ?? (dir + '/atr.js')));
  const atrMtf = await loadObject('ATR_MTF', (files.atrMtf ?? (dir + '/atr-mtf.js')));
  const macro = await loadObject('MACRO_AUTO', (files.macro ?? (dir + '/macro-auto.js')));
  const pivots = await loadObject('PIVOTS_AUTO', (files.pivots ?? (dir + '/pivots.js')));
  return Object.freeze({ now, newsAuto, atr, atrMtf, macro, pivots });
}

/* Upcoming events across ALL impact tiers (low→high), soonest first.
 * Source: the live calendar heartbeat (refresh-calendar-snapshot.js every
 * 5 min -> news-auto.js) — calendarAll includes the low-impact rows that
 * `incoming` filters out. Fails closed to `incoming` (high+med) when
 * calendarAll is absent, and skips past rows + non-tradeable 'holiday'
 * rows. Anam: "news event must realtime update from low-high impact". */
export function selectUpcomingEvents(newsAuto, { now = Date.now(), limit = 14 } = {}) {
  const src = Array.isArray(newsAuto?.calendarAll) && newsAuto.calendarAll.length
    ? newsAuto.calendarAll
    : (newsAuto?.incoming ?? []);
  const enriched = src
    .map((e) => ({ e, at: parseMytToUtc(e?.timeMyt, now) }))
    .filter((x) => x.at && x.at.getTime() >= now - 10 * 60000)
    .filter((x) => x.e?.importance && x.e.importance !== 'holiday')
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.e.event ?? '').localeCompare(b.e.event ?? ''));
  return Object.freeze(enriched.slice(0, limit).map((x) => Object.freeze({
    impact: x.e.importance,
    event: x.e.event, timeMyt: x.e.timeMyt, currency: x.e.currency, country: x.e.country,
    forecast: x.e.forecast, previous: x.e.previous, note: x.e.note, focusTf: x.e.focusTf,
    countdown: countdownLabel(x.at, now), atUtc: x.at.toISOString(),
  })));
}

/* Upcoming high-impact events (this-week window), soonest first, with MYT times. */
export function selectUpcomingHighImpact(newsAuto, { now = Date.now(), limit = 6 } = {}) {
  const rows = (newsAuto?.incoming ?? []).filter((e) => e?.importance === 'high');
  const enriched = rows
    .map((e) => ({ e, at: parseMytToUtc(e?.timeMyt, now) }))
    .filter((x) => x.at && x.at.getTime() >= now - 10 * 60000)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return Object.freeze(enriched.slice(0, limit).map((x) => Object.freeze({
    event: x.e.event, timeMyt: x.e.timeMyt, currency: x.e.currency, country: x.e.country,
    forecast: x.e.forecast, previous: x.e.previous, note: x.e.note, focusTf: x.e.focusTf,
    countdown: countdownLabel(x.at, now), atUtc: x.at.toISOString(),
  })));
}

/* Latest classified news headlines across tabs (non-NEUTRAL first), deduped by
 * title (the same headline can appear under several tabs), with the highest
 * impact/signal. */
export function selectLatestNews(newsAuto, { now = Date.now(), limit = 8 } = {}) {
  const byTab = newsAuto?.byTab ?? {};
  const items = [];
  const seen = new Set();
  for (const tabId of Object.keys(byTab)) {
    for (const n of (byTab[tabId]?.news ?? [])) {
      if (!n?.title) continue;
      const key = n.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...n, tabId });
    }
  }
  const rank = (n) => (n.signal && n.signal !== 'NEUTRAL' ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (b.impactScore ?? 0) - (a.impactScore ?? 0));
  return Object.freeze(items.slice(0, limit));
}

/* ATR rows for the analysis symbols. */
export function selectAtrForSymbols(atr, symbols = ['XAUUSD', 'BTCUSD']) {
  const rows = (atr?.rows ?? []);
  const out = {};
  for (const s of symbols) {
    const key = String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const row = rows.find((r) => { const id = String(r?.id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return id === key || id.includes(key); });
    out[s] = row ? Object.freeze({ label: row.label, last: row.last, atr: row.atr, atrPct: row.atrPct, bars: row.bars, src: row.src }) : null;
  }
  return Object.freeze(out);
}

/* Multi-timeframe ATR for the gold instrument (XAU/USD primary). */
export function selectGoldMtfAtr(atrMtf) {
  const tfs = atrMtf?.timeframes ?? {};
  const order = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
  const out = {};
  for (const k of order) {
    const t = tfs[k];
    if (t) out[k] = Object.freeze({ tf: k, atr: t.atr, state: t.state, last: t.last, closedBars: t.closedBars, asOf: t.asOf });
  }
  return Object.freeze({ instrument: atrMtf?.instrument ?? null, readyCount: atrMtf?.readyCount ?? null, total: atrMtf?.total ?? null, state: atrMtf?.state ?? null, timeframes: out });
}

/* Camarilla pivot symbols in display order. Only ok:true entries are returned;
 * a failed symbol is omitted (the view shows what loaded, fail-closed). The
 * core 8 come first (full R4..S4 ladder in the DM), then crosses + EM extras
 * (compact ladder). */
const PIVOT_ORDER = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'BTCUSD', 'ETHUSD', 'DXY',
  'USDMYR', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'USDIDR', 'USDTHB'];
export function selectPivots(pivots, { limit = PIVOT_ORDER.length } = {}) {
  const symbols = pivots?.symbols ?? {};
  const out = [];
  for (const id of PIVOT_ORDER) {
    const s = symbols[id];
    if (s?.ok) out.push(Object.freeze({ id, ...s }));
    if (out.length >= limit) break;
  }
  return Object.freeze({
    method: pivots?.method ?? 'camarilla',
    generatedAt: pivots?.generatedAt ?? null,
    session: pivots?.session ?? null,
    okCount: out.length,
    symbols: out,
  });
}

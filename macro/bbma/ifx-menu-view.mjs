/* IFX UI menu — pure renderers for the news_ifxhelperbot interactive menu.
 *
 * Sections (per Anam 2026-11-07):
 *   main        — the menu itself (inline keyboard)
 *   news-event  — upcoming high-impact forex events (T-countdown)
 *   bbma        — current BBMA status for XAU/USD + BTC/USD
 *   news-update — latest classified news headlines
 *   analysis    — ATR / MTF technical context for XAUUSD and BTCUSD
 *
 * Every renderer is pure (no network/fs) and fail-closed: missing data renders
 * an honest "no data" line, never a fabricated number. HTML-escapes all
 * user/feed-derived strings.
 */
import {
  selectUpcomingHighImpact, selectUpcomingEvents, selectLatestNews, selectAtrForSymbols, selectGoldMtfAtr, selectPivots,
} from './ifx-news-source.mjs';
import { buildBbmaKeyboard } from './telegram-symbol-board.mjs';

/* Unwrap loadIfxMenuData() output into the shape the renderers consume:
 * {now, newsAuto, atr, atrMtf, macro} where each section is the RAW object or
 * null (a failed section is null, never the wrapper). Keeps "no data" honest. */
export function unwrapIfxMenuData(wrapped) {
  const w = wrapped ?? {};
  return Object.freeze({
    now: w.now ?? Date.now(),
    newsAuto: w.newsAuto?.ok ? w.newsAuto.data : null,
    atr: w.atr?.ok ? w.atr.data : null,
    atrMtf: w.atrMtf?.ok ? w.atrMtf.data : null,
    macro: w.macro?.ok ? w.macro.data : null,
    pivots: w.pivots?.ok ? w.pivots.data : null,
  });
}

export const IFX_MENU_CALLBACK_PREFIX = 'ifx';
export const ifxMenuCallbackData = (action) => `ifx:menu:${action}`;

const esc = (s) => String(s ?? '—').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/* Format a number for display without fabricating false precision: prices/ATR
 * keep 2dp when large, more when small; percentages keep 2dp. */
function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 100) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(4);
}
function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2) + '%';
}
/* Per-symbol precision formatter for pivot levels (FX 4dp, JPY/gold 2dp, crypto 0dp). */
function fmtPx(n, d) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const dec = Number.isFinite(d) ? d : (Math.abs(n) < 10 ? 4 : 2);
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const IMPACT_EMOJI = { high: '🔴', medium: '🟡', med: '🟡', low: '⚪' };
const impactEmoji = (imp) => IMPACT_EMOJI[imp] ?? '⚪';
const SIGNAL_EMOJI = { BUY: '🟢', SELL: '🔴', NEUTRAL: '⚪', BULLISH: '🟢', BEARISH: '🔴', HAWKISH: '🦅', DOVISH: '🕊️', BULL: '🟢', BEAR: '🔴' };

export function renderIfxMainMenu({ boardRows = null, dashboardUrl = null } = {}) {
  const text = [
    '📡 <b>IFX MENU</b>',
    'News / calendar / macro context for XAU·USD desk.',
    '',
    'Pick a section below.',
    'Research context only — not a broker execution signal.',
  ].join('\n');
  const rows = [
    [{ text: '📅 News Event', callback_data: ifxMenuCallbackData('news-event') }],
    [{ text: '📈 BBMA', callback_data: ifxMenuCallbackData('bbma') }],
    [{ text: '📰 News Update', callback_data: ifxMenuCallbackData('news-update') }],
    [
      { text: '🔬 Analysis XAUUSD', callback_data: ifxMenuCallbackData('analysis-xau') },
      { text: '🔬 Analysis BTCUSD', callback_data: ifxMenuCallbackData('analysis-btc') },
    ],
    [{ text: '📐 Camarilla Pivots', callback_data: ifxMenuCallbackData('pivots') }],
  ];
  if (boardRows) rows.push(buildBbmaKeyboard({ rows: boardRows, dashboardUrl })[0] ?? []);
  return Object.freeze({ text, parse_mode: 'HTML', reply_markup: rows.filter((r) => r.length) });
}

export function renderIfxNewsEventView(data, { now = data.now, limit = 14 } = {}) {
  // All impact tiers low→high (Anam: "news event must realtime update from
  // low-high impact"). Data is the live calendar heartbeat (refresh every
  // 5 min); the countdown is recomputed at render time, so every tap shows
  // the current time-to-event.
  const rows = selectUpcomingEvents(data.newsAuto, { now, limit });
  if (!rows.length) {
    return Object.freeze({ text: '📅 <b>NEWS EVENT</b>\n\nNo upcoming forex events in the current-week window (low→high).\n\nLive feed · refreshes every 5 min · research context only.', parse_mode: 'HTML' });
  }
  const counts = { high: 0, med: 0, low: 0 };
  for (const r of rows) {
    if (r.impact === 'high') counts.high += 1;
    else if (r.impact === 'low') counts.low += 1;
    else counts.med += 1;
  }
  const lines = ['📅 <b>NEWS EVENT — all impacts (low→high)</b>', ''];
  rows.forEach((r) => {
    const tag = `[${esc(r.currency)}]`;
    lines.push(`${impactEmoji(r.impact)} <b>${esc(r.event)}</b> ${tag}`);
    lines.push(`   🕒 ${esc(r.timeMyt)} MYT — ${esc(r.countdown)}`);
    const meta = [];
    if (r.forecast) meta.push(`forecast ${esc(r.forecast)}`);
    if (r.previous) meta.push(`prev ${esc(r.previous)}`);
    if (r.focusTf && r.focusTf !== 'Context') meta.push(`focus ${esc(r.focusTf)}`);
    if (meta.length) lines.push(`   ${meta.join(' · ')}`);
    lines.push('');
  });
  lines.push(`${counts.high} high · ${counts.med} med · ${counts.low} low in window`);
  lines.push('Times in MYT (UTC+8) · ForexFactory this-week feed · live, refreshes every 5 min.');
  lines.push('Research context only — not a direction call.');
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML' });
}

export function renderIfxBbmaView(data, { boardRows = null, dashboardUrl = null, pinned = null } = {}) {
  const lines = ['📈 <b>BBMA — current status</b>', ''];
  if (!data.newsAuto) lines.push('⚠️ BBMA shadow data unavailable — no broker execution.');
  const board = data.boardRows ?? boardRows ?? {};
  const byKey = new Map();
  for (const v of Object.values(board)) { const k = String(v?.symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (k) byKey.set(k, v); }
  const show = [['XAU/USD', 'XAUUSD'], ['BTC/USD', 'BTCUSD']];
  let any = false;
  for (const [symbol, key] of show) {
    const row = byKey.get(key);
    if (!row) continue;
    any = true;
    const pct = Number.isFinite(row.changePct) ? ` (${row.changePct > 0 ? '+' : ''}${row.changePct}%)` : '';
    lines.push(`📊 <b>${esc(row.symbol)}</b>  last ${esc(row.last ?? '—')}${esc(pct)}`);
    lines.push(`   ${esc(row.detail ?? 'provider bar')}`);
  }
  if (!any) lines.push('⚠️ Desk board not loaded — no prices shown (not fabricated).');
  lines.push('', 'No broker execution. Open the dashboard for full MTF/evidence.');
  const view = { text: lines.join('\n'), parse_mode: 'HTML' };
  if (boardRows) view.reply_markup = buildBbmaKeyboard({ rows: boardRows, dashboardUrl, pinned });
  return Object.freeze(view);
}

export function renderIfxNewsUpdateView(data, { now = data.now } = {}) {
  const items = selectLatestNews(data.newsAuto, { now, limit: 8 });
  if (!items.length) {
    return Object.freeze({ text: '📰 <b>NEWS UPDATE</b>\n\nNo classified news headlines loaded yet.\n\nResearch context only.', parse_mode: 'HTML' });
  }
  const lines = ['📰 <b>NEWS UPDATE — latest classified</b>', ''];
  items.forEach((n) => {
    const sig = n.signal && n.signal !== 'NEUTRAL' ? n.signal : 'NEUTRAL';
    lines.push(`${SIGNAL_EMOJI[sig] ?? '⚪'} <b>[${esc(sig)}]</b> ${esc(n.title)}`);
    const meta = [];
    if (n.impact) meta.push(`impact ${esc(n.impact)}`);
    if (n.source) meta.push(esc(n.source));
    if (n.url) lines.push(`   <a href="${esc(n.url)}">source</a>`);
    if (meta.length) lines.push(`   ${meta.join(' · ')}`);
  });
  lines.push('', 'Research context only — not a direction call.');
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });
}

export function renderIfxAnalysisView(data, { symbol = 'XAUUSD' } = {}) {
  const isGold = /XAU/.test(symbol);
  const lines = [`🔬 <b>ANALYSIS — ${esc(symbol)}</b> (ATR context)`, ''];
  const atrBySymbol = selectAtrForSymbols(data.atr, [symbol]);
  const row = atrBySymbol[symbol];
  if (row) {
    lines.push(`Price ${esc(row.label ?? symbol)}: ${fmtNum(row.last)}`);
    lines.push(`ATR14: ${fmtNum(row.atr)}  (${fmtPct(row.atrPct)} of price)`);
    if (row.bars) lines.push(`Bars: ${row.bars}`);
  } else {
    lines.push('⚠️ ATR row not available for this symbol — not fabricated.');
  }
  if (isGold) {
    const mtf = selectGoldMtfAtr(data.atrMtf);
    if (mtf.timeframes && Object.keys(mtf.timeframes).length) {
      lines.push('', `<b>Gold MTF ATR</b> (${esc(mtf.instrument ?? 'GC=F')}, ${mtf.readyCount}/${mtf.total} ready)`);
      for (const [tf, t] of Object.entries(mtf.timeframes)) {
        lines.push(`   ${tf.padEnd(4)} ATR ${fmtNum(t.atr)}  [${esc(t.state)}]`);
      }
    }
  }
  if (data.macro) {
    const m = data.macro;
    const bits = [];
    if (m.dxy) bits.push(`DXY ${esc(m.dxy.value)} ${esc(m.dxy.delta)}`);
    if (m.us10y) bits.push(`US10Y ${esc(m.us10y.value)} ${esc(m.us10y.delta)}`);
    if (bits.length) { lines.push('', `<b>Macro context</b>: ${bits.join(' · ')}`); }
  }
  lines.push('', 'Heuristic ATR/technical context only — no broker execution.');
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML' });
}

/* 📐 Camarilla Pivots — two pages (Telegram 4096-char message cap):
 *   page 1: ALL loaded symbols, compact C/R3/S3 (core + crosses/EM extras)
 *   page 2: the core 8 in full R4..R1 / C / S1..S4 ladders + session HLC
 * + cross-page nav buttons. Fail-closed: shows what loaded; empty = note. */
export const PIVOT_PAGE_SIZE = 8;
export function renderIfxPivotsView(data, { page = 1 } = {}) {
  // Accept the wrapped loadIfxMenuData() bundle (poller path) or the raw bundle.
  const d = data && (data.newsAuto == null || data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  const sel = selectPivots(d?.pivots);
  const myt = (iso) => (iso ? new Date((iso.endsWith('Z') ? iso : iso + 'Z')).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' MYT' : '—');
  if (!sel.okCount) {
    return Object.freeze({ text: '📐 <b>CAMARILLA PIVOTS</b>\n\nNo pivot data loaded yet (previous-session OHLC unavailable). It refreshes every 30 min via the ifx poller.\n\nR3/S3 = mean-reversion · R4/S4 = trend-day breakout.\nResearch context only — not a direction call.', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ IFX Menu', callback_data: 'ifx:menu:home' }]] } });
  }
  const all = sel.symbols;
  const core = all.slice(0, PIVOT_PAGE_SIZE);
  const lines = [];
  if (page === 1) {
    lines.push(`📐 <b>CAMARILLA PIVOTS</b> — ${esc(all.length)} symbols`);
    lines.push(`Prev session ${esc(sel.session ?? '—')} · gen ${esc(myt(sel.generatedAt))}`, '');
    lines.push('<i>Symbol  C  R3  S3</i>', '');
    for (const s of all) {
      lines.push(`<b>${esc(s.label)}</b>  C ${fmtPx(s.c, s.decimals)} · R3 ${fmtPx(s.R3, s.decimals)} · S3 ${fmtPx(s.S3, s.decimals)}`);
    }
    lines.push('', 'R3/S3 = mean-reversion targets · R4/S4 = trend-day breakout.');
  } else {
    lines.push(`📐 <b>CAMARILLA PIVOTS — full ladders</b> (core ${esc(core.length)})`);
    lines.push(`Prev session ${esc(sel.session ?? '—')} · gen ${esc(myt(sel.generatedAt))}`, '');
    lines.push('<i>R4 R3 R2 R1 / C / S1 S2 S3 S4</i>', '');
    for (const s of core) {
      lines.push(`▍<b>${esc(s.label)}</b>  C ${fmtPx(s.c, s.decimals)}  (H ${fmtPx(s.h, s.decimals)} · L ${fmtPx(s.l, s.decimals)} · range ${fmtPx(s.range, s.decimals)})`);
      lines.push(`   R: ${fmtPx(s.R4, s.decimals)} ${fmtPx(s.R3, s.decimals)} ${fmtPx(s.R2, s.decimals)} ${fmtPx(s.R1, s.decimals)}`);
      lines.push(`   S: ${fmtPx(s.S1, s.decimals)} ${fmtPx(s.S2, s.decimals)} ${fmtPx(s.S3, s.decimals)} ${fmtPx(s.S4, s.decimals)}`);
      const pos = Math.round((s.closePos ?? 0) * 100);
      lines.push(`   closed ${pos}% of range ${pos >= 60 ? '🟢 bullish' : pos <= 40 ? '🔴 bearish' : '⚪ mid'}`);
      lines.push('');
    }
  }
  lines.push('Research context only — not a direction call.');
  const row = [];
  if (page === 1) {
    row.push({ text: '🎯 Choose Symbol', callback_data: 'ifx:menu:pivots:sym' });
    row.push({ text: '📏 Full Ladders (R4–S4)', callback_data: 'ifx:menu:pivots:2' });
  } else {
    row.push({ text: '🎯 Choose Symbol', callback_data: 'ifx:menu:pivots:sym' });
    row.push({ text: '⬆️ All Symbols', callback_data: 'ifx:menu:pivots:1' });
  }
  row.push({ text: '⬅️ IFX Menu', callback_data: 'ifx:menu:home' });
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: { inline_keyboard: [row] } });
}

/* Resolve a pivot detail symbol from a raw or wrapped bundle (fail-closed). */
function resolvePivotDetail(data, id) {
  const d = data && (data.newsAuto == null || data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  const sel = selectPivots(d?.pivots);
  const s = (id ?? null) && sel.symbols.find((x) => x.id.toUpperCase() === String(id).toUpperCase());
  return { sel, s };
}

/* 📐 Camarilla flow step 1 — choose a symbol. Grid of buttons (3 per row);
 * tapping one opens the full step-by-step R4..S4 calculation for it. */
export function renderIfxPivotsChooser(data) {
  const { sel } = resolvePivotDetail(data);
  if (!sel.okCount) {
    return Object.freeze({ text: '📐 <b>CAMARILLA — CHOOSE SYMBOL</b>\n\nNo pivot data loaded yet (previous-session OHLC unavailable). It refreshes every 30 min via the ifx poller.', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⬅️ Pivots Overview', callback_data: 'ifx:menu:pivots' }]] } });
  }
  const lines = [
    '📐 <b>CAMARILLA — CHOOSE A SYMBOL</b>',
    `Prev session ${esc(sel.session ?? '—')} · ${esc(sel.okCount)} symbols loaded`,
    '',
    'Tap one — the bot walks through the full calculation: prior HLC → range → step → R4·R3·R2·R1 / C / S1·S2·S3·S4.',
  ];
  const grid = [];
  for (let i = 0; i < sel.symbols.length; i += 3) {
    grid.push(sel.symbols.slice(i, i + 3).map((s) => ({ text: esc(s.label), callback_data: ifxMenuCallbackData(`pivots:sym:${s.id}`) })));
  }
  grid.push([{ text: '⬅️ Pivots Overview', callback_data: 'ifx:menu:pivots' }, { text: '⌂ IFX Menu', callback_data: 'ifx:menu:home' }]);
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: { inline_keyboard: grid } });
}

/* 📐 Camarilla flow step 2 — the complete, shown-working calculation for one
 * symbol: prior-session HLC → Range → step → every level R4..S4 (Camarilla
 * radiates from the previous CLOSE; R3/S3 mean-reversion, R4/S4 breakout). */
export function renderIfxPivotCalcView(data, id) {
  const { sel, s } = resolvePivotDetail(data, id);
  if (!s) {
    return Object.freeze({ text: `📐 <b>CAMARILLA — ${esc(id ?? 'symbol')}</b>\n\nNo pivot data loaded for this symbol yet. Refreshes every 30 min via the ifx poller.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '🔁 Choose Symbol', callback_data: 'ifx:menu:pivots:sym' }, { text: '⌂ IFX Menu', callback_data: 'ifx:menu:home' }]] } });
  }
  const p = s.decimals;
  const f = (n) => fmtPx(n, p);
  const step = s.range * 1.1;
  const o12 = step / 12, o6 = step / 6, o4 = step / 4, o2 = step / 2;
  const lines = [];
  lines.push(`📐 <b>CAMARILLA — ${esc(s.label)}</b>`);
  lines.push(`Prev session <b>${esc(s.session ?? '—')}</b> · generated ${esc(sel.generatedAt ?? '—')}`);
  lines.push('', '<b>1 · Inputs — previous session OHLC</b>');
  lines.push(`H (high)  = ${f(s.h)}`);
  lines.push(`L (low)   = ${f(s.l)}`);
  lines.push(`C (close) = ${f(s.c)}  ← levels radiate from the close`);
  lines.push('', '<b>2 · Range</b>');
  lines.push(`${f(s.h)} − ${f(s.l)} = ${f(s.range)}`);
  lines.push('', '<b>3 · Step</b>');
  lines.push(`${f(s.range)} × 1.1 = ${f(step)}`);
  lines.push('', '<b>4 · Level offsets</b>');
  lines.push(`step/12 = ${f(o12)}   step/6 = ${f(o6)}`);
  lines.push(`step/4  = ${f(o4)}   step/2 = ${f(o2)}`);
  lines.push('', '<b>5 · Resistances (above close)</b>');
  lines.push(`R4 = ${f(s.c)} + ${f(o2)}  = ${f(s.R4)}  <i>breakout</i>`);
  lines.push(`R3 = ${f(s.c)} + ${f(o4)}  = ${f(s.R3)}  <i>mean-reversion</i>`);
  lines.push(`R2 = ${f(s.c)} + ${f(o6)}  = ${f(s.R2)}`);
  lines.push(`R1 = ${f(s.c)} + ${f(o12)} = ${f(s.R1)}`);
  lines.push('', '<b>6 · Supports (below close)</b>');
  lines.push(`S1 = ${f(s.c)} − ${f(o12)} = ${f(s.S1)}`);
  lines.push(`S2 = ${f(s.c)} − ${f(o6)}  = ${f(s.S2)}`);
  lines.push(`S3 = ${f(s.c)} − ${f(o4)}  = ${f(s.S3)}  <i>mean-reversion</i>`);
  lines.push(`S4 = ${f(s.c)} − ${f(o2)}  = ${f(s.S4)}  <i>breakout</i>`);
  const pos = Math.round((s.closePos ?? 0) * 100);
  lines.push('', `<i>Session read: closed ${pos}% of range ${pos >= 60 ? '🟢 bullish' : pos <= 40 ? '🔴 bearish' : '⚪ mid'}</i>`);
  lines.push('', 'Research context only — not a direction call.');
  return Object.freeze({
    text: lines.join('\n'), parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '🔁 Choose Symbol', callback_data: 'ifx:menu:pivots:sym' }, { text: '⌂ IFX Menu', callback_data: 'ifx:menu:home' }]] },
  });
}

/* Parse a /start deep-link or bare payload into a menu action, or null.
 * Channel buttons are URL deep-links (https://t.me/<bot>/start/ifx:menu:weekly),
 * which Telegram delivers to the DM as the message "/start ifx:menu:weekly".
 * Pivots flow: ifx:menu:pivots:2 = page 2 (full ladders),
 * ifx:menu:pivots:sym = choose-symbol, ifx:menu:pivots:sym:XAUUSD = calc view. */
export function parseIfxMenuPayload(text) {
  const t = String(text ?? '').trim();
  // Capture the whole sub-path (pivots:sym:XAUUSD) — colons allowed after the first segment.
  const m = /ifx:menu:([a-z0-9=.-]+(?::[a-z0-9=.-]+)*)/i.exec(t);
  if (!m) return null;
  const g = m[1];
  // Preserve the symbol id's case for the calc view; lowercase everything else.
  if (/^pivots:sym:[a-z0-9=.-]+$/i.test(g)) return 'pivots:sym:' + g.slice('pivots:sym:'.length);
  return g.toLowerCase();
}

/* Base URL of the live IFX report page (GitHub Pages, legacy build from main,
 * auto-updates on every poller push; page auto-refreshes data each 60s). The
 * channel's recheck buttons open this in Telegram's in-app browser — so a tap
 * shows the FRESH output directly, without going to the bot (Anam's ask). */
export const IFX_REPORT_BASE = 'https://mohd012z.github.io/News_ifxhelper/report.html';

/* A small URL-button keyboard that renders on a CHANNEL (URL buttons work;
 * callback buttons do not, since @ifxhelper2 has no linked chat). The two
 * recheck buttons open the live report page (in-app browser). The full
 * interactive menu (ATR/BBMA analysis has no web page) stays a /start DM.
 *
 * ADAPTIVE: once the channel is linked to a discussion group the bot is a
 * member of, callback buttons fire on channel posts too — `linked: true`
 * emits real callback_data (tap -> bot edits the channel post in place, zero
 * browser/DM). Until then the URL/DM fallbacks keep working. */
export function channelMenuKeyboard({ botUsername = 'news_ifxhelperbot', reportBase = IFX_REPORT_BASE, linked = false } = {}) {
  if (linked) {
    return [
      [
        { text: '📰 Weekly News', callback_data: 'ifx:menu:weekly' },
        { text: '🔭 Upcoming Events', callback_data: 'ifx:menu:upcoming' },
      ],
      [
        { text: '📐 Camarilla Pivots', callback_data: 'ifx:menu:pivots' },
        { text: '📊 Full IFX Menu (DM)', url: `https://t.me/${botUsername}/start/ifx:menu:home` },
      ],
    ];
  }
  const startBase = `https://t.me/${botUsername}/start/`;
  return [
    [
      { text: '📰 Weekly News', url: `${reportBase}?tab=weekly` },
      { text: '🔭 Upcoming Events', url: `${reportBase}?tab=upcoming` },
    ],
    [
      { text: '📐 Camarilla Pivots', url: `${reportBase}?tab=pivots` },
      { text: '📊 Full IFX Menu (DM)', url: startBase + 'ifx:menu:home' },
    ],
  ];
}

/* The channel menu card posted to @ifxhelper2 (Anam's "add menu on ifxhelper2"). */
export function renderChannelMenuCard({ botUsername = 'news_ifxhelperbot', dashboardUrl = null, linked = false } = {}) {
  const hint = linked
    ? 'Tap a button — the post <b>updates right there</b> with the fresh weekly news / upcoming events (no browser, no chat).'
    : 'Tap a button — the <b>fresh weekly news / upcoming events</b> open right here in Telegram (in-app browser, auto-updates every minute).';
  const lines = [
    '📡 <b>IFX CHANNEL MENU</b>',
    hint,
    '',
    linked ? '📰 Weekly News · 🔭 Upcoming Events · 📊 Full interactive menu (bot)'
           : '📰 Weekly News · 🔭 Upcoming Events · 📊 Full interactive menu (bot)',
    dashboardUrl ? `\n<code>${esc(dashboardUrl)}</code>` : '',
    '',
    'Research context only — not a direction call.',
  ].filter(Boolean);
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: channelMenuKeyboard({ botUsername, linked }) });
}

/* A freshly-rechecked channel report. `action` is 'weekly', 'upcoming' or
 * 'pivots'. Accepts the wrapped loadIfxMenuData() bundle (poller path) or the
 * raw bundle; unwraps once. Renders from the (just reloaded) data so the
 * channel shows CURRENT news — the "recheck & update" Anam asked for. */
export function renderChannelRecheck(action, data, { now = Date.now(), botUsername = 'news_ifxhelperbot', dashboardUrl = null, linked = false } = {}) {
  const d = (data && data.newsAuto && data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  const t = d?.now ?? now;
  const myt = new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  if (action === 'pivots') {
    const sel = selectPivots(d?.pivots);
    const lines = [`📐 <b>CAMARILLA PIVOTS — rechecked ${myt} MYT</b>`, ''];
    if (!sel.okCount) {
      lines.push('No pivot data loaded yet (previous-session OHLC unavailable).');
    } else {
      lines.push(`Prev session ${esc(sel.session ?? '—')} · ${esc(sel.okCount)} symbols · levels from prior close`);
      lines.push('<i>Symbol  C  R3  S3</i>', '');
      sel.symbols.forEach((s) => {
        lines.push(`<b>${esc(s.label)}</b>  C ${fmtPx(s.c, s.decimals)} · R3 ${fmtPx(s.R3, s.decimals)} · S3 ${fmtPx(s.S3, s.decimals)}`);
      });
      lines.push('', 'R3/S3 = mean-reversion targets · R4/S4 = trend-day breakout (full R4–S4 ladders on the Pivots tab of the report page).');
    }
    lines.push('', 'Research context only — not a direction call.');
    return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: channelMenuKeyboard({ botUsername, linked }) });
  }
  if (action === 'upcoming') {
    // All impacts low→high (Anam: "news event must realtime update from
    // low-high impact"); the live post + this recheck use the same selector
    // so the channel matches the DM.
    const rows = selectUpcomingEvents(d?.newsAuto, { now: t, limit: 10 });
    const lines = [`🔭 <b>UPCOMING EVENTS — rechecked ${myt} MYT</b>`, ''];
    if (!rows.length) {
      lines.push('No upcoming forex events in the current-week window (low→high).');
    } else {
      rows.forEach((r) => {
        const tag = `[${esc(r.currency)}]`;
        lines.push(`${impactEmoji(r.impact)} <b>${esc(r.event)}</b> ${tag}`);
        lines.push(`   🕒 ${esc(r.timeMyt)} MYT — ${esc(r.countdown)}`);
        const meta = [];
        if (r.forecast) meta.push(`forecast ${esc(r.forecast)}`);
        if (r.previous) meta.push(`prev ${esc(r.previous)}`);
        if (r.focusTf && r.focusTf !== 'Context') meta.push(`focus ${esc(r.focusTf)}`);
        if (meta.length) lines.push(`   ${meta.join(' · ')}`);
        lines.push('');
      });
      lines.push('Times in MYT (UTC+8) · ForexFactory this-week feed · live, refreshes every 5 min.');
    }
    lines.push('', 'Research context only — not a direction call.');
    return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: channelMenuKeyboard({ botUsername, linked }) });
  }
  // default: weekly news
  const items = selectLatestNews(d?.newsAuto, { now: t, limit: 10 });
  const lines = [`📰 <b>WEEKLY NEWS — rechecked ${myt} MYT</b>`, ''];
  if (!items.length) {
    lines.push('No classified news headlines loaded yet (feed may be empty).');
  } else {
    items.forEach((n) => {
      const sig = n.signal && n.signal !== 'NEUTRAL' ? n.signal : 'NEUTRAL';
      lines.push(`${SIGNAL_EMOJI[sig] ?? '⚪'} <b>[${esc(sig)}]</b> ${esc(n.title)}`);
      const meta = [];
      if (n.impact) meta.push(`impact ${esc(n.impact)}`);
      if (n.source) meta.push(esc(n.source));
      if (n.url) lines.push(`   <a href="${esc(n.url)}">source</a>`);
      if (meta.length) lines.push(`   ${meta.join(' · ')}`);
    });
    lines.push('', 'Latest classified headlines, deduped (non-NEUTRAL first).');
  }
  lines.push('', 'Research context only — not a direction call.');
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: channelMenuKeyboard({ botUsername, linked }) });
}

/* The pinned "LIVE" channel post content — the poller edits this in place
 * every ~5 min (onCycle) so the 9 subscribers always see fresh weekly news +
 * upcoming events WITHOUT tapping anything. Compact: 3 top headlines with
 * SELL/BUY bias + the next high-impact event, then the URL-button menu. */
export function renderChannelLiveView(data, { now = Date.now(), botUsername = 'news_ifxhelperbot', linked = false } = {}) {
  const d = (data && data.newsAuto && data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  const t = d?.now ?? now;
  const myt = new Date(t + 8 * 3600 * 1000).toISOString().slice(11, 16);
  const items = selectLatestNews(d?.newsAuto, { now: t, limit: 3 });
  const lines = [`📡 <b>IFX LIVE — updated ${myt} MYT</b>`, ''];
  lines.push('<b>Top classified headlines</b>');
  if (!items.length) lines.push('No classified news in the current cycle.');
  else items.forEach((n) => {
    const sig = n.signal && n.signal !== 'NEUTRAL' ? n.signal : 'NEUTRAL';
    lines.push(`${SIGNAL_EMOJI[sig] ?? '⚪'} ${esc(n.title)}`);
  });
  const rows = selectUpcomingEvents(d?.newsAuto, { now: t, limit: 3 });
  lines.push('', '<b>Next events (all impacts)</b>');
  if (!rows.length) lines.push('All clear — no events in the current-week window.');
  else rows.forEach((r) => lines.push(`${impactEmoji(r.impact)} ${esc(r.event)} — ${esc(r.timeMyt)} MYT (${esc(r.countdown)})`));
  lines.push('', '📰 Full weekly · 🔭 Full upcoming (low→high) · 📊 Interactive menu:');
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: channelMenuKeyboard({ botUsername, linked }) });
}

export function renderIfxMenuView(action, data, { boardRows = null, dashboardUrl = null, pinned = null } = {}) {
  // Accept either the raw loaded bundle ({now, newsAuto, atr, atrMtf, macro}) or the
  // wrapped loadIfxMenuData() output ({...: {ok, data}}) — normalize once here.
  const d = data && (data.newsAuto == null || data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  switch (action) {
    case 'news-event':
    case 'upcoming': return renderIfxNewsEventView(d);
    case 'bbma': return renderIfxBbmaView(d, { boardRows, dashboardUrl, pinned });
    case 'news-update':
    case 'weekly': return renderIfxNewsUpdateView(d);
    case 'analysis-xau': return renderIfxAnalysisView(d, { symbol: 'XAUUSD' });
    case 'analysis-btc': return renderIfxAnalysisView(d, { symbol: 'BTCUSD' });
    case 'pivots': return renderIfxPivotsView(d, { page: 1 });
    case 'pivots:2': return renderIfxPivotsView(d, { page: 2 });
    case 'pivots:sym': return renderIfxPivotsChooser(d);
    default: {
      const sym = /^pivots:sym:([a-z0-9=.-]+)$/i.exec(action ?? '');
      if (sym) return renderIfxPivotCalcView(d, sym[1]);
      return Object.freeze({ text: '⚠️ Unknown IFX menu section.', parse_mode: 'HTML' });
    }
  }
}

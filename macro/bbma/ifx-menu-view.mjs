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
  selectUpcomingHighImpact, selectLatestNews, selectAtrForSymbols, selectGoldMtfAtr,
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

const IMPACT_EMOJI = { high: '🔴', medium: '🟡', low: '⚪' };
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
  ];
  if (boardRows) rows.push(buildBbmaKeyboard({ rows: boardRows, dashboardUrl })[0] ?? []);
  return Object.freeze({ text, parse_mode: 'HTML', reply_markup: rows.filter((r) => r.length) });
}

export function renderIfxNewsEventView(data, { now = data.now } = {}) {
  const rows = selectUpcomingHighImpact(data.newsAuto, { now, limit: 6 });
  if (!rows.length) {
    return Object.freeze({ text: '📅 <b>NEWS EVENT</b>\n\nNo upcoming high-impact forex events in the current-week window.\n\nResearch context only.', parse_mode: 'HTML' });
  }
  const lines = ['📅 <b>NEWS EVENT — upcoming high-impact</b>', ''];
  rows.forEach((r) => {
    const tag = `[${esc(r.currency)}]`;
    lines.push(`${IMPACT_EMOJI[r.e?.importance] ?? '🔴'} <b>${esc(r.event)}</b> ${tag}`);
    lines.push(`   🕒 ${esc(r.timeMyt)} MYT — ${esc(r.countdown)}`);
    const meta = [];
    if (r.forecast) meta.push(`forecast ${esc(r.forecast)}`);
    if (r.previous) meta.push(`prev ${esc(r.previous)}`);
    if (r.focusTf) meta.push(`focus ${esc(r.focusTf)}`);
    if (meta.length) lines.push(`   ${meta.join(' · ')}`);
    lines.push('');
  });
  lines.push('Times in MYT (UTC+8). Source: ForexFactory this-week feed.');
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

/* Parse a /start deep-link or bare payload into a menu action, or null.
 * Channel buttons are URL deep-links (https://t.me/<bot>/start/ifx:menu:weekly),
 * which Telegram delivers to the DM as the message "/start ifx:menu:weekly". */
export function parseIfxMenuPayload(text) {
  const t = String(text ?? '').trim();
  const m = /ifx:menu:([a-z0-9-]+)/i.exec(t);
  return m ? m[1].toLowerCase() : null;
}

/* Base URL of the live IFX report page (GitHub Pages, legacy build from main,
 * auto-updates on every poller push; page auto-refreshes data each 60s). The
 * channel's recheck buttons open this in Telegram's in-app browser — so a tap
 * shows the FRESH output directly, without going to the bot (Anam's ask). */
export const IFX_REPORT_BASE = 'https://mohd012z.github.io/News_ifxhelper/report.html';

/* A small URL-button keyboard that renders on a CHANNEL (URL buttons work;
 * callback buttons do not, since @ifxhelper2 has no linked chat). The two
 * recheck buttons open the live report page (in-app browser). The full
 * interactive menu (ATR/BBMA analysis has no web page) stays a /start DM. */
export function channelMenuKeyboard({ botUsername = 'news_ifxhelperbot', reportBase = IFX_REPORT_BASE } = {}) {
  const startBase = `https://t.me/${botUsername}/start/`;
  return [
    [
      { text: '📰 Weekly News', url: `${reportBase}?tab=weekly` },
      { text: '🔭 Upcoming Events', url: `${reportBase}?tab=upcoming` },
    ],
    [{ text: '📊 Open Full IFX Menu (DM)', url: startBase + 'ifx:menu:home' }],
  ];
}

/* The channel menu card posted to @ifxhelper2 (Anam's "add menu on ifxhelper2"). */
export function renderChannelMenuCard({ botUsername = 'news_ifxhelperbot', dashboardUrl = null } = {}) {
  const lines = [
    '📡 <b>IFX CHANNEL MENU</b>',
    'Tap a button — the <b>fresh weekly news / upcoming events</b> open right here in Telegram (in-app browser, auto-updates every minute).',
    '',
    '📰 Weekly News · 🔭 Upcoming Events · 📊 Full interactive menu (bot)',
    dashboardUrl ? `\n<code>${esc(dashboardUrl)}</code>` : '',
    '',
    'Research context only — not a direction call.',
  ].filter(Boolean);
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: channelMenuKeyboard({ botUsername }) });
}

/* A freshly-rechecked channel report. `action` is 'weekly' or 'upcoming'.
 * Accepts the wrapped loadIfxMenuData() bundle (poller path) or the raw bundle;
 * unwraps once. Renders from the (just reloaded) data so the channel shows
 * CURRENT news — the "recheck & update" Anam asked for. */
export function renderChannelRecheck(action, data, { now = Date.now(), botUsername = 'news_ifxhelperbot', dashboardUrl = null } = {}) {
  const d = (data && data.newsAuto && data.newsAuto.ok !== undefined) ? unwrapIfxMenuData(data) : data;
  const t = d?.now ?? now;
  const myt = new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  if (action === 'upcoming') {
    const rows = selectUpcomingHighImpact(d?.newsAuto, { now: t, limit: 10 });
    const lines = [`🔭 <b>UPCOMING EVENTS — rechecked ${myt} MYT</b>`, ''];
    if (!rows.length) {
      lines.push('No upcoming high-impact forex events in the current-week window (quiet/weekend).');
    } else {
      rows.forEach((r) => {
        const tag = `[${esc(r.currency)}]`;
        lines.push(`🔴 <b>${esc(r.event)}</b> ${tag}`);
        lines.push(`   🕒 ${esc(r.timeMyt)} MYT — ${esc(r.countdown)}`);
        const meta = [];
        if (r.forecast) meta.push(`forecast ${esc(r.forecast)}`);
        if (r.previous) meta.push(`prev ${esc(r.previous)}`);
        if (r.focusTf) meta.push(`focus ${esc(r.focusTf)}`);
        if (meta.length) lines.push(`   ${meta.join(' · ')}`);
        lines.push('');
      });
      lines.push('Times in MYT (UTC+8) · ForexFactory this-week feed.');
    }
    lines.push('', 'Research context only — not a direction call.');
    return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', reply_markup: channelMenuKeyboard({ botUsername }) });
  }
  // default: weekly news
  const items = selectLatestNews(data.newsAuto, { now, limit: 10 });
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
  return Object.freeze({ text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: channelMenuKeyboard({ botUsername }) });
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
    default: return Object.freeze({ text: '⚠️ Unknown IFX menu section.', parse_mode: 'HTML' });
  }
}

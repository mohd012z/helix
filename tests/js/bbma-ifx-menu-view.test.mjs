import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderIfxMainMenu, renderIfxNewsEventView, renderIfxBbmaView,
  renderIfxNewsUpdateView, renderIfxAnalysisView, renderIfxMenuView,
  ifxMenuCallbackData, parseIfxMenuPayload, renderChannelMenuCard,
  renderChannelRecheck, renderChannelLiveView, channelMenuKeyboard,
} from '../../macro/bbma/ifx-menu-view.mjs';

const NOW = Date.parse('2026-11-06T00:00:00Z'); // 08:00 MYT; NFP (13:30 UTC) is upcoming
const DATA = {
  now: NOW,
  newsAuto: { ok: true, data: {
    incoming: [{ importance: 'high', event: '[USD] Non-Farm Employment Change', timeMyt: 'Fri, 2026-11-06 21:30', currency: 'USD', forecast: '170k', previous: '227k', focusTf: 'M5 - M15' }],
    byTab: { forex: { news: [{ title: 'Fed flags data-dependence', signal: 'HAWKISH', impact: 'High', source: 'Reuters', url: 'https://example.com/a' }] } },
  } },
  atr: { ok: true, data: { rows: [{ id: 'XAUUSD', label: 'XAU/USD', last: 4070.1, atr: 9.4, atrPct: 0.23, bars: 67 }] } },
  atrMtf: { ok: true, data: { instrument: 'GC=F', readyCount: 7, total: 9, state: 'PARTIAL', timeframes: { M15: { tf: 'M15', atr: 2.1, state: 'READY', last: 4070 } } } },
  macro: { ok: true, data: { dxy: { label: 'DXY', value: '102.3', delta: '+0.7%' } } },
};
// renderers read data.newsAuto etc. as the object (not .data) — unwrap like the poller does.
const UNWRAP = {
  now: NOW,
  newsAuto: DATA.newsAuto.data,
  atr: DATA.atr.data,
  atrMtf: DATA.atrMtf.data,
  macro: DATA.macro.data,
};

test('main menu carries the four sections + analysis split, with keyboard', () => {
  const v = renderIfxMainMenu({});
  assert.match(v.text, /IFX MENU/);
  assert.equal(v.parse_mode, 'HTML');
  const data = v.reply_markup.flat().map((b) => b.callback_data);
  assert.ok(data.includes(ifxMenuCallbackData('news-event')));
  assert.ok(data.includes(ifxMenuCallbackData('bbma')));
  assert.ok(data.includes(ifxMenuCallbackData('news-update')));
  assert.ok(data.includes(ifxMenuCallbackData('analysis-xau')));
  assert.ok(data.includes(ifxMenuCallbackData('analysis-btc')));
});

test('news-event view lists the upcoming high-impact event with MYT time + countdown', () => {
  const v = renderIfxNewsEventView(UNWRAP, { now: NOW });
  assert.match(v.text, /NEWS EVENT/);
  assert.match(v.text, /Non-Farm Employment Change/);
  assert.match(v.text, /21:30/);
  assert.match(v.text, /in 13h/);
});

test('news-event view fails closed (no fabrication) when data is empty', () => {
  const v = renderIfxNewsEventView({ now: NOW, newsAuto: null }, { now: NOW });
  assert.match(v.text, /No upcoming high-impact/);
});

test('bbma view shows board prices and never fabricates a direction', () => {
  const board = { 'XAU/USD': { symbol: 'XAU/USD', ok: true, last: 4070.1, changePct: -0.2 }, 'BTC/USD': { symbol: 'BTC/USD', ok: true, last: 97450, changePct: 0.1 } };
  const v = renderIfxBbmaView({ now: NOW, newsAuto: UNWRAP.newsAuto, boardRows: board }, { boardRows: board });
  assert.match(v.text, /BBMA — current status/);
  assert.match(v.text, /4070\.1/);
  assert.match(v.text, /97450/);
  assert.doesNotMatch(v.text, /Direction:/, 'price-only board must not claim a BBMA direction');
});

test('news-update view lists classified headlines with source links', () => {
  const v = renderIfxNewsUpdateView(UNWRAP, { now: NOW });
  assert.match(v.text, /NEWS UPDATE/);
  assert.match(v.text, /HAWKISH/);
  assert.match(v.text, /Fed flags data-dependence/);
  assert.equal(v.disable_web_page_preview, true);
});

test('analysis view (gold) shows ATR + MTF + macro, no broker claim', () => {
  const v = renderIfxAnalysisView(UNWRAP, { symbol: 'XAUUSD' });
  assert.match(v.text, /ANALYSIS — XAUUSD/);
  assert.match(v.text, /4070\.1/);
  assert.match(v.text, /9\.4/);
  assert.match(v.text, /Gold MTF ATR/);
  assert.match(v.text, /M15/);
  assert.match(v.text, /DXY 102\.3/);
  assert.match(v.text, /no broker execution/i);
});

test('analysis view fails closed for a symbol with no ATR row', () => {
  const v = renderIfxAnalysisView({ now: NOW, atr: { rows: [] }, atrMtf: null, macro: null }, { symbol: 'BTCUSD' });
  assert.match(v.text, /ANALYSIS — BTCUSD/);
  assert.match(v.text, /not available/);
});

test('renderIfxMenuView routes every action; unknown fails closed', () => {
  assert.match(renderIfxMenuView('news-event', UNWRAP).text, /NEWS EVENT/);
  assert.match(renderIfxMenuView('analysis-btc', UNWRAP).text, /BTCUSD/);
  assert.match(renderIfxMenuView('bogus', UNWRAP).text, /Unknown IFX menu section/);
});

test('renderIfxMenuView accepts the wrapped loadIfxMenuData() bundle (poller path)', () => {
  const wrapped = { now: NOW, newsAuto: DATA.newsAuto, atr: DATA.atr, atrMtf: DATA.atrMtf, macro: DATA.macro };
  assert.match(renderIfxMenuView('news-event', wrapped).text, /Non-Farm Employment Change/);
  assert.match(renderIfxMenuView('analysis-xau', wrapped).text, /Gold MTF ATR/);
  // a failed section (ok:false) must render as "no data", not crash
  const partial = { now: NOW, newsAuto: { ok: false }, atr: { ok: false }, atrMtf: { ok: false }, macro: { ok: false } };
  assert.match(renderIfxMenuView('news-event', partial).text, /No upcoming high-impact/);
  assert.match(renderIfxMenuView('analysis-xau', partial).text, /not available/);
});

test('parseIfxMenuPayload extracts the action from /start deep-links and bare payloads', () => {
  assert.equal(parseIfxMenuPayload('/start ifx:menu:weekly'), 'weekly');
  assert.equal(parseIfxMenuPayload('/start ifx:menu:UPCOMING'), 'upcoming');
  assert.equal(parseIfxMenuPayload('ifx:menu:home'), 'home');
  assert.equal(parseIfxMenuPayload('/start'), null);
  assert.equal(parseIfxMenuPayload('/menu'), null);
  assert.equal(parseIfxMenuPayload(''), null);
  assert.equal(parseIfxMenuPayload(null), null);
});

test('channel menu card carries /start URL buttons that render on a channel', () => {
  const card = renderChannelMenuCard({ dashboardUrl: 'https://gentle-violet.example/' });
  assert.match(card.text, /IFX CHANNEL MENU/);
  const btns = card.reply_markup.flat();
  // Every channel button must be a URL button (no callback_data — channels can't fire callbacks).
  assert.ok(btns.length >= 3);
  for (const b of btns) {
    assert.ok(b.url, 'channel button must be a URL button');
    assert.equal(b.callback_data, undefined, 'channel buttons must not use callback_data');
  }
  const urls = btns.map((b) => b.url);
  // The recheck buttons open the LIVE report page (in-app browser) — no bot DM.
  assert.ok(urls.some((u) => u.startsWith('https://mohd012z.github.io/News_ifxhelper/report.html?tab=weekly')));
  assert.ok(urls.some((u) => u.startsWith('https://mohd012z.github.io/News_ifxhelper/report.html?tab=upcoming')));
  // Only the full interactive menu (ATR/BBMA, no web page) still opens the bot DM.
  assert.ok(urls.some((u) => u.endsWith('ifx:menu:home')));
  assert.equal(btns.filter((b) => b.url.includes('/start/')).length, 1, 'exactly one DM deep-link (full menu)');
});

test('channel keyboard (linked) emits callback buttons that edit the post in place', () => {
  const kb = channelMenuKeyboard({ linked: true }).flat();
  assert.equal(kb.length, 3);
  assert.deepEqual(kb.filter((b) => b.callback_data).map((b) => b.callback_data), ['ifx:menu:weekly', 'ifx:menu:upcoming']);
  assert.ok(kb.some((b) => b.url && b.url.endsWith('ifx:menu:home')), 'full menu stays a DM deep-link');
  assert.equal(kb.filter((b) => b.callback_data && b.url).length, 0, 'a button is either callback OR url');
});

test('renderChannelRecheck (linked) carries callback buttons, not URLs', () => {
  const v = renderChannelRecheck('weekly', { newsAuto: DATA.newsAuto.data, now: NOW }, { now: NOW, linked: true });
  const btns = v.reply_markup.flat();
  assert.ok(btns.some((b) => b.callback_data === 'ifx:menu:weekly'));
  assert.ok(btns.some((b) => b.url && b.url.endsWith('ifx:menu:home')));
});

test('channel recheck (weekly) lists fresh headlines with a recheck timestamp + URL footer', () => {
  // renderChannelRecheck expects the bundle shape {newsAuto, now}.
  const v = renderChannelRecheck('weekly', { newsAuto: DATA.newsAuto.data, now: NOW }, { now: NOW });
  assert.match(v.text, /WEEKLY NEWS — rechecked/);
  assert.match(v.text, /Fed flags data-dependence/);
  assert.match(v.text, /HAWKISH/);
  assert.ok(v.reply_markup, 'channel recheck must carry the URL-button footer for re-tapping');
  assert.equal(v.disable_web_page_preview, true);
});

test('channel recheck (upcoming) lists the upcoming high-impact event with MYT time', () => {
  const v = renderChannelRecheck('upcoming', { newsAuto: DATA.newsAuto.data, now: NOW }, { now: NOW });
  assert.match(v.text, /UPCOMING EVENTS — rechecked/);
  assert.match(v.text, /Non-Farm Employment Change/);
  assert.match(v.text, /21:30/);
  assert.match(v.text, /in 13h/);
  assert.ok(v.reply_markup);
});

test('channel recheck fails closed when the feed is empty (no fabrication)', () => {
  const empty = { newsAuto: { incoming: [], byTab: {} }, now: NOW };
  assert.match(renderChannelRecheck('weekly', empty, { now: NOW }).text, /No classified news/);
  assert.match(renderChannelRecheck('upcoming', empty, { now: NOW }).text, /No upcoming high-impact/);
});

test('pinned LIVE view: wrapped bundle, 3 top headlines + SELL badges + URL-button menu', () => {
  // Poller passes the wrapped loadIfxMenuData() bundle (newsAuto.ok defined).
  const v = renderChannelLiveView({ newsAuto: DATA.newsAuto, now: NOW }, { now: NOW });
  assert.match(v.text, /IFX LIVE — updated/);
  assert.match(v.text, /Top classified headlines/);
  assert.match(v.text, /Fed flags data-dependence/);
  assert.ok(v.text.includes('🦅'), 'HAWKISH headlines must carry a signal emoji');
  assert.match(v.text, /Upcoming high-impact/);
  assert.match(v.text, /Non-Farm Employment Change/);
  // The live post doubles as the menu: URL buttons only, no callback_data.
  const btns = v.reply_markup.flat();
  assert.equal(btns.length, 3);
  for (const b of btns) assert.ok(b.url && b.callback_data === undefined);
  assert.equal(v.disable_web_page_preview, true);
});

test('pinned LIVE view fails closed on an empty feed (honest "all clear")', () => {
  const empty = { newsAuto: { ok: true, data: { incoming: [], byTab: {} } }, now: NOW };
  const v = renderChannelLiveView(empty, { now: NOW });
  assert.match(v.text, /No classified news in the current cycle/);
  assert.match(v.text, /All clear — no events in the current-week window/);
});

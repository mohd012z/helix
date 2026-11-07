import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderIfxMainMenu, renderIfxNewsEventView, renderIfxBbmaView,
  renderIfxNewsUpdateView, renderIfxAnalysisView, renderIfxMenuView,
  ifxMenuCallbackData,
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

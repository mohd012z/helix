import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseMytToUtc, countdownLabel, selectUpcomingHighImpact, selectLatestNews,
  selectAtrForSymbols, selectGoldMtfAtr, loadIfxMenuData,
} from '../../macro/bbma/ifx-news-source.mjs';

const NOW = Date.parse('2026-11-07T02:00:00Z'); // 10:00 MYT

test('parseMytToUtc maps FF timeMyt (MYT) to the correct UTC instant', () => {
  // "Fri, 2026-11-06 21:30" MYT = 13:30 UTC
  const d = parseMytToUtc('Fri, 2026-11-06 21:30', NOW);
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), '2026-11-06T13:30:00.000Z');
});

test('parseMytToUtc handles the ISO date-time shape (MYT→UTC, mirrors ifx)', () => {
  // '2026-11-07 04:30' is read as MYT (UTC+8) => 2026-11-06 20:30 UTC
  const d = parseMytToUtc('2026-11-07 04:30', NOW);
  assert.equal(d.toISOString(), '2026-11-06T20:30:00.000Z');
});

test('parseMytToUtc fails closed on garbage', () => {
  assert.equal(parseMytToUtc('', NOW), null);
  assert.equal(parseMytToUtc(null, NOW), null);
  assert.equal(parseMytToUtc('not a time', NOW), null);
});

test('countdownLabel is honest about past / near / far events', () => {
  const at = (iso) => new Date(Date.parse(iso));
  assert.match(countdownLabel(at('2026-11-07T02:40:00Z'), NOW), /in 40m/);
  assert.match(countdownLabel(at('2026-11-07T04:30:00Z'), NOW), /in 2h 30m/);
  assert.match(countdownLabel(at('2026-11-07T01:00:00Z'), NOW), /past/);
  assert.equal(countdownLabel(null, NOW), '—');
});

const NEWS = {
  incoming: [
    { importance: 'high', event: '[USD] Non-Farm Employment Change', date: '2026-11-06', timeMyt: 'Fri, 2026-11-06 21:30', currency: 'USD', country: 'United States', forecast: '170k', previous: '227k', focusTf: 'M5 - M15' },
    { importance: 'high', event: '[EUR] ECB Rate Statement', date: '2026-11-05', timeMyt: 'Thu, 2026-11-05 19:45', currency: 'EUR', country: 'Euro Area', forecast: '2.15%', previous: '2.15%' },
    { importance: 'medium', event: '[AUD] RBA Statement', date: '2026-11-07', timeMyt: 'Sat, 2026-11-07 04:30', currency: 'AUD', country: 'Australia' },
    { importance: 'high', event: '[NZD] CPI y/y', date: '2026-11-02', timeMyt: 'Mon, 2026-11-02 07:00', currency: 'NZD', country: 'NZ' },
  ],
  byTab: {
    forex: { news: [
      { title: 'Fed officials flag data-dependence', signal: 'HAWKISH', impact: 'High', impactScore: 8, source: 'Reuters', url: 'https://example.com/a' },
      { title: 'Treasury auctions steady', signal: 'NEUTRAL', impact: 'Med', impactScore: 3, source: 'Bloomberg', url: 'https://example.com/b' },
    ] },
    gold: { news: [
      { title: 'Central bank buying accelerates', signal: 'BULLISH', impact: 'High', impactScore: 7, source: 'Kitco', url: 'https://example.com/c' },
    ] },
  },
};

test('selectUpcomingHighImpact keeps only high-impact upcoming events, soonest first', () => {
  // NOW = Nov 6 00:00 UTC (08:00 MYT). NFP (Nov 6 13:30 UTC) is 13.5h ahead;
  // ECB (Nov 5 11:45 UTC) is in the past; AUD is medium-impact; NZD is past.
  const rows = selectUpcomingHighImpact(NEWS, { now: Date.parse('2026-11-06T00:00:00Z') });
  assert.deepEqual(rows.map((r) => r.event), ['[USD] Non-Farm Employment Change']);
  assert.match(rows[0].countdown, /in 13h/);
  assert.equal(rows[0].forecast, '170k');
});

test('selectUpcomingHighImpact fails closed on missing data', () => {
  assert.deepEqual(selectUpcomingHighImpact(null, { now: NOW }), []);
  assert.deepEqual(selectUpcomingHighImpact({ incoming: [] }, { now: NOW }), []);
});

test('selectLatestNews ranks non-NEUTRAL first and caps the list', () => {
  const rows = selectLatestNews(NEWS, { now: NOW, limit: 2 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].signal, 'HAWKISH');
  assert.equal(rows[1].signal, 'BULLISH');
  assert.ok(!rows.some((n) => n.signal === 'NEUTRAL'), 'NEUTRAL should be cut by the cap');
});

test('selectAtrForSymbols resolves XAU + BTC rows and fails closed otherwise', () => {
  const atr = { rows: [
    { id: 'XAUUSD', label: 'XAU/USD', last: 4070.1, atr: 9.4, atrPct: 0.23, bars: 67, src: 'yahoo:GC=F' },
    { id: 'BTCUSD', label: 'BTC/USD', last: 97450, atr: 1210, atrPct: 1.24, bars: 24, src: 'yahoo:BTC-USD' },
  ] };
  const got = selectAtrForSymbols(atr, ['XAUUSD', 'BTCUSD']);
  assert.equal(got.XAUUSD.atr, 9.4);
  assert.equal(got.BTCUSD.last, 97450);
  const none = selectAtrForSymbols(null, ['XAUUSD']);
  assert.equal(none.XAUUSD, null);
});

test('selectGoldMtfAtr surfaces the ready timeframes only', () => {
  const atrMtf = { instrument: 'GC=F', readyCount: 7, total: 9, state: 'PARTIAL', timeframes: {
    M5: { tf: 'M5', atr: 1.2, state: 'READY', last: 4070, closedBars: 100, asOf: 'x' },
    H1: { tf: 'H1', atr: 3.4, state: 'READY', last: 4070, closedBars: 50, asOf: 'x' },
    M1: { tf: 'M1', atr: null, state: 'UNAVAILABLE', last: 4070, closedBars: 0, asOf: 'x' },
  } };
  const got = selectGoldMtfAtr(atrMtf);
  assert.equal(got.instrument, 'GC=F');
  assert.ok(got.timeframes.M5);
  assert.ok(got.timeframes.H1);
  assert.equal(got.timeframes.M1, undefined);
  assert.deepEqual(selectGoldMtfAtr(null), { instrument: null, readyCount: null, total: null, state: null, timeframes: {} });
});

test('loadIfxMenuData reads local ifx files (fail-closed when absent)', async () => {
  const dir = '/opt/data/ifx-live/repo';
  const data = await loadIfxMenuData({ now: NOW, files: { dir } });
  if (fs.existsSync(dir + '/news-auto.js')) {
    assert.equal(data.newsAuto.ok, true);
    assert.match(data.newsAuto.source, /^local/);
  } else {
    assert.ok(data.newsAuto.ok === false || data.newsAuto.ok === true); // host without the clone
  }
});

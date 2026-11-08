import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

test('production index renders the 16-symbol board ONCE (no redundant re-slices)', () => {
  // The full board host is the single source of truth, shown on OVERVIEW + BOARD.
  assert.match(html, /data-view-section="BRIEF MARKET BOARD"><article class="panel span-2">[^<]*<div class="section-head"><div><div class="eyebrow">MARKET BOARD/);
  assert.match(html, /id="market-board"/);
  // The per-slice hosts remain for the renderMarketBoard view→host contract,
  // but FX / METALS / DIGITAL ASSETS are no longer nav views (they were the
  // redundant re-slices of the same 16 daily closes Anam asked to compact).
  for (const id of ['market-board-fx', 'market-board-metals', 'market-board-digital']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing legacy host ${id}`);
  }
  for (const v of ['FX', 'METALS', 'DIGITAL ASSETS']) {
    assert.doesNotMatch(html, new RegExp(`data-view="${v}">`), `view ${v} still has a nav button (redundant board slice)`);
  }
  assert.match(html, /MARKET BOARD/);
  assert.match(html, /DAILY CLOSE/);
});

test('production index surfaces macro + pivot levels + sentiment (previously hidden)', () => {
  assert.match(html, /id="macro-panel"/);
  assert.match(html, /id="pivot-table"/);
  assert.match(html, /id="sentiment-label"/);
  assert.match(html, /id="next-event"/);
  assert.match(html, /id="latest-news-title"/);
});

test('production index no longer claims FX or BTC/ETH prices are absent from the snapshot', () => {
  assert.doesNotMatch(html, /Live\/event-aligned FX prices are not in the current daily snapshot/);
  assert.doesNotMatch(html, /Current daily snapshot does not include BTC\/ETH prices/);
});

test('production index keeps the VEYRA/HELIX production identity and script surface', () => {
  assert.match(html, /VEYRA/);
  assert.match(html, /Powered by HELIX/);
  assert.match(html, /xauusd-data\.js/);
  assert.match(html, /macro\/ui\/app\.mjs/);
});

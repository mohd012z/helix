import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

test('production index exposes market board hosts scoped to their own views', () => {
  for (const id of ['market-board', 'market-board-fx', 'market-board-metals', 'market-board-digital']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing host ${id}`);
  }
  assert.match(html, /data-view-section="BRIEF"><article class="panel span-2">[^<]*<div class="section-head"><div><div class="eyebrow">MARKET BOARD/);
  assert.match(html, /data-view-section="FX"><article class="panel span-2">[^<]*<div class="section-head"><div><div class="eyebrow">MARKET BOARD/);
  assert.match(html, /data-view-section="METALS"><article class="panel span-2">[^<]*<div class="section-head"><div><div class="eyebrow">MARKET BOARD/);
  assert.match(html, /data-view-section="DIGITAL ASSETS"><article class="panel span-2">[^<]*<div class="section-head"><div><div class="eyebrow">MARKET BOARD/);
  assert.match(html, /MARKET BOARD/);
  assert.match(html, /DAILY CLOSE/);
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

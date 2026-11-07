import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM shim (same pattern as market-board-render.test.mjs): stub `window`
// but NOT a real `document`, so app.mjs's top-level browser check stays false
// and boot() never runs — only the exported compact renderers are exercised.
function makeEl() {
  const el = { children: [], className: '', textContent: '', style: {}, _innerHTML: '' };
  el.appendChild = c => { el.children.push(c); return c; };
  el.append = (...cs) => { el.children.push(...cs); };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._innerHTML,
    set: v => { el._innerHTML = String(v); el.children = [];
      const re = /class="([\w-]+)"/g; let m;
      while ((m = re.exec(String(v))) !== null) { const c = makeEl(); c.className = m[1]; el.children.push(c); } }
  });
  return el;
}

const hosts = {};
for (const id of ['macro-panel', 'pivot-table', 'sentiment-label', 'sentiment-meta', 'next-event', 'next-event-meta', 'latest-news-title', 'latest-news-meta']) hosts[id] = makeEl();
globalThis.window = {};
globalThis.document = { querySelector: sel => (sel && sel.startsWith('#') ? hosts[sel.slice(1)] ?? makeEl() : makeEl()), createElement: () => makeEl(), readyState: 'loading', addEventListener: () => {} };

const { renderMacroPanel, renderPivotTable, renderHeroExtras } = await import('../../macro/ui/app.mjs');

test('renderMacroPanel shows DXY / US 10Y / Brent from the snapshot (no longer hidden)', () => {
  renderMacroPanel({ macro: [
    { label: 'DXY', value: '102.28', delta: '-0.02%', tone: 'bad' },
    { label: 'US 10Y', value: '4.859%', delta: '+0.46%', tone: 'good' },
    { label: 'Brent', value: '98.32', delta: '+0.03%', tone: '' },
  ] });
  const host = hosts['macro-panel'];
  assert.equal(host.className, 'mini-table');
  const dataRows = host.children.filter(c => c.children.length);
  const labels = dataRows.map(c => c.children[0].textContent);
  assert.ok(labels.includes('DXY'));
  assert.ok(labels.includes('US 10Y'));
  assert.ok(labels.includes('Brent'));
  const dxyRow = dataRows.find(c => c.children[0].textContent === 'DXY');
  assert.match(dxyRow.children[1].textContent, /102\.28 -0\.02%/);
});

test('renderMacroPanel fails closed (honest empty state, no fabricated rows)', () => {
  renderMacroPanel({ macro: null });
  const host = hosts['macro-panel'];
  assert.equal(host.className, 'empty-state');
  assert.match(host.textContent, /No macro data/);
});

test('renderPivotTable renders R4..R1 / C / S1..S4 around the last close', () => {
  renderPivotTable({
    levels: { resistance: [4109.9, 4156.48, 4190.13, 4197.13], support: [4022.67, 3982.01, 3935.44, 3866.02], note: 'Classic pivot levels.' },
    instruments: { 'XAU/USD': { price: 4066.02 } },
  });
  const host = hosts['pivot-table'];
  assert.equal(host.className, 'mini-table');
  const dataRows = host.children.filter(c => c.children.length);
  const labels = dataRows.map(c => c.children[0].textContent);
  // R4..R1 descending above close, C, then S1..S4 below.
  assert.deepEqual(labels, ['R4', 'R3', 'R2', 'R1', 'C (last close)', 'S1', 'S2', 'S3', 'S4']);
  const r4 = dataRows.find(c => c.children[0].textContent === 'R4');
  assert.match(r4.children[1].textContent, /4,197\.13/);
  const cRow = dataRows.find(c => c.children[0].textContent === 'C (last close)');
  assert.match(cRow.children[1].textContent, /4,066\.02/);
});

test('renderPivotTable fails closed when there are no levels', () => {
  renderPivotTable({ levels: null, instruments: { 'XAU/USD': { price: 4066 } } });
  assert.equal(hosts['pivot-table'].className, 'empty-state');
});

test('renderHeroExtras fills sentiment / next event / latest news (and falls back honestly)', () => {
  renderHeroExtras({
    sentiment: { bias: 'UPWARD', goldTone: 'BULLISH', score: 0.417, confidence: 69 },
    events: [],
    news: [{ title: 'Gold set for weekly gain', time: '2026-11-06 02:06 UTC' }],
  });
  assert.equal(hosts['sentiment-label'].textContent, 'BULLISH • UPWARD');
  assert.match(hosts['sentiment-meta'].textContent, /confidence 69%/);
  assert.equal(hosts['next-event'].textContent, 'No upcoming event in the snapshot');
  assert.equal(hosts['latest-news-title'].textContent, 'Gold set for weekly gain');
});

test('renderHeroExtras falls back when sentiment + news are absent', () => {
  renderHeroExtras({ sentiment: null, events: [], news: [] });
  assert.equal(hosts['sentiment-label'].textContent, '—');
  assert.equal(hosts['latest-news-title'].textContent, 'No sourced news in the snapshot');
});

import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM shim, installed BEFORE app.mjs loads. We stub `window` but NOT
// global `document`, so app.mjs's top-level browser check stays false and
// boot() never runs — only renderMarketBoard is exercised.
function makeEl() {
  const el = { children: [], className: '', textContent: '', _innerHTML: '' };
  el.appendChild = c => { el.children.push(c); return c; };
  el.querySelectorAll = sel => {
    const m = String(sel).match(/^\./);
    const wanted = m ? String(sel).slice(1) : null;
    const out = [];
    const walk = node => node.children.forEach(c => {
      if (!wanted || String(c.className).split(/\s+/).includes(wanted)) out.push(c);
      walk(c);
    });
    walk(el);
    return out;
  };
  el.querySelector = sel => {
    const m = String(sel).match(/^\.([\w-]+)$/);
    const name = m ? m[1] : sel;
    const found = el.children.find(c => c.className === name);
    if (found) return found;
    const child = makeEl(); child.className = name; el.children.push(child); return child;
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._innerHTML,
    set: v => {
      el._innerHTML = String(v);
      el.children = [];
      const re = /class="([\w-]+)"/g; let m;
      while ((m = re.exec(String(v))) !== null) { const c = makeEl(); c.className = m[1]; el.children.push(c); }
    }
  });
  return el;
}

const hosts = {};
for (const id of ['market-board', 'market-board-fx', 'market-board-metals', 'market-board-digital']) hosts[id] = makeEl();

globalThis.window = {};
globalThis.document = { querySelector: sel => (sel && sel.startsWith('#') ? hosts[sel.slice(1)] ?? makeEl() : makeEl()), createElement: () => makeEl(), readyState: 'loading', addEventListener: () => {} };

const { renderMarketBoard } = await import('../../macro/ui/app.mjs');

const board = {
  priceType: 'DAILY_CLOSE',
  symbols: {
    'EUR/USD': { symbol: 'EUR/USD', assetClass: 'fx', group: 'major', ok: true, last: 1.1842, changePct: -0.21, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'USD/JPY': { symbol: 'USD/JPY', assetClass: 'fx', group: 'major', ok: true, last: 151.342, changePct: 0.42, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'EUR/JPY': { symbol: 'EUR/JPY', assetClass: 'fx', group: 'minor', ok: true, last: 179.22, changePct: 0.21, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'XAU/USD': { symbol: 'XAU/USD', assetClass: 'metal', group: 'metal', ok: true, last: 4327.23, changePct: 0.78, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'XAG/USD': { symbol: 'XAG/USD', assetClass: 'metal', group: 'metal', ok: false, last: null, changePct: null, barDate: null, detail: '404' },
    'BTC/USD': { symbol: 'BTC/USD', assetClass: 'digital', group: 'digital', ok: true, last: 91234.5, changePct: 2.31, barDate: '2026-10-17', detail: 'provider bar 2026-10-17' },
    'ETH/USD': { symbol: 'ETH/USD', assetClass: 'digital', group: 'digital', ok: false, last: null, changePct: null, barDate: null, detail: '429 rate limited' }
  }
};

function rowsOf(host) { return host.querySelectorAll('.market-board-row'); }
function rowTexts(host) { return rowsOf(host).map(r => r.querySelector('.mb-symbol').textContent); }

test('BRIEF board renders every group with per-group rows only', () => {
  renderMarketBoard({ board });
  const brief = hosts['market-board'];
  const groups = brief.querySelectorAll('.market-board-group');
  assert.equal(groups.length, 4);
  assert.equal(rowTexts(brief).length, 7, 'all seven symbols once each');
  assert.ok(rowTexts(brief).includes('EUR/USD'));
  assert.ok(rowTexts(brief).includes('XAU/USD'));
});

test('FX board shows only fx groups; METALS and DIGITAL boards are scoped', () => {
  renderMarketBoard({ board });
  assert.deepEqual(rowTexts(hosts['market-board-fx']).sort(), ['EUR/JPY', 'EUR/USD', 'USD/JPY']);
  assert.deepEqual(rowTexts(hosts['market-board-metals']), ['XAG/USD', 'XAU/USD']);
  assert.deepEqual(rowTexts(hosts['market-board-digital']).sort(), ['BTC/USD', 'ETH/USD']);
});

test('failed symbols render UNAVAILABLE with the provider detail', () => {
  renderMarketBoard({ board });
  const rows = rowsOf(hosts['market-board-digital']);
  const eth = rows.find(r => r.querySelector('.mb-symbol').textContent === 'ETH/USD');
  assert.match(eth.className, /tone-unavailable/);
  assert.equal(eth.querySelector('.mb-price').textContent, '—');
  assert.equal(eth.querySelector('.mb-detail').textContent, '429 rate limited');
  const btc = rows.find(r => r.querySelector('.mb-symbol').textContent === 'BTC/USD');
  assert.match(btc.className, /tone-up/);
  assert.equal(btc.querySelector('.mb-change').textContent, '+2.31%');
});

test('missing board renders an honest empty state on every host', () => {
  renderMarketBoard({ board: null });
  for (const host of Object.values(hosts)) {
    assert.equal(host.querySelectorAll('.empty-state').length, 1);
    assert.equal(rowsOf(host).length, 0);
  }
});

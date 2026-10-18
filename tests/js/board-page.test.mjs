import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const html = fs.readFileSync('board.html', 'utf8');

test('board.html is a self-contained static page (no module/CSS deps to fetch)', () => {
  // loads only the daily snapshot script; no ES-module app.mjs, no external css
  assert.match(html, /<script src="\.\/xauusd-data\.js"><\/script>/);
  assert.doesNotMatch(html, /macro\/ui\/app\.mjs/);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /<link[^>]*stylesheet/);
});

test('board.html renders from the snapshot contract, not a hardcoded board', () => {
  assert.match(html, /global\.XAUUSD_DATA/);
  assert.match(html, /XAUUSD_DATA/);
  // honest states: unavailable + no-board fallback
  assert.match(html, /UNAVAILABLE/);
  assert.match(html, /no market board yet/);
  // freshness is computed from the snapshot, not assumed
  assert.match(html, /freshness/);
});

test('board.html exposes the four desk groups and daily-close semantics', () => {
  for (const g of ['FX MAJORS', 'FX MINORS / CROSSES', 'METALS', 'DIGITAL ASSETS']) assert.match(html, new RegExp(g.replace('/', '\\/')));
  assert.match(html, /DAILY CLOSE/);
});

test('board.html inline script is syntactically valid', () => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'expected an inline script block');
  // node --check on the extracted IIFE
  execFileSync(process.execPath, ['--check', '--input-type=commonjs'], { input: m[1], stdio: 'pipe' });
});

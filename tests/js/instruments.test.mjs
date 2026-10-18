import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, getPipSize, getInstrument, getPriceDigits, listBoardSymbols, MARKET_BOARD_GROUPS } from '../../macro/core/instruments.mjs';

test('brand and pip metadata are canonical', () => {
  assert.equal(BRAND.name, 'MACRO//DESK');
  assert.equal(getPipSize('EUR/USD'), 0.0001);
  assert.equal(getPipSize('USD/JPY'), 0.01);
  assert.equal(getInstrument('XAU/USD').assetClass, 'metal');
  assert.equal(getInstrument('BTC/USD').assetClass, 'digital');
});

test('board groups and price digits are canonical per asset class', () => {
  assert.deepEqual(MARKET_BOARD_GROUPS.map(g => g.id), ['major', 'minor', 'metal', 'digital']);
  assert.equal(getInstrument('EUR/GBP').group, 'minor');
  assert.equal(getInstrument('XAG/USD').group, 'metal');
  assert.equal(getInstrument('XAG/USD').tickSize, 0.001);
  assert.equal(getPriceDigits('EUR/USD'), 5);
  assert.equal(getPriceDigits('USD/JPY'), 3);
  assert.equal(getPriceDigits('XAU/USD'), 2);
  assert.equal(getPriceDigits('XAG/USD'), 3);
  assert.equal(getPriceDigits('BTC/USD'), 2);
  assert.equal(getPriceDigits('NOPE/XYZ'), 2);
  assert.equal(getInstrument('NOT/A PAIR'), null);
});

test('listBoardSymbols filters by group and is deterministic', () => {
  const all = listBoardSymbols();
  assert.equal(new Set(all).size, all.length, 'no duplicate symbols');
  assert.deepEqual(all, [...all].sort((a, b) => a.localeCompare(b)));
  assert.ok(listBoardSymbols('major').every(s => getInstrument(s).group === 'major'));
  assert.equal(listBoardSymbols('unknown').length, 0);
});

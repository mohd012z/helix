import { MARKET_BOARD_GROUPS, getPriceDigits } from '../core/instruments.mjs';

/**
 * Market board: daily reference closes for FX majors, FX minors/crosses,
 * metals and digital assets, as published in `snapshot.board.symbols`.
 *
 * Board entries are provider daily closes (DAILY_CLOSE semantics) — never a
 * live quote. Unavailable symbols render as UNAVAILABLE with the provider
 * detail; nothing is fabricated or substituted. Pure module: DOM-free so it
 * runs under node --test.
 */

export function boardSymbols(board = {}) {
  return board && typeof board === 'object' && typeof board.symbols === 'object' && board.symbols !== null
    ? board.symbols
    : {};
}

function formatPrice(symbol, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: getPriceDigits(symbol), maximumFractionDigits: getPriceDigits(symbol) });
}

function formatChangePct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return { text: `${n > 0 ? '+' : ''}${n.toFixed(2)}%`, tone: n > 0 ? 'up' : n < 0 ? 'down' : 'flat' };
}

export function formatBoardRow(symbol, entry = null) {
  if (!entry || entry.ok !== true || entry.last == null) {
    return { symbol, state: 'UNAVAILABLE', price: '—', change: null, detail: entry && entry.detail ? String(entry.detail) : 'Not in current snapshot' };
  }
  return {
    symbol,
    state: 'OK',
    price: formatPrice(symbol, entry.last),
    change: formatChangePct(entry.changePct),
    detail: entry.barDate ? `provider bar ${entry.barDate}` : 'provider daily bar'
  };
}

/**
 * Build the visible groups for a view. 'BRIEF' shows everything,
 * FX shows majors+minors, METALS shows metals, DIGITAL ASSETS shows digital.
 */
export function buildBoardGroups(view, board = {}) {
  const visible = new Set();
  if (view === 'BRIEF') {
    MARKET_BOARD_GROUPS.forEach(g => visible.add(g.id));
  } else if (view === 'FX') {
    visible.add('major'); visible.add('minor');
  } else if (view === 'METALS') {
    visible.add('metal');
  } else if (view === 'DIGITAL ASSETS') {
    visible.add('digital');
  } else {
    return [];
  }
  const symbols = boardSymbols(board);
  return MARKET_BOARD_GROUPS
    .filter(g => visible.has(g.id))
    .map(g => {
      const rows = Object.keys(symbols)
        .filter(symbol => symbols[symbol] && symbols[symbol].symbol === symbol && symbols[symbol].group === g.id)
        .sort((a, b) => a.localeCompare(b))
        .map(symbol => formatBoardRow(symbol, symbols[symbol]));
      return { group: g.id, label: g.label, rows };
    })
    .filter(g => g.rows.length > 0);
}

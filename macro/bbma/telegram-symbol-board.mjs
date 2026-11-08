/* BBMA Telegram symbol selection + dashboard keyboard.
 *
 * Pure builders (no network, no fs): map the desk board (xauusd-data.js
 * `board.symbols`) into Telegram inline-keyboard rows and resolve a tapped
 * symbol to its BBMA observation (when one exists — currently XAU/USD only).
 * Fail-closed: an empty/unknown board yields a dashboard-only row.
 */

const DASHBOARD_DEFAULT = 'https://mohd012z.github.io/helix/';

export function normalizeSymbolKey(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** byId: Map(normalizedKey -> observation). Returns the obs for the symbol or null. */
export function findObservationBySymbol(byId, symbol) {
  const row = byId?.get(normalizeSymbolKey(symbol));
  return row ?? null;
}

/**
 * rows: board.symbols object (symbol -> {symbol, ok, last, changePct}).
 * Returns the keyboard row: [📈 BBMA Dashboard] + up to 3 symbol buttons.
 * `pinned` symbols are placed first (in pinned order, only if present on the
 * board); remaining slots fill from board order. A symbol button carries
 * bbma:status:<SYMBOL> so a tap re-answers the status card for THAT symbol.
 */
export function buildDashboardRow({rows = {}, pinned = null, dashboardUrl = DASHBOARD_DEFAULT} = {}) {
  const pinList = (Array.isArray(pinned) ? pinned : ['XAUUSD', 'BTCUSD']).map(normalizeSymbolKey).filter(Boolean);
  const row = [{text: '📈 BBMA Dashboard', url: dashboardUrl ?? DASHBOARD_DEFAULT}];
  const byKey = new Map();
  for (const value of Object.values(rows ?? {})) {
    if (!value) continue;
    const key = normalizeSymbolKey(value.symbol);
    if (key) byKey.set(key, value);
  }
  const seen = new Set();
  const add = (value) => {
    if (row.length >= 4) return;
    if (!value || value.ok === false) return;
    const key = normalizeSymbolKey(value.symbol);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const pct = Number.isFinite(value.changePct) ? ` ${value.changePct > 0 ? '+' : ''}${value.changePct}%` : '';
    row.push({text: `📊 ${value.symbol}${pct}`, callback_data: `bbma:status:${value.symbol}`});
  };
  // 1) pinned symbols first (XAUUSD, BTCUSD)
  for (const p of pinList) add(byKey.get(p));
  // 2) fill remaining slots from board order
  for (const value of Object.values(rows ?? {})) add(value);
  return row;
}

/** Map(normalizedKey -> {symbol, ok, last, changePct}) for board rows, board order. */
export function buildSymbolLookup(rows = {}) {
  const map = new Map();
  for (const value of Object.values(rows ?? {})) {
    if (!value) continue;
    const key = normalizeSymbolKey(value.symbol);
    if (!key) continue;
    map.set(key, Object.freeze({symbol: String(value.symbol), ok: value.ok !== false, last: value.last, changePct: value.changePct}));
  }
  return map;
}

/** Resolve a symbol (or observation id) to its board row via normalized key. */
export function findBoardSymbol(lookup, symbol) {
  return lookup?.get(normalizeSymbolKey(symbol)) ?? null;
}

export function dashboardCallbackData() {
  return 'bbma:dashboard';
}

/** Inline keyboard for a status/dashboard card; [] when the board is empty. */
export function buildBbmaKeyboard({rows = {}, pinned = null, dashboardUrl = DASHBOARD_DEFAULT} = {}) {
  const row = buildDashboardRow({rows, pinned, dashboardUrl});
  return row.length ? [row] : [];
}

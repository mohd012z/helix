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
 * Returns the keyboard row: [📈 BBMA Dashboard] + up to 3 symbol buttons
 * (primary symbol first). Symbol buttons carry bbma:status:<SYMBOL> so a tap
 * re-answers the status card for THAT symbol.
 */
export function buildDashboardRow({rows = {}, primarySymbol = 'XAUUSD', dashboardUrl = DASHBOARD_DEFAULT} = {}) {
  const row = [{text: '📈 BBMA Dashboard', url: dashboardUrl ?? DASHBOARD_DEFAULT}];
  const primaryKey = normalizeSymbolKey(primarySymbol);
  const seen = new Set([primaryKey]);
  for (const value of Object.values(rows ?? {})) {
    if (row.length >= 4) break;
    if (!value || value.ok === false) continue;
    const sym = String(value.symbol ?? '');
    const key = normalizeSymbolKey(sym);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const pct = Number.isFinite(value.changePct) ? ` ${value.changePct > 0 ? '+' : ''}${value.changePct}%` : '';
    row.push({text: `📊 ${sym}${pct}`, callback_data: `bbma:status:${sym}`});
  }
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
export function buildBbmaKeyboard({rows = {}, primarySymbol = 'XAUUSD', dashboardUrl = DASHBOARD_DEFAULT} = {}) {
  const row = buildDashboardRow({rows, primarySymbol, dashboardUrl});
  return row.length ? [row] : [];
}

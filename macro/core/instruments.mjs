export const BRAND = {
  name: 'MACRO//DESK',
  subtitle: 'FX • Metals • Digital Assets Event Intelligence'
};

export const NAV_ITEMS = ['BRIEF', 'EVENTS', 'METALS', 'FX', 'DIGITAL ASSETS'];

export const INSTRUMENTS = {
  // FX majors
  'EUR/USD': { symbol: 'EUR/USD', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  'GBP/USD': { symbol: 'GBP/USD', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  'USD/JPY': { symbol: 'USD/JPY', assetClass: 'fx', group: 'major', pipSize: 0.01, priceDigits: 3 },
  'USD/CHF': { symbol: 'USD/CHF', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  'AUD/USD': { symbol: 'AUD/USD', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  'USD/CAD': { symbol: 'USD/CAD', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  'NZD/USD': { symbol: 'NZD/USD', assetClass: 'fx', group: 'major', pipSize: 0.0001, priceDigits: 5 },
  // FX minors / common crosses
  'EUR/GBP': { symbol: 'EUR/GBP', assetClass: 'fx', group: 'minor', pipSize: 0.0001, priceDigits: 5 },
  'EUR/JPY': { symbol: 'EUR/JPY', assetClass: 'fx', group: 'minor', pipSize: 0.01, priceDigits: 3 },
  'GBP/JPY': { symbol: 'GBP/JPY', assetClass: 'fx', group: 'minor', pipSize: 0.01, priceDigits: 3 },
  'AUD/JPY': { symbol: 'AUD/JPY', assetClass: 'fx', group: 'minor', pipSize: 0.01, priceDigits: 3 },
  'EUR/AUD': { symbol: 'EUR/AUD', assetClass: 'fx', group: 'minor', pipSize: 0.0001, priceDigits: 5 },
  // Metals
  'XAU/USD': { symbol: 'XAU/USD', assetClass: 'metal', group: 'metal', tickSize: 0.01, priceDigits: 2 },
  'XAG/USD': { symbol: 'XAG/USD', assetClass: 'metal', group: 'metal', tickSize: 0.001, priceDigits: 3 },
  // Digital assets
  'BTC/USD': { symbol: 'BTC/USD', assetClass: 'digital', group: 'digital', priceDigits: 2 },
  'ETH/USD': { symbol: 'ETH/USD', assetClass: 'digital', group: 'digital', priceDigits: 2 }
};

// Display ordering for the market board: grouped, then symbol order inside the group.
export const MARKET_BOARD_GROUPS = [
  { id: 'major', label: 'FX MAJORS' },
  { id: 'minor', label: 'FX MINORS / CROSSES' },
  { id: 'metal', label: 'METALS' },
  { id: 'digital', label: 'DIGITAL ASSETS' }
];

export function getInstrument(symbol) {
  return INSTRUMENTS[symbol] || null;
}

export function getPipSize(symbol) {
  return getInstrument(symbol)?.pipSize ?? null;
}

export function getPriceDigits(symbol) {
  const meta = getInstrument(symbol);
  if (!meta) return 2;
  return meta.priceDigits ?? (meta.assetClass === 'fx' ? 5 : 2);
}

export function listBoardSymbols(group = null) {
  return Object.values(INSTRUMENTS)
    .filter(m => !group || m.group === group)
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map(m => m.symbol);
}

import { INSTRUMENTS } from '../core/instruments.mjs';

function nullable(value) {
  return value === undefined || value === null ? null : value;
}

function instrumentView(symbol, price = null, extras = {}) {
  const meta = INSTRUMENTS[symbol];
  return {
    symbol,
    assetClass: meta?.assetClass ?? null,
    price: nullable(price),
    ...extras
  };
}

export function adaptSnapshot(snapshot = {}) {
  const meta = snapshot.meta ?? {};
  const price = snapshot.price ?? {};
  const sources = Array.isArray(snapshot.sources) ? snapshot.sources.slice() : [];
  const calendar = Array.isArray(snapshot.calendar) ? snapshot.calendar.slice() : [];
  const normalizedPrice = nullable(price.latestDailyClose) ?? nullable(price.spot);

  return {
    status: 'SNAPSHOT',
    updatedAt: nullable(meta.generatedAt) ?? nullable(snapshot.updated),
    verified: meta.verified === true,
    instruments: {
      'XAU/USD': instrumentView('XAU/USD', normalizedPrice, {
        priceType: nullable(price.priceType) ?? (String(meta.cadence).toLowerCase() === 'daily' ? 'DAILY_CLOSE' : null),
        change: nullable(price.change),
        changePct: nullable(price.changePct),
        dayRange: nullable(price.dayRange),
        rollingHigh: nullable(price.rollingHigh),
        rollingWindowBars: nullable(price.rollingWindowBars)
      }),
      'EUR/USD': instrumentView('EUR/USD'),
      'GBP/USD': instrumentView('GBP/USD'),
      'USD/JPY': instrumentView('USD/JPY'),
      'BTC/USD': instrumentView('BTC/USD'),
      'ETH/USD': instrumentView('ETH/USD')
    },
    events: calendar,
    news: Array.isArray(snapshot.news) ? snapshot.news.slice() : [],
    speakers: Array.isArray(snapshot.speakers) ? snapshot.speakers.slice() : [],
    board: snapshot.board && typeof snapshot.board === 'object' ? snapshot.board : null,
    sourceStatus: meta.sourceStatus ?? {},
    sources
  };
}

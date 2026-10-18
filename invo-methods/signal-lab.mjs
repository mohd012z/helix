/**
 * HELIX Signal Lab: deterministic, read-only inspection of untrusted social signals.
 * This module intentionally has no network, wallet, order, token, or storage APIs.
 */
export const MAX_INPUT_BYTES = 1_000_000;
export const MAX_RECORDS = 1_000;
const MAX_AGE_MS = 15 * 60 * 1000;
const ACTIONS = new Set(['open', 'increase', 'close']);
const SIDES = new Set(['long', 'short']);

export function parseInput(raw) {
  if (typeof raw !== 'string') throw new TypeError('Input must be text.');
  if (new TextEncoder().encode(raw).length > MAX_INPUT_BYTES) throw new RangeError('Input exceeds 1 MB.');
  const text = raw.trim();
  if (!text) return [];
  let entries;
  try {
    const parsed = JSON.parse(text);
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    entries = text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new SyntaxError(`Invalid JSON on non-empty line ${index + 1}.`); }
    });
  }
  if (entries.length > MAX_RECORDS) throw new RangeError('Maximum 1,000 records per analysis.');
  return entries;
}

function positiveNumber(value, maximum) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= maximum ? number : null;
}

function normalize(raw, nowMs, maxAgeMs) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'signal') {
    return { reason: 'NOT_A_SIGNAL' };
  }
  const id = raw.postId;
  const action = raw.action;
  const symbol = raw.trade?.coin;
  const side = raw.trade?.side;
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id)) return { reason: 'INVALID_ID' };
  if (!ACTIONS.has(action)) return { reason: 'INVALID_ACTION' };
  if (typeof symbol !== 'string' || !/^[A-Za-z0-9._-]{1,24}$/.test(symbol)) return { reason: 'INVALID_ASSET' };
  if (!SIDES.has(side)) return { reason: 'INVALID_SIDE' };
  const leverage = raw.trade?.leverage == null ? null : positiveNumber(raw.trade.leverage, 500);
  if (raw.trade?.leverage != null && leverage == null) return { reason: 'INVALID_LEVERAGE' };
  const price = raw.trade?.entryPrice == null ? null : positiveNumber(raw.trade.entryPrice, 1e15);
  if (raw.trade?.entryPrice != null && price == null) return { reason: 'INVALID_PRICE' };
  const observedAt = raw.observedAt ?? raw.timestamp ?? null;
  let freshness = 'UNKNOWN_TIME';
  if (observedAt != null) {
    const timestamp = typeof observedAt === 'string' ? Date.parse(observedAt) : NaN;
    if (!Number.isFinite(timestamp)) freshness = 'INVALID_TIME';
    else if (timestamp > nowMs + 60_000) freshness = 'FUTURE_TIME';
    else if (nowMs - timestamp > maxAgeMs) freshness = 'STALE';
    else freshness = 'RECENT_BY_DEVICE_CLOCK';
  }
  return {
    signal: {
      id, action, symbol: symbol.toUpperCase(), side, leverage, price,
      owner: typeof raw.owner?.username === 'string' ? raw.owner.username.slice(0, 80) : 'Unknown',
      freshness, provenance: 'UNVERIFIED_USER_SUPPLIED_DATA',
    },
  };
}

export function analyzeRecords(records, { nowMs = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  if (!Array.isArray(records)) throw new TypeError('Records must be an array.');
  if (records.length > MAX_RECORDS) throw new RangeError('Maximum 1,000 records per analysis.');
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new RangeError('Invalid clock or freshness threshold.');
  }
  const seen = new Set();
  const signals = [];
  const rejected = {};
  let duplicates = 0;
  for (const record of records) {
    const { signal, reason } = normalize(record, nowMs, maxAgeMs);
    if (reason) { rejected[reason] = (rejected[reason] ?? 0) + 1; continue; }
    const key = `${signal.id}\u0000${signal.action}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    signals.push(signal);
  }
  return { total: records.length, accepted: signals.length, duplicates, rejected, signals };
}

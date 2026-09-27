import { buildBbmaFractalSnapshot } from './fractal-snapshot.mjs';

const ORDER = Object.freeze(['MN','W1','D1','H4','H1','M30','M15','M5']);
const SETUP_ORDER = Object.freeze(['D1','H4','H1','M30','M15','M5']);
const CONTEXT_ORDER = Object.freeze(['MN','W1']);
const VALID = new Set(['ALIGNED_BUY','ALIGNED_SELL','MIXED','NEUTRAL','INCOMPLETE']);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function normalizeTimeframes(source) {
  if (Array.isArray(source)) return source;
  if (source && typeof source === 'object') return Object.values(source);
  return null;
}

function buildHigherTimeframeContext(byTf, dir) {
  const unavailable = CONTEXT_ORDER.filter(k => {
    const item = byTf.get(k);
    return !item || item.status === 'INSUFFICIENT_DATA' || item.direction === 'INSUFFICIENT_DATA';
  });
  const available = CONTEXT_ORDER.filter(k => !unavailable.includes(k));
  const supporting = dir ? available.filter(k => byTf.get(k)?.direction === dir) : [];
  const opposing = dir === 'BUY' ? 'SELL' : dir === 'SELL' ? 'BUY' : null;
  const conflicts = opposing ? available.filter(k => byTf.get(k)?.direction === opposing || byTf.get(k)?.direction === 'CONFLICT') : [];

  let state = 'NEUTRAL';
  if (unavailable.length === CONTEXT_ORDER.length) state = 'UNAVAILABLE';
  else if (dir && conflicts.length && supporting.length) state = 'MIXED';
  else if (dir && conflicts.length) state = 'OPPOSED';
  else if (dir && supporting.length) state = 'ALIGNED';

  return { state, supporting_timeframes: supporting, conflict_timeframes: conflicts, unavailable_timeframes: unavailable };
}

export function evaluateBbmaConfluence({ evidence }) {
  const timeframes = normalizeTimeframes(evidence?.timeframes);
  if (!evidence || typeof evidence !== 'object' || !VALID.has(evidence.overall_state) || !timeframes || timeframes.some(item=>!item||typeof item!=='object'||!item.timeframe)) {
    throw new TypeError('valid BBMA MTF evidence is required');
  }
  const byTf = new Map(timeframes.map(item => [item.timeframe, item]));
  const dir = evidence.overall_state === 'ALIGNED_BUY' ? 'BUY' : evidence.overall_state === 'ALIGNED_SELL' ? 'SELL' : null;
  const support = dir ? ORDER.filter(k => byTf.get(k)?.direction === dir) : [];
  const opposing = dir ? (dir === 'BUY' ? 'SELL' : 'BUY') : null;
  const conflicts = SETUP_ORDER.filter(k => {
    const d = byTf.get(k)?.direction;
    return d === 'CONFLICT' || (opposing && d === opposing);
  });
  if (!dir && evidence.overall_state === 'MIXED') {
    const buys = SETUP_ORDER.filter(k => byTf.get(k)?.direction === 'BUY');
    const sells = SETUP_ORDER.filter(k => byTf.get(k)?.direction === 'SELL');
    conflicts.push(...SETUP_ORDER.filter(k => buys.includes(k) || sells.includes(k)));
  }

  const reasons = [];
  let readiness = 'OBSERVED';
  if (evidence.overall_state === 'INCOMPLETE' || evidence.status === 'INCOMPLETE') {
    readiness = 'BLOCKED'; reasons.push('INCOMPLETE_DATA');
  } else if (evidence.overall_state === 'MIXED') {
    readiness = 'BLOCKED'; reasons.push('DIRECTION_CONFLICT');
  } else if (dir) {
    const same = k => byTf.get(k)?.direction === dir;
    if (same('H4') && same('H1') && same('M15') && same('M5') && (!byTf.get('D1') || ['NEUTRAL',dir].includes(byTf.get('D1').direction))) readiness = 'CONFIRMABLE';
    else if (same('H4') && same('H1') && same('M15')) readiness = 'SETUP_READY';
    else if (same('H4') && SETUP_ORDER.slice(2).some(same)) readiness = 'WATCHABLE';
    reasons.push(`DIRECTION_${dir}`);
  } else reasons.push('NO_DIRECTIONAL_CONFLUENCE');

  const d1 = byTf.get('D1')?.direction;
  const lowerBuy = SETUP_ORDER.slice(1).filter(k => byTf.get(k)?.direction === 'BUY').length;
  const lowerSell = SETUP_ORDER.slice(1).filter(k => byTf.get(k)?.direction === 'SELL').length;
  if ((d1 === 'SELL' && lowerBuy > 0) || (d1 === 'BUY' && lowerSell > 0)) {
    readiness = 'BLOCKED';
    if (!conflicts.includes('D1')) conflicts.unshift('D1');
    reasons.push('HIGHER_TIMEFRAME_CONFLICT');
  }

  const higherTimeframeContext = buildHigherTimeframeContext(byTf, dir);
  if (higherTimeframeContext.state === 'OPPOSED') reasons.push('HIGHER_TIMEFRAME_CONTEXT_OPPOSED');
  else if (higherTimeframeContext.state === 'MIXED') reasons.push('HIGHER_TIMEFRAME_CONTEXT_MIXED');
  else if (higherTimeframeContext.state === 'UNAVAILABLE') reasons.push('HIGHER_TIMEFRAME_CONTEXT_UNAVAILABLE');

  return freeze({
    direction: dir,
    readiness,
    supporting_timeframes: support,
    conflict_timeframes: [...new Set(conflicts)],
    higher_timeframe_context: higherTimeframeContext,
    fractal_snapshot: buildBbmaFractalSnapshot(evidence),
    reason_codes: [...new Set(reasons)],
    data_status: evidence.status ?? 'OK',
    rule_version: evidence.rule_version
  });
}

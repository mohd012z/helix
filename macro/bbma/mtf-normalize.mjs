const TIMEFRAMES = Object.freeze(['MN', 'W1', 'D1', 'H4', 'H1', 'M30', 'M15', 'M5']);
const ALLOWED = new Set(TIMEFRAMES);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function duplicateError(timeframe) {
  const error = new TypeError(`duplicate BBMA timeframe: ${timeframe}`);
  error.code = 'MTF_DUPLICATE_TIMEFRAME';
  return error;
}

export function normalizeMtfEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') throw new TypeError('BBMA MTF evidence object is required');
  const source = evidence.timeframes;
  if (!Array.isArray(source) && (!source || typeof source !== 'object')) {
    throw new TypeError('BBMA MTF timeframes must be an array or keyed object');
  }

  const collected = new Map();
  if (Array.isArray(source)) {
    for (const item of source) {
      const timeframe = item?.timeframe;
      if (!ALLOWED.has(timeframe)) continue;
      if (collected.has(timeframe)) throw duplicateError(timeframe);
      collected.set(timeframe, item);
    }
  } else {
    for (const timeframe of TIMEFRAMES) {
      const item = source[timeframe];
      if (!item) continue;
      collected.set(timeframe, item);
    }
  }

  const byTimeframe = {};
  for (const timeframe of TIMEFRAMES) {
    if (collected.has(timeframe)) byTimeframe[timeframe] = collected.get(timeframe);
  }

  return deepFreeze({
    byTimeframe,
    ruleVersion: evidence.rule_version ?? evidence.ruleVersion ?? null,
    dataStatus: evidence.status ?? evidence.data_status ?? evidence.dataStatus ?? 'OK',
    sourceState: evidence.overall_state ?? evidence.sourceState ?? null
  });
}

export { TIMEFRAMES as BBMA_MTF_TIMEFRAMES };

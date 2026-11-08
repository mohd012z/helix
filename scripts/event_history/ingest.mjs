/* Phase 3: ingest IFX settled reaction samples -> helix data/event-history.json.
 *
 * The IFX poller captures one price per tab (GC=F / BTC / EURUSD) at news-detect
 * time and re-captures at checkpoints M1..MN1. A "settled" row (reaction.state
 * === 'COMPLETE') with checkpoints is a set of before/after reaction samples —
 * one per checkpoint window, so the advance-model can pick any window (default
 * '5m' -> M5) and find history for it.
 *
 * Mapping is honest about the proxy nature:
 *   gold   -> XAU/USD  (metal, GC=F futures proxy)
 *   crypto -> BTC/USD  (digital, Coinbase spot)
 *   forex  -> EUR/USD  (fx, EURUSD=X yahoo proxy)
 * high/low = the before/after envelope of the SAME window (not the full
 * settlement-period MFE/MAE, which would overstate each window's range).
 * sourceQuality marks the provenance so downstream can weight / filter.
 *
 * Idempotent: reads the existing event-history.json (if any), merges newly-
 * settled ifx rows, dedupes by eventId, re-validates every sample, writes back.
 * Safe from CI, a one-shot backfill, or the helix poller each lifecycle cycle.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeHistorySample, validateHistorySample } from '../../macro/history/history-schema.mjs';

const IFX_DEFAULT = process.env.IFX_DATA_DIR ?? '/opt/data/ifx-live/repo';
const IFX_TRACK = path.join(IFX_DEFAULT, 'price-track.json');

const TAB_TO_SYMBOL = {
  gold:   { symbol: 'XAU/USD', assetClass: 'metal',   priceKind: 'FUTURES' },
  crypto: { symbol: 'BTC/USD', assetClass: 'digital', priceKind: 'CRYPTO'  },
  forex:  { symbol: 'EUR/USD', assetClass: 'fx',      priceKind: 'FOREX'   },
};

// Emit one sample per checkpoint window in this order (all present on every
// settled ifx row). M1..MN1 match the advance-model's window filter (normalised).
const CHECKPOINT_ORDER = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'];
const MAX_SAMPLES = 5000; // hard cap; newest-first when trimming.

const hashId = (input) => crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
const finitePos = (v) => Number.isFinite(+v) && +v > 0;

function buildSample(row, cpKey) {
  const tab = TAB_TO_SYMBOL[row?.tabId];
  if (!tab) return null; // untracked tab (e.g. 'oil') — not a helix instrument
  const before = +row?.priceAtDetect;
  if (!finitePos(before)) return null;
  const cps = Array.isArray(row?.checkpoints) ? row.checkpoints : [];
  const cp = cps.find((c) => c?.key === cpKey && finitePos(c?.price));
  if (!cp) return null;
  const after = +cp.price;
  return {
    eventId: 'ifx:' + hashId(row?.key ?? row?.url ?? row?.title) + ':' + cpKey,
    eventType: 'NEWS',
    eventTimeUtc: row?.createdAt ?? cp?.capturedAt ?? null,
    symbol: tab.symbol,
    assetClass: tab.assetClass,
    window: cpKey,
    before,
    after,
    high: Math.max(before, after),
    low: Math.min(before, after),
    surpriseZ: null, // news rows carry no numeric forecast; only calendar events do
    centralBank: null, speakerRole: null, session: null,
    volatilityRegime: null, trendRegime: null, speechStance: null,
    sourceQuality: 'IFX_PROXY_' + tab.priceKind,
    features: [
      { name: 'sourceTab', value: row?.tabId ?? null, observedAt: row?.createdAt ?? null },
      { name: 'impactScore', value: row?.impactScore ?? null, observedAt: row?.createdAt ?? null },
      { name: 'realizedPct', value: cp?.realizedPct ?? null, observedAt: cp?.capturedAt ?? null },
      { name: 'sourceUrl', value: row?.url ?? null, observedAt: null },
    ],
  };
}

export function samplesFromIfxTrack(track = {}) {
  const rows = Array.isArray(track?.results) ? track.results : [];
  const out = [];
  for (const row of rows) {
    if (row?.reaction?.state !== 'COMPLETE') continue;
    for (const cpKey of CHECKPOINT_ORDER) {
      const s = buildSample(row, cpKey);
      if (s) out.push(s);
    }
  }
  return out;
}

export function loadExisting(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw?.samples) ? raw.samples : [];
  } catch { return []; }
}

export function mergeSamples(existing, incoming) {
  const seen = new Map();
  for (const s of existing) if (s?.eventId) seen.set(s.eventId, s);
  // Incoming wins on duplicate (the ifx side re-settles with fresher
  // checkpoints); existing-only rows (manual / legacy) are preserved.
  for (const s of incoming) if (s?.eventId) seen.set(s.eventId, s);
  let rows = [...seen.values()];
  if (rows.length > MAX_SAMPLES) {
    rows = rows.sort((a, b) =>
      String(b?.eventTimeUtc ?? '').localeCompare(String(a?.eventTimeUtc ?? ''))
    ).slice(0, MAX_SAMPLES);
  }
  return rows;
}

export function writeHistory(filePath, samples) {
  const normalized = [];
  let rejected = 0;
  for (const s of samples) {
    const n = normalizeHistorySample(s);
    if (validateHistorySample(n).valid) normalized.push(n);
    else rejected += 1;
  }
  const payload = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    samples: normalized,
    rejectedCount: rejected,
    status: normalized.length ? 'READY' : 'EMPTY',
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, filePath);
  return payload;
}

export function ingestIfxToEventHistory({ ifxTrackPath = IFX_TRACK, outPath } = {}) {
  const track = JSON.parse(fs.readFileSync(ifxTrackPath, 'utf8'));
  const existing = loadExisting(outPath);
  const incoming = samplesFromIfxTrack(track);
  const merged = mergeSamples(existing, incoming);
  const payload = writeHistory(outPath, merged);
  return {
    existing: existing.length,
    incoming: incoming.length,
    merged: merged.length,
    written: payload.samples.length,
    rejected: payload.rejectedCount,
    status: payload.status,
  };
}

// CLI: node scripts/event_history/ingest.mjs [--ifx /path/price-track.json] [--out /path/event-history.json]
const isMain = process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const getOpt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const ifxTrackPath = getOpt('--ifx') ?? IFX_TRACK;
  const outPath = getOpt('--out') ?? path.resolve('data/event-history.json');
  const res = ingestIfxToEventHistory({ ifxTrackPath, outPath });
  console.log('ingest', JSON.stringify(res));
}

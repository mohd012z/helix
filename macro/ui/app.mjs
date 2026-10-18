import { BRAND, getInstrument } from '../core/instruments.mjs';
import { adaptSnapshot } from '../adapters/snapshot-adapter.mjs';
import { loadHistory } from '../adapters/history-adapter.mjs';
import { calcFxReaction, calcMetalReaction, calcDigitalReaction } from '../core/reaction.mjs';
import { buildAdvanceModel } from '../history/advance-model.mjs';
import { createEventStore } from '../events/event-store.mjs';
import { ingestSnapshotEvents, startGatewayPolling } from '../adapters/event-feed-adapter.mjs';
import { dispatchRecalculation } from '../events/recalculate.mjs';
import { renderAndRecordTradePlan } from './trade-plan-controller.mjs';
import { buildTradePlanInput, normalizeMarketFeedState, mergeAdvanceModelOverrides } from './trade-plan-integration.mjs';
import { renderAdvanceModelMarkup } from './advance-model-view.mjs';
import { buildBoardGroups } from './market-board.mjs';

const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

function fixed(value, digits) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}
function signed(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value); return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
}
function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function formatMyt(iso, prefix = 'Updated') {
  if (!iso) return `${prefix} —`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${prefix} ${iso}`;
  return `${prefix} ${new Intl.DateTimeFormat('en-MY', { timeZone:'Asia/Kuala_Lumpur', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }).format(d)} MYT`;
}

export function formatReactionCard({ symbol, assetClass, reaction, expectedPressure = '—', observedReaction = '—' }) {
  const priceDigits = assetClass === 'fx' ? (symbol.endsWith('/JPY') ? 3 : 5) : 2;
  let movement = '—', detail = '—';
  if (assetClass === 'fx') {
    movement = `${signed(reaction.pips, 1)} pips`;
    detail = `max up ${signed(reaction.maxUpPips,1)} • max down ${signed(reaction.maxDownPips,1)} • range ${fixed(reaction.rangePips,1)} pips`;
  } else if (assetClass === 'metal') {
    const points = reaction.providerPoints == null ? '—' : signed(reaction.providerPoints,1);
    movement = `$${signed(reaction.dollarMove,2)} • ${signed(reaction.returnPct,2)}% • ${points} provider pts`;
    detail = 'Gold movement uses provider point metadata, not a universal pip definition.';
  } else if (assetClass === 'digital') {
    movement = `$${signed(reaction.dollarMove,2)} • ${signed(reaction.returnPct,2)}%`;
    detail = 'Digital assets use dollar and percentage movement.';
  }
  return { symbol, assetClass, from: fixed(reaction.fromPrice, priceDigits), to: fixed(reaction.toPrice, priceDigits), movement, detail, expectedPressure, observedReaction };
}

export function formatEventView(event) {
  const speech = event?.speech ?? null;
  return {
    badge: event?.kind === 'unplanned' ? 'UNPLANNED' : 'SCHEDULED',
    title: event?.title || 'No active material event',
    time: formatMyt(event?.eventTimeUtc, 'Event'),
    provenance: `${event?.timeSource ?? 'UNKNOWN'} • ${event?.timeConfidence ?? 'UNKNOWN'}`,
    currencies: event?.affectedAssets?.currencies ?? [],
    primary: event?.affectedAssets?.primary ?? [],
    secondary: event?.affectedAssets?.secondary ?? [],
    context: event?.affectedAssets?.context ?? [],
    stance: speech?.stance ?? '—',
    dimensions: speech?.dimensions ?? {},
    confidence: speech?.confidence ?? null,
    revisions: event?.revisions ?? []
  };
}

function reactionFromInput(item) {
  const meta = getInstrument(item.symbol);
  if (!meta || item.before == null || item.after == null) return null;
  if (meta.assetClass === 'fx') return calcFxReaction(item.symbol, item.before, item.after, item.high, item.low);
  if (meta.assetClass === 'metal') return calcMetalReaction(item.before, item.after, meta.tickSize ?? null);
  if (meta.assetClass === 'digital') return calcDigitalReaction(item.before, item.after);
  return null;
}
function cardElement(card) {
  const el = document.createElement('article'); el.className = 'reaction-card';
  el.innerHTML = '<div class="reaction-title"></div><div class="reaction-prices"></div><div class="reaction-move"></div><div class="reaction-states"><span>Expected</span><strong></strong><span>Observed</span><strong></strong></div><div class="reaction-detail"></div>';
  el.querySelector('.reaction-title').textContent = card.symbol;
  el.querySelector('.reaction-prices').textContent = `${card.from} → ${card.to}`;
  el.querySelector('.reaction-move').textContent = card.movement;
  const strong = el.querySelectorAll('.reaction-states strong'); strong[0].textContent = card.expectedPressure; strong[1].textContent = card.observedReaction;
  el.querySelector('.reaction-detail').textContent = card.detail;
  return el;
}
function renderReactionCards() {
  const inputs = Array.isArray(window.MACRO_EVENT_REACTIONS) ? window.MACRO_EVENT_REACTIONS : [];
  const hosts = { fx: $('#fx-reactions'), metal: $('#metal-reaction'), digital: $('#digital-reactions') };
  if (!inputs.length) return;
  Object.values(hosts).forEach(h => { if (h) h.innerHTML = ''; });
  const counts = {fx:0,metal:0,digital:0};
  inputs.forEach(item => {
    const meta = getInstrument(item.symbol), reaction = reactionFromInput(item); if (!meta || !reaction) return;
    const card = formatReactionCard({symbol:item.symbol,assetClass:meta.assetClass,reaction,expectedPressure:item.expectedPressure ?? '—',observedReaction:item.observedReaction ?? '—'});
    hosts[meta.assetClass]?.appendChild(cardElement(card)); counts[meta.assetClass]++;
  });
  if (!counts.fx) hosts.fx.innerHTML = '<div class="empty-state">No measured FX event reaction yet.</div>';
  if (!counts.metal) hosts.metal.innerHTML = '<div class="empty-state">No measured metal event reaction yet.</div>';
  if (!counts.digital) hosts.digital.innerHTML = '<div class="empty-state">No measured digital-asset event reaction yet.</div>';
}

export function renderMarketBoard(data) {
  const board = data.board ?? null;
  const targets = [
    ['BRIEF', $('#market-board')],
    ['FX', $('#market-board-fx')],
    ['METALS', $('#market-board-metals')],
    ['DIGITAL ASSETS', $('#market-board-digital')]
  ];
  targets.forEach(([view, host]) => {
    if (!host) return;
    host.innerHTML = '';
    const groups = board ? buildBoardGroups(view, board) : [];
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No board symbols in the current snapshot.';
      host.appendChild(empty);
      return;
    }
    groups.forEach(group => {
      const section = document.createElement('div');
      section.className = 'market-board-group';
      const head = document.createElement('div');
      head.className = 'market-board-head';
      head.textContent = group.label;
      section.appendChild(head);
      group.rows.forEach(row => {
        const el = document.createElement('div');
        el.className = 'market-board-row' + (row.state === 'OK' ? ` tone-${row.change?.tone ?? 'flat'}` : ' tone-unavailable');
        el.innerHTML = '<span class="mb-symbol"></span><span class="mb-price"></span><span class="mb-change"></span><span class="mb-detail"></span>';
        el.querySelector('.mb-symbol').textContent = row.symbol;
        el.querySelector('.mb-price').textContent = row.price;
        el.querySelector('.mb-change').textContent = row.change ? row.change.text : '—';
        el.querySelector('.mb-detail').textContent = row.detail;
        section.appendChild(el);
      });
      host.appendChild(section);
    });
  });
}

function renderSnapshot(data) {
  document.title = `${BRAND.name} — ${BRAND.subtitle}`;
  $('#feed-status').textContent = data.status; $('#updated-at').textContent = formatMyt(data.updatedAt);
  const xau = data.instruments['XAU/USD']; $('#xau-price').textContent = xau.price == null ? '—' : `$${fmt(xau.price)}`;
  $('#xau-change').textContent = xau.change == null || xau.changePct == null ? 'Daily verified snapshot' : `${xau.change >= 0 ? '+' : ''}${fmt(xau.change)} • ${xau.changePct >= 0 ? '+' : ''}${fmt(xau.changePct)}% • ${xau.dayRange ?? '—'}`;
  $('#verified-badge').textContent = data.verified ? 'VERIFIED SNAPSHOT' : 'SNAPSHOT';
  const list = $('#source-list'); list.innerHTML = '';
  const entries = Object.values(data.sourceStatus ?? {});
  if (entries.length) entries.forEach(src => { const item=document.createElement('div'); item.className='source-item'; item.innerHTML='<strong></strong><span></span>'; item.querySelector('strong').textContent=src.label ?? 'Source'; item.querySelector('span').textContent=src.ok?'OK':'UNAVAILABLE'; list.appendChild(item); });
  else if (data.sources.length) data.sources.forEach(source => { const item=document.createElement('div'); item.className='source-item'; item.textContent=source; list.appendChild(item); });
  else list.innerHTML='<div class="empty-state">No source metadata in this snapshot.</div>';
}

function eventCandidates(event = {}) {
  return [...new Set([
    ...(event.affectedAssets?.primary ?? []),
    ...(event.affectedAssets?.secondary ?? []),
    ...(event.affectedAssets?.context ?? [])
  ].filter(Boolean))];
}

function buildHistoricalBundle(active, data, historyState, nowUtc) {
  if (!active) return null;
  const overrides = window.MACRO_TRADE_PLAN ?? {};
  const explicitSymbol = getInstrument(overrides.modelSymbol) ? overrides.modelSymbol : null;
  const candidates = explicitSymbol ? [explicitSymbol] : eventCandidates(active).filter(symbol => getInstrument(symbol));
  let symbol = candidates.find(candidate => data.instruments?.[candidate]?.price != null) ?? candidates[0] ?? null;
  if (!symbol && data.instruments?.['XAU/USD']?.price != null && eventCandidates(active).includes('XAU/USD')) symbol = 'XAU/USD';
  const explicitPrice = Number(overrides.prices?.from);
  const snapshotPrice = symbol ? Number(data.instruments?.[symbol]?.price) : NaN;
  const preEventPrice = Number.isFinite(explicitPrice) && explicitPrice > 0 ? explicitPrice : (Number.isFinite(snapshotPrice) && snapshotPrice > 0 ? snapshotPrice : null);
  if (!symbol || preEventPrice == null) return { model:{state:'INSUFFICIENT_DATA',reason:'MISSING_EVENT_OR_PRICE'}, symbol, preEventPrice };
  const features = Array.isArray(overrides.advanceFeatures) ? overrides.advanceFeatures : [];
  const event = {...active, window:overrides.historyWindow ?? '5m'};
  const model = buildAdvanceModel({event,symbol,preEventPrice,features,history:historyState.samples ?? [],asOfUtc:nowUtc});
  return {model,symbol,preEventPrice};
}

function renderHistoricalModel(bundle, historyState) {
  const host = $('#history-model-host');
  const status = $('#history-data-status');
  if (status) status.textContent = `${historyState.status ?? 'UNKNOWN'}${historyState.rejectedCount ? ` • ${historyState.rejectedCount} rejected` : ''}`;
  if (!host) return;
  host.className = '';
  host.innerHTML = renderAdvanceModelMarkup(bundle?.model ?? {state:'INSUFFICIENT_DATA',reason:'NO_ACTIVE_EVENT'});
}

function renderTradePlan(active, marketFeedState, planHistory, overrides, reason = 'SYNC', createdAtUtc = new Date().toISOString()) {
  const host = $('#trade-plan-host');
  if (!host) return null;
  const input = buildTradePlanInput({event:active,marketFeedState,overrides,nowUtc:createdAtUtc});
  if (!input) {
    host.className = 'empty-state';
    host.textContent = 'No active timed event available for the MYT Trade Plan.';
    return null;
  }
  host.className = '';
  const history = planHistory.get(active.id) ?? [];
  const sourceRevisionNumber = active.revisions?.at(-1)?.revisionNumber ?? 0;
  const result = renderAndRecordTradePlan(host, input, {history,createdAtUtc,reason,sourceRevisionNumber});
  planHistory.set(active.id, result.history);
  return result.plan;
}

function renderEventStore(store, data, historyState, eventFeedState = 'SNAPSHOT', marketFeedState = 'SNAPSHOT', planHistory = new Map(), reason = 'SYNC', createdAtUtc = new Date().toISOString()) {
  const events = store.list();
  const active = events[0] ?? null;
  const view = formatEventView(active);
  $('#active-event').textContent = view.title;
  $('#active-event-meta').textContent = active ? `${view.badge} • ${view.time} • ${view.provenance}` : 'No active material event in the current feed.';
  $('#event-feed-state').textContent = eventFeedState;

  const bundle = buildHistoricalBundle(active, data, historyState, createdAtUtc);
  renderHistoricalModel(bundle, historyState);
  const baseOverrides = {...(window.MACRO_TRADE_PLAN ?? {})};
  if (bundle?.preEventPrice != null && !baseOverrides.prices) baseOverrides.prices = {from:bundle.preEventPrice};
  const planOverrides = bundle?.model && ['READY','LOW_SAMPLE'].includes(bundle.model.state) ? mergeAdvanceModelOverrides(bundle.model, baseOverrides) : baseOverrides;
  renderTradePlan(active, marketFeedState, planHistory, planOverrides, reason, createdAtUtc);

  const eventList = $('#event-list'); eventList.innerHTML = '';
  if (!events.length) eventList.innerHTML = '<div class="empty-state">No material event detected from the current snapshot.</div>';
  events.slice(0,8).forEach(event => {
    const v = formatEventView(event); const row=document.createElement('article'); row.className='event-row';
    row.innerHTML='<div class="event-row-top"><strong></strong><span class="badge"></span></div><div class="event-row-meta"></div>';
    row.querySelector('strong').textContent=v.title; row.querySelector('.badge').textContent=v.badge; row.querySelector('.event-row-meta').textContent=`${v.time} • ${v.provenance}`; eventList.appendChild(row);
  });

  const affected = $('#affected-assets'); affected.innerHTML='';
  const assets = active ? [...view.currencies, ...view.primary.slice(0,8), ...view.secondary.slice(0,4)] : [];
  if (!assets.length) affected.innerHTML='<div class="empty-state">No affected-asset map yet.</div>';
  else [...new Set(assets)].forEach(x => { const span=document.createElement('span'); span.textContent=x; affected.appendChild(span); });

  const speechPanel = $('#speech-panel'); speechPanel.innerHTML='';
  if (!active?.speech) speechPanel.innerHTML='<div class="empty-state">No classified live speech segment in the current event.</div>';
  else {
    const head=document.createElement('div'); head.className='speech-head'; head.innerHTML='<strong></strong><span></span>'; head.querySelector('strong').textContent=view.stance; head.querySelector('span').textContent=`confidence ${Math.round((view.confidence ?? 0)*100)}%`; speechPanel.appendChild(head);
    const grid=document.createElement('div'); grid.className='dimension-grid'; Object.entries(view.dimensions).forEach(([k,v])=>{ const cell=document.createElement('div'); cell.innerHTML='<span></span><strong></strong>'; cell.querySelector('span').textContent=k; cell.querySelector('strong').textContent=signed(v,2); grid.appendChild(cell); }); speechPanel.appendChild(grid);
  }

  const revHost=$('#revision-list'); revHost.innerHTML='';
  const revisions=active?.revisions ?? [];
  if (!revisions.length) revHost.innerHTML='<div class="empty-state">No event revisions yet.</div>';
  revisions.slice(-6).forEach(r=>{ const row=document.createElement('div'); row.className='revision-row'; const stance=r.speech?.stance ? ` • ${r.speech.stance}` : ''; row.textContent=`R${r.revisionNumber} • ${r.type}${stance} • ${formatMyt(r.at,'')}`; revHost.appendChild(row); });
}

function showView(view) {
  const requested = view === 'DIGITAL' ? 'DIGITAL ASSETS' : view;
  const normalized = requested === 'MORE' ? 'BRIEF' : requested;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === normalized));
  $$('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.view === requested || (normalized === 'BRIEF' && button.dataset.view === 'MORE')));
  $$('[data-view-section]').forEach(section => { const tags=section.dataset.viewSection.split(/\s+/); section.classList.toggle('hidden', normalized !== 'BRIEF' && !tags.includes(normalized)); });
}
function bindNavigation(){ $$('.nav-item, .bottom-nav button').forEach(button => button.addEventListener('click',()=>showView(button.dataset.view))); }
function bindTheme(){ const key='macro-desk-theme'; let saved=null; try{saved=localStorage.getItem(key);}catch{} if(saved==='light'||saved==='dark') document.documentElement.dataset.theme=saved; $('#theme-toggle').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem(key,next);}catch{}}); }

function boot() {
  const raw = window.XAUUSD_DATA ?? {}, data = adaptSnapshot(raw);
  renderSnapshot(data); renderReactionCards(); renderMarketBoard(data); bindNavigation(); bindTheme();
  let eventFeedState = 'SNAPSHOT';
  const marketFeedState = normalizeMarketFeedState(window.MACRO_MARKET_FEED_STATE ?? data.status);
  const planHistory = new Map();
  let historyState = {schemaVersion:'1.0',generatedAt:null,samples:[],rejectedCount:0,status:'LOADING'};
  let store;
  const renderCurrent = (reason='SYNC', at=new Date().toISOString()) => renderEventStore(store,data,historyState,eventFeedState,marketFeedState,planHistory,reason,at);
  const onRecalculation = event => renderCurrent(`RECALC_${event.detail?.modelMode ?? 'UPDATE'}`, event.detail?.requestedAt ?? new Date().toISOString());
  window.addEventListener('macrodesk:event-update', onRecalculation);
  store = createEventStore({ onUpdate(event){
    dispatchRecalculation(event,{feedStatus:eventFeedState,requestedAt:new Date().toISOString()},window);
  } });
  store.ingestMany(ingestSnapshotEvents(raw));
  renderCurrent('SYNC');

  loadHistory({url:'./data/event-history.json'}).then(result => {
    historyState = result;
    renderCurrent('HISTORY_LOADED');
  });

  const gatewayUrl = window.MACRO_DESK_CONFIG?.eventGatewayUrl ?? null;
  startGatewayPolling({
    url: gatewayUrl,
    intervalMs: window.MACRO_DESK_CONFIG?.eventPollMs ?? 60000,
    onUpdate(candidates){ eventFeedState='GATEWAY'; store.ingestMany(candidates); renderCurrent('GATEWAY_SYNC'); },
    onError(){ eventFeedState='SNAPSHOT • GATEWAY ERROR'; renderCurrent('GATEWAY_ERROR'); }
  });
  showView('BRIEF');
}

if (browser) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }

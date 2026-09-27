const esc=s=>String(s??'—').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

export function renderTelegramCallbackView(result){
  if(!result?.ok) return {text:`⚠️ ${esc(result?.reason??'UNAVAILABLE')}`,parse_mode:'HTML'};
  const p=result.payload??{};
  if(result.action==='mtf'){
    const rows=['MN','W1','D1','H4','H1','M30','M15','M5'].map(tf=>{const x=p[tf]??{};return `${tf.padEnd(3)} ${esc((x.active_detectors??[]).join(', ')||x.direction||'—')}`;}).join('\n');
    return {text:`📊 <b>BBMA MTF DETAIL</b>\n<pre>${rows}</pre>\nSnapshot: HISTORICAL`,parse_mode:'HTML'};
  }
  if(result.action==='news') return {text:`📰 <b>NEWS CONTEXT</b>\nEvent: ${esc(p.event)}\nImpact: ${esc(p.impact)}\nGate: ${esc(p.gate??p.state)}\nNews contextualizes/gates only.`,parse_mode:'HTML'};
  if(result.action==='evidence') return {text:`🔬 <b>EVIDENCE</b>\nObservation: ${esc(result.alert_id)}\nCoverage: ${esc(p.coverage??p.coverage_state)}\nReasons: ${esc((p.reason_codes??[]).join(', ')||'—')}\nSnapshot: HISTORICAL`,parse_mode:'HTML'};
  if(result.action==='status') return {text:`🔄 <b>CURRENT STATUS</b>\nDirection: ${esc(p.direction)}\nReadiness: ${esc(p.readiness)}\nMode: CURRENT\n\nNo broker execution.`,parse_mode:'HTML'};
  if(result.action==='why') return {text:`❓ <b>WHY ${esc(p.state)}</b>\nDirection: ${esc(p.direction)}\nDetectors: ${esc((p.detectors??[]).join(', ')||'—')}\nGate: ${esc(p.gate)}\nReasons: ${esc((p.reasons??[]).join(', ')||'—')}\nIncomplete: ${p.incomplete?'YES':'NO'}\nStale: ${p.stale?'YES':'NO'}`,parse_mode:'HTML'};
  if(result.action==='changes') return {text:`Δ <b>CHANGES</b>\nAdded: ${esc((p.added??[]).join(', ')||'—')}\nRemoved: ${esc((p.removed??[]).join(', ')||'—')}\nDirection changed: ${p.direction_changed?'YES':'NO'}\nGate changed: ${p.gate_changed?'YES':'NO'}\nReadiness changed: ${p.readiness_changed?'YES':'NO'}`,parse_mode:'HTML'};
  return {text:'⚠️ Unsupported callback',parse_mode:'HTML'};
}

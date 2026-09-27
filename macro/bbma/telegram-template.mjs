const esc=s=>String(s??'—').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const shortId=id=>String(id??'unknown').slice(0,40);

export function buildBbmaTelegramMessage(alert){
  if(!alert||typeof alert!=='object') throw new TypeError('alert is required');
  const id=shortId(alert.alert_id);
  const b=alert.bbma??{}; const n=alert.news??{}; const g=alert.gate??{};
  const rows=['MN','W1','D1','H4','H1','M30','M15','M5'].map(tf=>{
    const x=b.fractal_snapshot?.[tf];
    return `${tf.padEnd(3)} ${esc((x?.active_detectors??[]).join(', ')||x?.direction||'—')}`;
  }).join('\n');
  const lifecycle=alert.lifecycle?.state??b.readiness??'OBSERVED';
  const priority=alert.lifecycle?.priority??'P4';
  const text=[
    `🟡 <b>${esc(alert.symbol??'XAUUSD')} — BBMA ${esc(lifecycle)}</b>`,
    '',`Direction: <b>${esc(b.direction)}</b>`,`Priority: ${esc(priority)}`,`Mode: SHADOW / EVIDENCE`,`Time: ${esc(alert.display_time_myt)} MYT`,
    '',`📊 <b>MTF BBMA</b>`,`<pre>${rows}</pre>`,
    `🧭 Macro: ${esc(b.macro_context)} | Structure: ${esc(b.structural_bias)}`,
    `Setup: ${esc(b.setup_state)} | Trigger: ${esc(b.trigger_state)}`,
    '',`📰 <b>NEWS</b>`,`Impact: ${esc(n.impact)}`,`Event: ${esc(n.event)}`,`Gate: <b>${esc(n.gate??g.state)}</b>`,
    '',`⚠️ News does not determine BBMA direction.`,`No broker execution.`
  ].join('\n');
  return Object.freeze({
    text, parse_mode:'HTML',
    reply_markup:Object.freeze({inline_keyboard:Object.freeze([
      Object.freeze([{text:'📊 MTF Detail',callback_data:`bbma:mtf:${id}`},{text:'📰 News',callback_data:`bbma:news:${id}`}]),
      Object.freeze([{text:'🔬 Evidence',callback_data:`bbma:evidence:${id}`},{text:'🔄 Current Status',callback_data:`bbma:status:${id}`}]),
      Object.freeze([{text:'❓ Why?',callback_data:`bbma:why:${id}`},{text:'Δ Changes',callback_data:`bbma:changes:${id}`}])
    ])})
  });
}

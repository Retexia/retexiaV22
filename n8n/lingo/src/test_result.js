// Test bot (feeder.retexia.com → Lingo → Test bot): what the customer would have received, how the
// turn was answered and what the AI cost — the same pipeline as a real WhatsApp message.
const m = $('Message').first().json;
const gate = $('Gate').isExecuted ? $('Gate').first().json : {};
if (!$('Save Turn').isExecuted) {
  const claim = $('Claim Batch').isExecuted ? $('Claim Batch').first().json : {};
  return [{ json: { reply: { ok: true, stopped: gate.status !== 'ok' ? gate.status : (claim.why || 'stopped'), messages: [] } } }];
}
const st = $('Build Save Turn').first().json.p;
const saved = $('Save Turn').first().json || {};
return [{ json: { reply: {
  ok: true,
  phone: m.phone,
  route: st.route,
  stage: st.stage,
  lang: st.lang,
  handoff: st.handoff || null,
  meta: st.meta,
  log: st.log,
  messages: $('Split Outgoing').all().map(o => ({ text: o.json.text, body: o.json.body, pid: o.json.pid || null })),
  ai: (st.usage || []).map(x => ({ stage: x.stage, model: x.model, in: (x.usage || {}).promptTokenCount || 0,
    out: ((x.usage || {}).candidatesTokenCount || 0) + ((x.usage || {}).thoughtsTokenCount || 0) })),
  ad_match: $('Gemini: Ad Match').isExecuted,
  cost_usd: Number(saved.cost_usd || 0),
  order_id: saved.order_id || null,
} } }];

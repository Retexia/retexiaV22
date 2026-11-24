// "Try Lingo" in the panel: what the customer would have received, how it was understood and what
// the AI cost: the same pipeline as a real WhatsApp message.
const m = $('Message').first().json;
const gate = $('Gate').isExecuted ? $('Gate').first().json : {};
if (!$('Save Turn').isExecuted) {
  const claim = $('Claim Batch').isExecuted ? $('Claim Batch').first().json : {};
  return [{ json: { reply: { ok: true, stopped: gate.status !== 'ok' ? gate.status : (claim.why || 'stopped'), messages: [] } } }];
}
const st = $('Build Save Turn').first().json.p;
const saved = $('Save Turn').first().json || {};
const u = $('Understand').first().json;
const plan = $('Plan Reply').first().json;
return [{ json: { reply: {
  ok: true,
  phone: m.phone,
  route: st.route,
  status: st.chat.status,
  needs_call: st.chat.needs_call,
  call_reason: st.chat.call_reason || null,
  lang: st.chat.lang,
  understood: { intent: (plan.ai && plan.ai.from) ? 'ai' : (u.rule || u.source), ai: plan.ai, product_id: st.chat.product_id },
  log: st.log,
  messages: $('Split Outgoing').all().filter(o => !o.json.skip).map(o => ({ kind: o.json.kind, text: o.json.text, body: o.json.body, pid: o.json.pid || null })),
  ai: (st.usage || []).map(x => ({ task: x.task, model: x.model, ok: x.ok, in: ((x.usage || {}).prompt_tokens || (x.usage || {}).promptTokenCount || 0),
    cached: (((x.usage || {}).prompt_tokens_details || {}).cached_tokens || 0), out: ((x.usage || {}).completion_tokens || ((x.usage || {}).candidatesTokenCount || 0) + ((x.usage || {}).thoughtsTokenCount || 0)) })),
  ad_match: $('AI: Ad Match').isExecuted,
  cost_usd: Number(saved.cost_usd || 0),
  order_id: saved.order_id || null,
} } }];

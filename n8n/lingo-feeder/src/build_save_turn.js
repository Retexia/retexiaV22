// What was sent (WhatsApp ids for delivery statuses and quoted replies) + every AI call's usage →
// the whole turn saved in one database call. In test mode nothing was sent.
const m = $('Message').first().json;
const plan = $('Plan Reply').first().json;
const outs = $('Split Outgoing').all().filter(o => !o.json.skip);
const results = m.test ? [] : $input.all();
const sent = [], productMsgs = [];
outs.forEach((o, i) => {
  const r = results[i] ? (results[i].json || {}) : {};
  const id = ((r.messages || [])[0] || {}).id || null;
  const e = r.error ? (typeof r.error === 'string' ? r.error : `${r.error.code || ''} ${r.error.message || ''}`.trim()) : null;
  sent.push({ wa_id: id, text: o.json.text, kind: o.json.kind, meta: o.json.meta, error: m.test ? null : (e || (id ? null : 'no message id')) });
  if (o.json.pid && id) productMsgs.push({ wa_id: id, product_id: o.json.pid });
});

const usage = [];
const u = $('Understand').first().json;
const b = u.brain || {};
const add = (node, provider, model) => {
  if (!$(node).isExecuted) return;
  const r = $(node).first().json || {};
  const use = r.usage || r.usageMetadata || null;
  usage.push({ task: 'brain', provider, model, usage: use, ok: !r.error && !!use, ms: b.started ? Date.now() - b.started : null,
               error: r.error ? String(r.error.message || JSON.stringify(r.error)).slice(0, 300) : null });
};
add('OpenAI: Brain', 'openai', b.openai_model);
add('Gemini: Brain', 'gemini', b.gemini_model);

return [{ json: { p: { ...plan.save, sent, product_msgs: productMsgs, usage } } }];

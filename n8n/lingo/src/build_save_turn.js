// Collects what was sent (WhatsApp ids for delivery statuses and quote matching) and every AI call's
// usage, then saves the whole turn in one database call. In test mode nothing was sent.
const m = $('Message').first().json;
const src = $('Compose Reply').isExecuted ? $('Compose Reply').first().json : $('Plan Reply').first().json;
const outs = $('Split Outgoing').all();
const results = m.test ? [] : $input.all();
const sent = [], productMsgs = [];
outs.forEach((o, i) => {
  const r = results[i] ? (results[i].json || {}) : {};
  const id = ((r.messages || [])[0] || {}).id || null;
  const e = r.error ? (typeof r.error === 'string' ? r.error : `${r.error.code || ''} ${r.error.message || ''}`.trim()) : null;
  sent.push({ wa_id: id, text: o.json.text, error: m.test ? null : (e || (id ? null : 'no message id')) });
  if (o.json.pid && id) productMsgs.push({ wa_id: id, product_id: o.json.pid });
});

const usage = [];
const add = (node, builder) => {
  if (!$(node).isExecuted) return;
  const g = $(node).first().json || {};
  const b = $(builder).first().json || {};
  if (g.usageMetadata) usage.push({ stage: b.stage_name || b.stage, model: b.model, usage: g.usageMetadata, ok: !g.error });
};
add('Gemini: Summary', 'Build Summary Request');
add('Gemini: Classify', 'Understand');
add('Gemini: Reply', 'Plan Reply');

return [{ json: { p: { ...src.save, sent, product_msgs: productMsgs, usage } } }];

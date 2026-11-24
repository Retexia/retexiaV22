// One row for the batching buffer (text, or the voice note / photo as text), with the AI usage of
// this message's ad match and media call, so every call is logged even if the batch moves on.
const m = $('Message').first().json;
const usage = [];
const add = (node, builder) => {
  if (!$(node).isExecuted) return;
  const r = $(node).first().json || {};
  const b = $(builder).first().json || {};
  const u = r.usage || r.usageMetadata || null;
  usage.push({ task: b.task, provider: b.provider, model: b.model, usage: u, ok: !r.error && !!u, ms: b.started ? Date.now() - b.started : null,
               error: r.error ? String(r.error.message || r.error).slice(0, 300) : null });
};
add('AI: Ad Match', 'Build Ad Match');
add('Gemini: Media', 'Build Media Request');
const text = $('Media to Text').isExecuted ? $('Media to Text').first().json.text : m.text;
return [{ json: { p: {
  user_id: m.user_id, phone: m.phone, wa_id: m.waId, content: text || '[media]', kind: m.kind, quoted_id: m.quotedId || null,
  tap: m.tap ? m.tap.id : null, wa_ts: m.ts, test: !!m.test, usage,
} } }];

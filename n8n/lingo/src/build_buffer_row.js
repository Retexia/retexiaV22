// One row for the batching buffer (text or the media description), with the AI usage of this
// message's voice note / image / ad match so every call is logged even if the batch moves on.
const m = $('Message').first().json;
const usage = [];
const add = (node, builder) => {
  if (!$(node).isExecuted) return;
  const g = $(node).first().json || {};
  const b = $(builder).first().json || {};
  if (g.usageMetadata) usage.push({ stage: b.stage, model: b.model, usage: g.usageMetadata, ok: !g.error });
};
add('Gemini: Ad Match', 'Build Ad Match');
add('Gemini: Media', 'Build Media Request');
const text = $('Media to Text').isExecuted ? $('Media to Text').first().json.text : m.text;
return [{ json: { p: {
  lingo_user_id: m.lingo_user_id, phone: m.phone, wa_id: m.waId, content: text || '[media]', quoted_id: m.quotedId || null,
  tap: m.tap ? m.tap.id : null, wa_ts: m.ts, test: !!m.test, usage,
} } }];

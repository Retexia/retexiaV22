// More than HISTORY_LIMIT past messages → the older ones (and the old summary) become one ~30-word
// summary. The newest KEEP_LAST stay word for word so a short "ow" / "yes" still makes sense.
// The messages themselves stay in the Inbox; only the AI's view of the chat gets shorter.
const cfg = $('Config').first().json;
const m = $('Message').first().json;
const ctx = $('Claim Batch').first().json;
const h = ctx.history || [];
const keep = Math.max(0, Number(cfg.KEEP_LAST) || 0);
const old = h.slice(0, Math.max(0, h.length - keep));
const label = r => (r === 'c' ? 'C: ' : 'B: ');
const models = (m.settings || {}).ai_models || {};
const lines = (ctx.summary ? ['Summary so far: ' + ctx.summary] : []).concat(old.map(x => label(x.r) + x.c));

return [{ json: {
  upto: old.length ? old[old.length - 1].id : null,
  stage: 'summary',
  model: models.summary || cfg.MODEL_FAST,
  req: {
    systemInstruction: { parts: [{ text: 'Summarize this shop WhatsApp chat in max 30 English words. Keep product names, what the customer asked or decided, order details, and any question we are still waiting on.' }] },
    contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
    generationConfig: { maxOutputTokens: 512 },
  },
} }];

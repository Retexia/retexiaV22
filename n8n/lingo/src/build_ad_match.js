// First customer from a NEW ad: one small AI call decides which product the ad sells.
// The answer is saved (bot_ads), so later customers from that ad cost 0 tokens. This is the
// only call that sees the seller's whole product list, once per ad.
const cfg = $('Config').first().json;
const m = $('Message').first().json;
const g = $input.first().json;
const ad = g.ad || {};
const list = (g.products || []).map(p => `${p.id}:${p.n}${p.k ? ' (' + String(p.k).slice(0, 80) + ')' : ''}`).join('\n');
const models = (m.settings || {}).ai_models || {};

return [{ json: {
  stage: 'ad_match',
  model: models.ad_match || cfg.MODEL_FAST,
  req: {
    systemInstruction: { parts: [{ text: 'Which product does this Facebook/Instagram ad sell? Return JSON {"p": product id}, or {"p": 0} if none fits.' }] },
    contents: [{ role: 'user', parts: [{ text: `Ad headline: ${ad.headline || '-'}\nAd text: ${ad.body || '-'}\n\nProducts:\n${list}` }] }],
    generationConfig: {
      maxOutputTokens: 256, responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { p: { type: 'integer' } }, required: ['p'] },
    },
  },
} }];

// First customer from a NEW ad whose words didn't name a product clearly: one small AI call decides
// which product the ad sells. Saved in lingo_feeder.ads, so later customers from that ad cost nothing.
// The only call that sees the whole product list, once per ad.
const ai = (($('Message').first().json.seller || {}).ai) || {};
const g = $input.first().json;
const ad = g.ad || {};
const list = (g.products || []).map(p => `${p.id}: ${p.n}${p.k ? ' (' + String(p.k).slice(0, 60) + ')' : ''}`).join('\n');
const model = ai.ad_match || ai.cheap || 'gpt-5.4-nano';
const req = {
  model,
  messages: [
    { role: 'system', content: 'Which product does this Facebook/Instagram ad sell? Answer with the product id from the list, or 0 if none fits.' },
    { role: 'user', content: `Ad headline: ${ad.headline || '-'}\nAd text: ${ad.body || '-'}\n\nProducts:\n${list}` },
  ],
  response_format: { type: 'json_schema', json_schema: { name: 'ad_product', strict: true, schema: {
    type: 'object', additionalProperties: false, properties: { p: { type: 'integer' } }, required: ['p'] } } },
  max_completion_tokens: 200,
};
if (/^gpt-5/.test(model) && ai.openai_reasoning) req.reasoning_effort = String(ai.openai_reasoning);
return [{ json: { task: 'ad_match', provider: 'openai', model, req, started: Date.now() } }];

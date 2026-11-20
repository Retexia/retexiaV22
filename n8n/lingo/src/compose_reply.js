// Puts the answer for a real product question into the reply: a saved answer (cache), or the reply
// AI's answer after the OUTPUT GUARD (code): no banned claims, every number must be in the facts,
// short enough, and in the customer's script. A failed check, or no AI allowance left this month
// (degrade mode), sends "we'll check and reply" and hands the chat to the seller.
const plan = $('Plan Reply').first().json;
const cache = $('Cache Get').isExecuted ? $('Cache Get').first().json : {};
const g = $('Gemini: Reply').isExecuted ? ($('Gemini: Reply').first().json || {}) : null;
const gtext = x => ((((x || {}).candidates || [])[0] || {}).content || { parts: [] }).parts.filter(p => !p.thought).map(p => p.text || '').join('');

let r = '', route = 'ai', why = '', cacheKey = null, cachePut = null;
if (cache.hit && cache.answer) {
  r = String(cache.answer); route = 'cache'; cacheKey = cache.key;
} else if (!g) {
  why = 'AI allowance used up this month';
} else {
  const raw = gtext(g);
  try { r = String(JSON.parse(raw.replace(/```(json)?/g, '').trim()).r || '').trim(); } catch (e) { r = raw.trim(); }
  if (!r) why = g.error ? 'AI call failed' : 'empty AI answer';
  if (!why) {
    const low = r.toLowerCase();
    const banned = (plan.guard.banned || []).find(b => low.includes(b));
    const nums = s => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/,/g, '').replace(/\.0+$/, '').replace(/^0+(?=\d)/, ''));
    const allowed = new Set(nums(plan.guard.facts));
    const strange = nums(r).filter(n => !allowed.has(n));
    const sinhala = (r.match(/[඀-෿]/g) || []).length;
    const latin = (r.match(/[A-Za-z]/g) || []).length;
    if (banned) why = `banned claim: ${banned}`;
    else if (strange.length) why = `number not in the facts: ${strange.slice(0, 3).join(', ')}`;
    else if (Array.from(r).length > 600) why = 'answer too long';
    else if (plan.lang === 'si' && sinhala < latin * 0.5) why = 'not in Sinhala script';
    else if ((plan.lang === 'sg' || plan.lang === 'en') && sinhala > 0) why = 'Sinhala script for a Singlish/English customer';
  }
  if (!why && plan.cache) cachePut = { ...plan.cache, answer: r, product_id: plan.guard.product_id, product_id_feeder: plan.guard.product_id_feeder };
}

let blocks, save = { ...plan.save };
if (why) {
  blocks = plan.blocks.filter(b => b.kind === 'image' || (b.kind === 'text' && b.pid)).concat([{ kind: 'text', text: plan.fixed_will_check }]);
  save.handoff = { reason: `will check: ${why}`, q: plan.save.meta.q };
  save.stage = 'handoff';
  save.unsure = false;
  route = 'human';
  save.log = [save.log, `[will check, handed to the shop: ${why}]`].filter(Boolean).join('\n');
} else {
  blocks = plan.blocks.map(b => (b.kind === 'ai' ? { kind: 'text', text: r } : b));
  save.log = [r ? `[answered: ${r.slice(0, 160)}]` : '', save.log].filter(Boolean).join('\n');
}
save.route = route;
save.cache_key = cacheKey;
save.cache_put = cachePut;
return [{ json: { blocks, save } }];

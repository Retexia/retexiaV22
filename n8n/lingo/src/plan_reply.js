// Decides the whole reply in code (a state machine), aiming for a confirmed order:
//   • a product the customer hasn't seen yet → its photo + long description, then ask for details
//   • price / delivery / payment / contact / shop / stock → the seller's fixed text, numbers from
//     the product row (no AI)
//   • an FAQ the middle AI picked → its answer as written (no AI)
//   • a real product question with no FAQ → answer cache, then the reply AI (only the product
//     fields for that topic)
//   • details → ask only for what's missing → summary with Confirm / Change / Cancel
//   • not sure → one clarifying question with buttons; not sure twice, a complaint or "talk to a
//     person" → hand the chat to the seller (Inbox) and pause the bot for it
const cfg = $('Config').first().json;
const m = $('Message').first().json;
const ctx = $('Claim Batch').first().json;
const u = $('Understand').first().json;
const history = $('Save Summary').isExecuted ? ($('Save Summary').first().json.history || []) : (ctx.history || []);
const settings = ctx.settings || m.settings || {};
const cust = ctx.customer || {};
const fixed = ctx.fixed || {};
const matches = ctx.matches || [];
const faqs = ctx.faqs || [];
const budget = ctx.budget || {};

const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const gtext = g => ((((g || {}).candidates || [])[0] || {}).content || { parts: [] }).parts.filter(x => !x.thought).map(x => x.text || '').join('');

// ---------- what the customer wants ----------
const KINDS = ['details', 'confirm', 'change', 'cancel', 'question', 'other_product', 'complaint', 'human', 'chat'];
const TOPICS = ['price', 'delivery', 'payment', 'usage', 'ingredients', 'safety', 'results', 'stock', 'contact', 'shop', 'other'];
let c = null;
if (u.rule) c = u.c;
else if ($('Gemini: Classify').isExecuted) {
  try { c = JSON.parse(gtext($('Gemini: Classify').first().json).replace(/```(json)?/g, '').trim()); } catch (e) { c = null; }
  if (!c || !KINDS.includes(c.k)) c = null;                 // invalid output = not sure; a turn never crashes on AI output
}
const unsure = !!u.typed && (!c || c.u === true);
const k = c && !unsure ? c.k : 'chat';
const t = c && TOPICS.includes(c.t) ? c.t : 'other';
const lang = c && ['si', 'sg', 'en'].includes(c.l) ? c.l : (cust.lang || settings.default_lang || 'si');
const L = lang === 'en' ? 'en' : 'si';
const q = cut(String((c && c.q) || '').trim() || u.now, 200);
const o = (c && !unsure && c.o) || {};

// ---------- button / list taps (exact, no AI) ----------
let act = null, pick = 0, info = false, human = false;
for (const id of u.taps || []) {
  if (/^P_\d+$/.test(id)) pick = Number(id.slice(2));
  else if (['ORDER', 'CONFIRM', 'CHANGE', 'CANCEL'].includes(id)) act = id;
  else if (id === 'INFO') info = true;
  else if (id === 'HUMAN') human = true;
}
if (!act) act = { details: 'DETAILS', confirm: 'CONFIRM', change: 'CHANGE', cancel: 'CANCEL' }[k] || null;

// ---------- product: pick → quoted product → current (ad) → the AI's pick among the DB matches ----------
const byId = {};
for (const p of [ctx.product, ...matches]) if (p) byId[Number(p.id)] = p;
let pid = ctx.product ? Number(ctx.product.id) : 0;
let switched = false;
const want = pick || Number(u.quotedPid) || (c && !unsure ? Number(c.p) || 0 : 0) || (!pid && matches.length === 1 ? Number(matches[0].id) : 0);
if (want && byId[want] && want !== pid) { pid = want; switched = true; }
const prod = pid ? byId[pid] : null;
const seen = (cust.seen_products || []).map(Number);

// ---------- order ----------
const fields = Array.isArray(settings.order_fields) && settings.order_fields.length ? settings.order_fields : ['name', 'address', 'contact'];
const gave = has(o.n) || has(o.a) || has(o.ph) || Number(o.qty) > 0;
const lastBot = [...history].reverse().find(x => x.r === 'b');
const changing = !!(lastBot && String(lastBot.c).includes('[asked what to change]'));
let order = ctx.order ? { ...ctx.order } : null;
let target = null, event = '';
const fresh = () => ({ id: null, product_id: null, qty: null, name: null, address: null, contact: null, status: 'draft' });

if (act === 'CANCEL') {
  if (order && order.status !== 'cancelled') { order.status = 'cancelled'; target = order; event = 'cancelled'; }
} else if (act === 'CHANGE' || act === 'CONFIRM') {
  if (order && order.status !== 'cancelled') target = order;
} else if (act === 'ORDER' || act === 'DETAILS' || gave) {
  if (order && (order.status === 'draft' || (order.status === 'confirmed' && changing))) target = order;
  else target = fresh();
}
const missingOf = x => { const mm = fields.filter(f => !has(x[f])); if (!x.product_id) mm.unshift('product'); return mm; };
if (target && event !== 'cancelled') {
  if (has(o.n)) target.name = cut(String(o.n).trim(), 80);
  if (has(o.a)) target.address = cut(String(o.a).trim(), 300);
  if (has(o.ph)) {
    const ph = String(o.ph);
    target.contact = /same|this|meka|මේ/i.test(ph) && !/\d{6,}/.test(ph) ? '0' + String(cust.phone).replace(/^94/, '') : ph.replace(/[^\d+ ]/g, '').trim();
  }
  if (Number(o.qty) > 0) target.qty = Math.min(99, Math.round(Number(o.qty)));
  if (pid && target.status !== 'confirmed' && (!target.product_id || switched)) target.product_id = pid;
  if (!target.qty) target.qty = 1;
  if (act === 'CONFIRM') {
    if (target.status === 'draft' && !missingOf(target).length) { target.status = 'confirmed'; event = 'confirmed'; }
    else if (target.status === 'confirmed') event = 'already';
  } else if (target.status === 'confirmed' && gave) {
    target.status = 'draft';                                  // changed after confirming → confirm again
  }
  order = target;
}
const missing = order && order.status === 'draft' ? missingOf(order) : [];
const complete = !!(order && order.status === 'draft' && !missing.length);

// ---------- fixed texts ----------
const oprod = (order && byId[Number(order.product_id)]) || prod;
const LABEL = { si: { name: 'නම', address: 'ලිපිනය', contact: 'දුරකථන අංකය', product: 'product එක' },
                en: { name: 'name', address: 'address', contact: 'phone number', product: 'product' } }[L];
const missingText = (() => {
  const w = missing.map(x => LABEL[x] || x);
  return w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + (L === 'en' ? ' and ' : ' සහ ') + w[w.length - 1];
})();
const qty = (order && order.qty) || 1;
const vals = {
  business: settings.business || '', name: (order && order.name) || cust.name || '',
  product: (oprod || {}).name || '', price: money((oprod || {}).price), delivery_fee: money((oprod || {}).delivery_fee),
  qty, address: (order && order.address) || '', contact: (order && order.contact) || '',
  total: money(Number((oprod || {}).price || 0) * qty + Number((oprod || {}).delivery_fee || 0)),
  missing: missingText, shop_phone: settings.shop_phone || '', shop_address: settings.shop_address || '',
  delivery_days: settings.delivery_days || 3,
};
const fill = s => String(s || '').replace(/\{(\w+)\}/g, (x, key) => (key in vals ? String(vals[key]) : x))
  .replace(/[ \t]{2,}/g, ' ').replace(/ ([!?.,])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
const fx = key => { const f = fixed[key] || {}; return fill(L === 'en' ? (f.en || f.si) : f.si); };
const btn = (id, key) => ({ id, title: fx(key) });
const productList = () => ({ kind: 'list', text: fx('pick_product'), button: fx('btn_menu'),
  rows: matches.map(p => ({ id: `P_${p.id}`, title: p.name, description: p.short_info || '' })) });

// ---------- build the reply ----------
const blocks = [], log = [], seenAdd = [];
let route = u.rule ? 'rule' : (!u.typed ? 'tap' : 'fixed');
let ai = null, faqId = null, handoff = null;

if (human || k === 'human' || k === 'complaint') handoff = { reason: k === 'complaint' ? 'complaint' : 'asked for a person' };
else if (unsure && Number(cust.unsure_streak || 0) + 1 >= 2) handoff = { reason: 'not sure what they mean (twice)' };

if (handoff) {
  blocks.push({ kind: 'text', text: fx('handoff') });
  log.push(`[handed to the shop: ${handoff.reason}]`);
  route = 'human';
} else if (unsure) {
  blocks.push({ kind: 'buttons', text: fx('clarify'), buttons: [btn('ORDER', 'btn_order'), btn('INFO', 'btn_info'), btn('HUMAN', 'btn_human')] });
  log.push('[asked what they mean]');
} else {
  const welcome = !!(prod && (!seen.includes(pid) || info) && !['CONFIRM', 'CANCEL'].includes(act) && !event);
  if (welcome) {
    const desc = fill(prod.long_description || prod.short_info || prod.name);
    blocks.push(prod.image_url ? { kind: 'image', image: prod.image_url, caption: desc, pid } : { kind: 'text', text: desc, pid });
    seenAdd.push(pid);
    log.push(`[sent ${prod.name} photo + details]`);
  }

  if (event === 'cancelled') {
    blocks.push({ kind: 'text', text: fx('order_cancelled') }); log.push('[order cancelled]');
  } else if (event === 'confirmed' || event === 'already') {
    blocks.push({ kind: 'text', text: fx('order_confirmed') }); log.push('[order confirmed]');
  } else if (!prod) {
    if (matches.length > 1) { blocks.push(productList()); log.push('[asked which product]'); }
    else { blocks.push({ kind: 'text', text: fx('ask_product') }); log.push('[asked which product]'); }
  } else {
    // 1) answer what they asked
    const waitingChange = act === 'CHANGE' && !gave;
    if (waitingChange) {
      blocks.push({ kind: 'text', text: fx('ask_change') }); log.push('[asked what to change]');
    } else if (k === 'question') {
      const FIXED_TOPIC = { price: 'price', delivery: 'delivery', payment: 'payment', contact: 'contact', shop: 'shop' };
      const coveredByWelcome = welcome && ['price', 'delivery', 'other'].includes(t);   // the photo text has price & delivery
      const faq = !switched && Number(c.faq) ? faqs.find(f => Number(f.id) === Number(c.faq)) : null;
      const faqAnswer = faq ? (L === 'en' ? (faq.en || faq.si) : (faq.si || faq.en)) : '';
      if (coveredByWelcome) { /* nothing extra */ }
      else if (FIXED_TOPIC[t] && fx(FIXED_TOPIC[t])) { blocks.push({ kind: 'text', text: fx(FIXED_TOPIC[t]) }); log.push(`[answered ${t}]`); }
      else if (t === 'stock') {
        if (fx('stock')) { blocks.push({ kind: 'text', text: fx('stock') }); log.push('[answered stock]'); }
        else { blocks.push({ kind: 'text', text: fx('will_check') }); handoff = { reason: 'stock question (no stock text set)' }; route = 'human'; log.push('[will check stock, handed to the shop]'); }
      } else if (faqAnswer) {
        blocks.push({ kind: 'text', text: fill(faqAnswer) }); faqId = faq.id; route = 'faq'; log.push(`[answered FAQ: ${cut(faq.q, 60)}]`);
      } else {
        blocks.push({ kind: 'ai' }); ai = { topic: t };
      }
    } else if (k === 'other_product' && !switched) {
      if (matches.length > 1) { blocks.push(productList()); log.push('[asked which product]'); }
      else { blocks.push({ kind: 'ai' }); ai = { topic: 'unknown_product' }; }
    }

    // 2) always move towards the order (not after a hand-off)
    if (!waitingChange && !handoff) {
      if (complete) {
        blocks.push({ kind: 'buttons', text: fx('order_summary'),
          buttons: [btn('CONFIRM', 'btn_confirm'), btn('CHANGE', 'btn_change'), btn('CANCEL', 'btn_cancel')] });
        log.push('[sent order summary, asked to confirm]');
      } else if (order && order.status === 'draft' && fields.some(f => has(order[f]))) {
        blocks.push({ kind: 'text', text: fx('ask_missing') });
        log.push(`[asked missing: ${missing.join(', ')}]`);
      } else if (!order || order.status !== 'confirmed') {
        blocks.push({ kind: 'text', text: welcome || act === 'ORDER' ? fx('ask_details') : fx('nudge') });
        log.push('[asked name/address/phone]');
      } else if (!blocks.length) {
        blocks.push({ kind: 'text', text: fx('chat_reply') }); log.push('[said thanks]');
      }
    }
  }
}
if (!blocks.length) { blocks.push({ kind: 'text', text: fx('chat_reply') }); log.push('[said thanks]'); }

// ---------- stage ----------
let stage = cust.stage || 'new';
if (handoff) stage = 'handoff';
else if (event === 'cancelled') stage = 'cancelled';
else if (event === 'confirmed' || event === 'already' || (order && order.status === 'confirmed')) stage = 'ordered';
else if (complete) stage = 'confirming';
else if (order && order.status === 'draft' && fields.some(f => has(order[f]))) stage = 'collecting';
else if (prod && ['new', 'handoff', 'cancelled'].includes(stage)) stage = 'browsing';

// ---------- reply AI request (only real product questions; only that topic's fields, ≤600 chars) ----------
let aiReq = null, facts = '';
if (ai && prod) {
  const langName = { si: 'Sinhala (Sinhala script)', sg: 'Singlish (Sinhala written in English letters)', en: 'English' }[lang];
  const list = {
    usage: [prod.usage],
    ingredients: [prod.ingredients],
    safety: [prod.precautions, prod.usage],
    results: [prod.short_info, prod.symptoms],
    unknown_product: ['We do not have details of that product here. We only have the products we sell.'],
  }[ai.topic] || [prod.short_info, prod.usage, prod.precautions];
  facts = cut(list.filter(has).join(' | ') || 'No details.', 600);
  const sys = `You are a staff member at a Sri Lankan online shop, answering a customer on WhatsApp. Never say you are a bot or AI.
Answer only the question, like a real person: 1-3 short sentences, polite, not over-friendly, 1-2 fitting emojis.
Use only the facts. Never invent anything, including numbers; if the facts don't answer it, say you will check and reply soon.
Health products: never promise a cure and never tell anyone to stop a doctor's medicine; for pregnancy, children, long-term illness or other medicines, advise checking with a doctor.
Do not ask for order details. Return JSON {"r": reply}.`;
  aiReq = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: `Product: ${prod.name}\nFacts: ${facts}\nCustomer: ${q}\nWrite in ${langName}.` }] }],
    generationConfig: {
      maxOutputTokens: 1024, responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object', properties: { r: { type: 'string' } }, required: ['r'] },
    },
  };
  if (has(cfg.REPLY_THINKING)) aiReq.generationConfig.thinkingConfig = { thinkingLevel: String(cfg.REPLY_THINKING) };
}
const models = settings.ai_models || {};

return [{ json: {
  route: aiReq ? 'ai' : 'send',
  final_route: route,
  lang, blocks, req: aiReq,
  stage_name: 'reply',
  model: models.reply || cfg.MODEL_REPLY,
  degrade: !!budget.degrade,
  cache: aiReq ? { facts_hash: prod.facts_hash, t: ai.topic, lang, q } : null,
  guard: aiReq ? {
    facts: [facts, prod.price, prod.delivery_fee, Number(prod.price || 0) + Number(prod.delivery_fee || 0), settings.shop_phone, settings.delivery_days].join(' '),
    banned: (settings.banned_claims || []).map(x => String(x).toLowerCase()).filter(Boolean),
    product_id: prod.id, product_id_feeder: prod.feeder_id,
  } : null,
  fixed_will_check: fx('will_check'),
  save: {
    lingo_user_id: m.lingo_user_id, phone: m.phone, test: !!m.test,
    msgs: (ctx.msgs || []).map(x => ({ wa_id: x.wa_id, t: x.t })),
    log: log.join('\n'),
    meta: { k: c ? c.k : null, t: c ? c.t : null, q, faq: c ? Number(c.faq) || 0 : 0, u: unsure, rule: u.rule ? u.rule.id : null, pid: pid || null, prompt: u.prompt_version },
    product_id: pid || null,
    seen_add: seenAdd,
    lang, stage,
    unsure: unsure && !handoff,
    handoff,
    route,
    faq_id: faqId,
    rule_id: u.rule ? u.rule.id : null,
    order: target ? {
      id: order.id || null, product_id: order.product_id || null, qty: order.qty || 1,
      name: order.name || null, address: order.address || null, contact: order.contact || null, status: order.status,
    } : null,
  },
} }];

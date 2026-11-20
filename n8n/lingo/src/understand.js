// Level 0 / Level 1: what does the customer want?
//   • Only button / list taps → understood exactly, no AI.
//   • A quick rule matches the WHOLE batched text (hi, ok, kiyada?, a phone number, "ow" while
//     confirming…) → no AI.
//   • Otherwise one small "middle AI" call (prompt mid-3) with only: the current product, ≤4
//     products the database matched, the stage and missing fields, ≤15 FAQ questions, the
//     language, the chat summary + last 2 messages, the quote and the new text.
const cfg = $('Config').first().json;
const m = $('Message').first().json;
const ctx = $('Claim Batch').first().json;
const sum = $('Save Summary').isExecuted ? $('Save Summary').first().json : { summary: ctx.summary, history: ctx.history };
const history = sum.history || [];
const cust = ctx.customer || {};
const settings = ctx.settings || m.settings || {};
const prod = ctx.product;
const matches = ctx.matches || [];
const faqs = ctx.faqs || [];
const qp = ctx.quoted_pids || {};
const stage = cust.stage || 'new';
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const has = v => v !== undefined && v !== null && String(v).trim() !== '';

const msgs = ctx.msgs || [];
const taps = msgs.filter(x => x.tap).map(x => x.tap);
const typedList = msgs.filter(x => !x.tap).map(x => x.t);
const now = cut(typedList.join('\n'), 1500);
const typed = typedList.length > 0 && /\S/.test(now);

let quotedPid = 0;
for (const x of msgs) if (x.qid && qp[x.qid]) quotedPid = Number(qp[x.qid]);

const fields = (Array.isArray(settings.order_fields) && settings.order_fields.length ? settings.order_fields : ['name', 'address', 'contact']);
const o = ctx.order;
let missing = [];
if (o && o.status === 'draft') missing = fields.filter(f => !has(o[f]));

// ---------- level 0: quick rules ----------
const normalize = s => String(s || '').normalize('NFC').toLowerCase()
  .replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu, '')
  .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
let rule = null, c = null;
if (typed && !taps.length) {
  const norm = normalize(now);
  const probe = norm || 'ok';                          // only emojis (👍 🙏) = "ok"
  const compact = probe.replace(/[\s-]/g, '');
  for (const r of ctx.rules || []) {
    if (Array.isArray(r.st) && r.st.length && !r.st.includes(stage)) continue;
    let re;
    try { re = new RegExp(r.re, 'iu'); } catch (e) { continue; }
    if (re.test(probe) || (r.k === 'details' && re.test(compact))) {
      rule = { id: r.id, k: r.k, t: r.t || 'other' };
      c = { k: r.k, t: r.t || 'other', faq: 0, p: 0, q: '', l: '', o: r.k === 'details' ? { ph: compact } : {}, u: false };
      break;
    }
  }
}

// ---------- level 1: the middle AI ----------
const skip = !typed || !!rule;
const label = r => (r === 'c' ? 'C: ' : 'B: ');
const last2 = history.slice(-2);
const stageLine = 'Stage: ' + stage + (missing.length ? ', missing ' + missing.join(', ') : '')
  + (o && o.status === 'draft' && !missing.length ? ', order complete, we asked them to confirm' : '')
  + (o && o.status === 'confirmed' ? ', order confirmed' : '');
const user = [
  'Product: ' + (prod ? `${prod.id}:${prod.name}` : 'unknown'),
  matches.length ? 'Others: ' + matches.map(p => `${p.id}:${p.name}`).join(' | ') : '',
  stageLine,
  faqs.length ? 'FAQs: ' + faqs.map(f => `${f.id}:${cut(f.q, 70)}`).join(' | ') : '',
  `Lang: ${cust.lang || settings.default_lang || 'si'}`,
  (sum.summary || last2.length) ? 'Chat:' + (sum.summary ? '\nSummary: ' + cut(sum.summary, 300) : '') + (last2.length ? '\n' + last2.map(x => label(x.r) + cut(x.c, 200)).join('\n') : '') : '',
  quotedPid ? `Quote: [our msg about product ${quotedPid}]` : '',
  'Now: ' + now,
].filter(Boolean).join('\n');

const system = `Read a Sri Lankan shop's WhatsApp chat. Return JSON.
k: details = gives name/address/phone/quantity | confirm = says yes to our order summary | change = wants to change order details | cancel = cancels | question = asks something | other_product = asks about a product that is not Product | complaint = unhappy or problem with an order | human = wants a person or a call | chat = greeting, thanks, ok, anything else.
t (for question): price | delivery | payment | usage | ingredients | safety | results | stock | contact | shop | other.
faq: id from FAQs if one answers the question, else 0.
p: id from Others if they want that product, else 0.
q: what they want now, max 15 simple English words, topic first. Resolve "meka/eka/this" from Quote and Chat.
l: si = writes Sinhala script, sg = Sinhala in English letters, en ONLY if they ask us to use English; if unsure keep Lang.
o: details found in Now only: n name, a address, ph phone ("same" if they say use this WhatsApp number), qty.
u: true if you are not sure what they mean.`;

const schema = {
  type: 'object',
  properties: {
    k: { type: 'string', enum: ['details', 'confirm', 'change', 'cancel', 'question', 'other_product', 'complaint', 'human', 'chat'] },
    t: { type: 'string', enum: ['price', 'delivery', 'payment', 'usage', 'ingredients', 'safety', 'results', 'stock', 'contact', 'shop', 'other'] },
    faq: { type: 'integer' },
    p: { type: 'integer' },
    q: { type: 'string' },
    l: { type: 'string', enum: ['si', 'sg', 'en'] },
    o: { type: 'object', properties: { n: { type: 'string' }, a: { type: 'string' }, ph: { type: 'string' }, qty: { type: 'integer' } } },
    u: { type: 'boolean' },
  },
  required: ['k', 't', 'faq', 'p', 'q', 'l', 'o', 'u'],
};
const models = settings.ai_models || {};

return [{ json: {
  now, typed, taps, skip, rule, c, stage, missing, quotedPid,
  prompt_version: 'mid-3',
  prompt_chars: skip ? 0 : system.length + user.length,
  stage_name: 'classify',
  model: models.classify || cfg.MODEL_FAST,
  req: skip ? null : {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json', responseJsonSchema: schema },
  },
} }];

// Lingo's whole reply, decided in code (one consistent flow for every chat):
//   first message from an ad → 1) product photo + full description  2) "Good evening Nimal 😊 I'm Lingo…"
//     with the total and the details form, and buttons 🛒 Order · 📖 How to use · 📞 Call me
//   order: quantity list → details (or "same details as last time?") → only what's missing → summary with
//     ✅ Confirm · ✏️ Change · ❌ Cancel → thank-you with their name + how to use the product
//   questions: fixed texts (price, delivery, payment, shop, how to use) or the AI's answer after the
//     OUTPUT GUARD (no banned claims, no numbers that aren't in the facts, right script, short)
//   another product mentioned → Lingo switches to it (photo + details) and can take a second order
//   every turn also sets the chat's status (only clicked · asking · giving details · ordered · cancelled ·
//   not interested · spam) and "call them" when a person is needed.
// @include lib.js
const m = $('Message').first().json;
const ctx = $('Claim Batch').first().json;
const u = $('Understand').first().json;
const chat = ctx.chat || {};
const seller = ctx.seller || m.seller || {};
const texts = ctx.texts || {};
const banned = (Array.isArray(ctx.banned) ? ctx.banned : []).map(x => String(x).toLowerCase()).filter(Boolean);

// ---------- the AI's reading (if it was asked) ----------
const INTENTS = ['question', 'details', 'same_details', 'want_order', 'confirm', 'change', 'cancel', 'other_product', 'call_me', 'complaint', 'not_interested', 'chat', 'unclear'];
const parse = s => { try { return JSON.parse(String(s || '').replace(/```(json)?/g, '').trim()); } catch (e) { return null; } };
const gtext = g => ((((g || {}).candidates || [])[0] || {}).content || { parts: [] }).parts.filter(x => !x.thought).map(x => x.text || '').join('');
let c = u.c, aiFrom = '', aiError = '';
if (u.need_ai) {
  const o = $('OpenAI: Brain').isExecuted ? ($('OpenAI: Brain').first().json || {}) : null;
  const g = $('Gemini: Brain').isExecuted ? ($('Gemini: Brain').first().json || {}) : null;
  let got = null;
  if (o && !o.error) { got = parse((((o.choices || [])[0] || {}).message || {}).content); if (got) aiFrom = 'openai'; }
  if (!got && g && !g.error) { got = parse(gtext(g)); if (got) aiFrom = 'gemini'; }
  if (got && INTENTS.includes(got.intent)) c = got;
  else { c = { intent: 'ai_failed' }; aiError = String(((o || {}).error || {}).message || ((g || {}).error || {}).message || 'no answer').slice(0, 200); }
}
c = c || { intent: 'none' };
const intent = c.intent;

// ---------- language: the AI's reading > the words they typed > the chat so far ----------
let lang = ['si', 'sg', 'en'].includes(u.lang_guess) ? u.lang_guess : (chat.lang || 'si');
if (aiFrom && ['si', 'sg', 'en'].includes(c.lang)) lang = c.lang;
// A different wording from turn to turn (settings.variants), the same within one reply.
const T = makeText(texts, lang, ctx.variants || {}, `${m.phone}|${chat.last_out_at || ''}|${(ctx.msgs || []).length}`);

// ---------- the product in focus: a tapped one → a quoted one → the AI's pick → the only one named ----------
const byId = {};
for (const p of [...(ctx.catalog || []), ctx.product, ctx.quoted, ...(ctx.matches || [])]) if (p && p.enabled !== false) byId[Number(p.id)] = p;
let prod = ctx.product && ctx.product.enabled !== false ? ctx.product : null;
let pid = prod ? Number(prod.id) : 0, switched = false, want = 0;
for (const t of u.taps) if (/^P_\d+$/.test(t)) want = Number(t.slice(2));
if (!want && ctx.quoted && Number(ctx.quoted.id) !== pid) want = Number(ctx.quoted.id);
if (!want && aiFrom && Number(c.product_id) && byId[Number(c.product_id)]) want = Number(c.product_id);
if (!want && !pid) {
  const ms = (ctx.matches || []).filter(p => p.enabled !== false);
  if (ms.length === 1 || (ms.length > 1 && ms[0].score >= 8 && ms[0].score >= 2 * ms[1].score)) want = Number(ms[0].id);
}
if (want && byId[want] && want !== pid) { pid = want; prod = byId[want]; switched = !!ctx.product; }
const seen = (chat.products_seen || []).map(Number);

// ---------- values for the texts ----------
const waPhone = m.test ? '0700000000' : localPhone(m.phone);
let draft = ctx.order ? { ...ctx.order } : null;
const saved = chat.details || {};
/** Their first name: what they typed for the order → their last order → the WhatsApp profile name. */
const fname = () => firstName((draft && draft.name) || saved.name || '') || firstName(chat.profile_name);
const totalFor = (p, q) => money(Number(p.price) * q + Number(p.delivery_fee));
const V = (extra = {}) => ({
  greet: T(greetKey()), name: fname(), business: seller.business || '', location: seller.location ? ', ' + seller.location : '',
  delivery_days: seller.delivery_days || '2-3', call_hours: seller.call_hours || '',
  product: prod ? prod.name : '', price: prod ? money(prod.price) : '', delivery_fee: prod ? money(prod.delivery_fee) : '', total: prod ? money(prod.total) : '',
  ...extra,
});
const OV = o => {
  const p = byId[Number(o.product_id)] || prod || {};
  return V({ product: p.name || o.product_name || '', qty: o.qty || 1, o_name: o.name || '', o_first: firstName(o.name) || o.name || fname(),
             o_address: o.address || '', o_phones: [o.phone1, o.phone2].filter(Boolean).join(' / '),
             total: p.price ? totalFor(p, o.qty || 1) : money(o.total), delivery_fee: money(p.delivery_fee || o.delivery_fee) });
};
const B = (id, key) => ({ id, title: clip(T(key), 20) });
const title = s => clip(/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s, 24);

// ---------- what we send ----------
const blocks = [], log = [], seenAdd = [], answers = [];
let awaitingOut = null, orderingNow = false, event = '', needsCall = false, callReason = '', pause = false, unsure = false, notInterested = false, detailsOut = null;
let route = u.need_ai ? 'ai' : (u.source === 'tap' ? 'tap' : 'code');
let stepAdded = false, reaction = '';
/** A WhatsApp reaction on the customer's message (❤️ order confirmed / thanks, 👍 details received). */
const react = e => { if (!reaction) reaction = e; };
const step = b => { blocks.push(b); stepAdded = true; };
const answer = (text, note) => { if (text) { answers.push(text); log.push(note); } };
/** The AI's reply as people text it: 2-3 short messages instead of one long one. */
const answerAi = (r, note) => { if (r) { answers.push(...splitReply(r).map(x => ({ split: true, text: x }))); log.push(note); } };

const intro = p => {
  const fillP = s => String(s || '').replace(/\{price\}/g, money(p.price)).replace(/\{delivery_fee\}/g, money(p.delivery_fee)).replace(/\{total\}/g, money(p.total));
  const cap = clip(fillP(p.long_description || p.short_description || p.name), 1024);
  blocks.push(p.picture_url ? { kind: 'image', image: p.picture_url, caption: cap, pid: p.id } : { kind: 'text', text: cap, pid: p.id, sep: true });
  seenAdd.push(Number(p.id));
  log.push(`[sent ${p.name} photo + details]`);
};

// ---------- the order ----------
const fresh = () => ({ id: null, product_id: pid, qty: 1, name: '', address: '', phone1: '', phone2: '', status: 'draft' });
const ensureDraft = () => { if (!draft || draft.status !== 'draft') draft = fresh(); if (pid && draft.product_id !== pid) draft.product_id = pid; return draft; };
/** A Sri Lankan number Lingo can give the courier: 10 digits, 0 then not 0. */
const validPhone = p => /^0[1-9]\d{8}$/.test(String(p || ''));
/** Just a town ("Matara", "Colombo 5", "No 5"): the courier can't find the house. */
const vagueAddress = a => {
  const t = String(a || '').trim();
  if (!t) return false;
  const words = t.split(/[\s,]+/).filter(Boolean);
  return Array.from(t).length < 10 || (words.length <= 2 && !/\d+\s*\//.test(t));
};
const showPhone = p => (/^0\d{9}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p);
const missingOf = o => ['name', 'address', 'phone'].filter(k => (k === 'phone' ? !validPhone(o.phone1) : k === 'address' ? (!has(o.address) || vagueAddress(o.address)) : !has(o[k])));
const anyDetail = o => !!o && (has(o.name) || has(o.address));
const savedFull = has(saved.name) && has(saved.address) && has(saved.phone);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s:,.-]+$/g, '').trim();
let badPhone = '', progress = false;
function applyDetails(d, opts = {}) {
  ensureDraft();
  const before = JSON.stringify([draft.name, draft.address, draft.phone1, draft.phone2, draft.qty]);
  const nm = cleanName(d.name);
  if (has(nm) && !/\d{3,}/.test(nm) && Array.from(nm).length >= 2) draft.name = clip(nm, 80);
  if (has(d.address)) draft.address = clip(cleanName(d.address), 300);
  let p1 = String(d.phone || '').trim();
  if (/^same$/i.test(p1)) p1 = waPhone;
  const l1 = localPhone(p1);
  if (l1 && validPhone(l1)) { if (opts.replace || !draft.phone1) draft.phone1 = l1; else if (l1 !== draft.phone1) draft.phone2 = l1; }
  else if (p1.replace(/\D/g, '').length >= 5) badPhone = clip(p1.replace(/[^\d+]/g, ''), 20);   // told to them, never saved
  if (has(d.phone_bad)) badPhone = clip(String(d.phone_bad), 20);
  const p2 = localPhone(d.phone2);
  if (p2 && validPhone(p2) && p2 !== draft.phone1) draft.phone2 = p2;
  if (Number(d.qty) > 0) draft.qty = Math.min(20, Math.round(Number(d.qty)));
  progress = progress || before !== JSON.stringify([draft.name, draft.address, draft.phone1, draft.phone2, draft.qty]);
  orderingNow = true;
}
const askQty = () => {
  step({ kind: 'list', text: T('ask_qty', V()), button: T('btn_qty'), section: T('f_qty'),
    rows: [1, 2, 3, 4, 5].map(n => ({ id: 'QTY_' + n, title: title(T('qty_row', { qty: n })), description: clip(T('qty_desc', { total: totalFor(prod, n) }), 72) })) });
  awaitingOut = 'qty'; orderingNow = true; log.push('[asked how many]');
};
const wordList = keys => { const w = keys.map(k => T('f_' + k)); return w.length < 2 ? w.join('') : w.slice(0, -1).join(', ') + T('and') + w[w.length - 1]; };
const askDetails = () => {
  step({ kind: 'text', ask: ['name', 'address', 'phone'], text: [badPhone ? T('phone_bad', V({ bad: badPhone })) : '', T('ask_details', V())].filter(Boolean).join('\n\n') });
  awaitingOut = 'details'; log.push('[asked name, address, phone]');
};
/** What's still missing or wrong, asked in one message: town only → the full address; a wrong number → say so;
 *  only the phone missing → "shall I use this WhatsApp number?" with buttons. */
const askMissing = () => {
  const vague = has(draft.address) && vagueAddress(draft.address);
  const miss = [!has(draft.name) && 'name', !has(draft.address) && 'address'].filter(Boolean);
  const parts = [];
  if (vague) parts.push(T('address_vague', V({ address: cut(draft.address, 40) })));
  if (miss.length) parts.push(T('ask_missing', V({ missing: wordList(miss) })));
  if (badPhone) parts.push(T('phone_bad', V({ bad: badPhone })));
  if (parts.length) {
    const ask = [...miss, ...(vague ? ['address'] : []), ...(badPhone ? ['phone'] : [])];
    step({ kind: 'text', ask, text: parts.join('\n\n') });
    awaitingOut = vague && !miss.length && !badPhone ? 'field_address' : !miss.length && !vague && badPhone ? 'field_phone' : 'details';
    log.push(`[asked for: ${ask.join(', ')}${vague ? ' (full address)' : ''}${badPhone ? ' (number was wrong)' : ''}]`);
  } else if (waPhone && chat.awaiting !== 'field_phone') {
    step({ kind: 'buttons', ask: ['phone'], text: T('ask_wa_phone', V({ wa_phone: showPhone(waPhone) })), buttons: [B('USE_WA', 'btn_wa_yes'), B('OTHER_PHONE', 'btn_wa_no')] });
    awaitingOut = 'phone'; log.push('[asked: use their WhatsApp number?]');
  } else {
    step({ kind: 'text', ask: ['phone'], text: T('ask_phone', V()) }); awaitingOut = 'field_phone'; log.push('[asked for the phone number]');
  }
};
const summary = () => {
  if (progress) react('👍');                    // their details are complete
  step({ kind: 'buttons', text: T('summary', OV(draft)), buttons: [B('CONFIRM', 'btn_confirm'), B('CHANGE', 'btn_change'), B('CANCEL', 'btn_cancel')] });
  awaitingOut = 'confirm'; orderingNow = true; log.push('[sent order summary, asked to confirm]');
};
const nextStep = () => {
  const miss = missingOf(draft);
  if (!miss.length && !badPhone) summary();
  else if (!anyDetail(draft) && miss.length >= 2 && !has(draft.phone1)) askDetails();
  else askMissing();
};
const sameDetails = () => {
  step({ kind: 'buttons', text: T('same_details', V({ o_name: saved.name, o_address: saved.address, o_phones: [saved.phone, saved.phone2].filter(Boolean).join(' / ') })),
    buttons: [B('SAME', 'btn_same'), B('NEW', 'btn_new')] });
  awaitingOut = 'same'; orderingNow = true; log.push('[asked: same details as last time?]');
};
const startOrder = (qty, viaTap) => {
  ensureDraft();
  if (qty) draft.qty = qty;
  if (!missingOf(draft).length && anyDetail(draft)) return summary();
  if (anyDetail(draft)) return nextStep();
  if (savedFull) return sameDetails();
  if (!qty && viaTap) return askQty();
  return askDetails();
};
const confirmOrder = () => {
  draft.status = 'confirmed'; event = 'confirmed'; orderingNow = false;
  const p = byId[Number(draft.product_id)] || prod;
  step({ kind: 'text', text: T('confirmed', OV(draft)), sep: true });
  if (p && has(p.how_to_use)) {
    step({ kind: 'text', text: T('how_to_use', V({ product: p.name, how_to_use: p.how_to_use, precautions: has(p.precautions) ? '\n\n⚠️ ' + p.precautions : '' })), sep: true });
  }
  detailsOut = { name: draft.name, address: draft.address, phone: draft.phone1, phone2: draft.phone2 || '' };
  awaitingOut = null; log.push('[order confirmed; sent thank-you and how to use]');
  react('❤️');
  // One short, no-pressure suggestion of a related product, once per chat.
  const rel = ctx.related;
  if (rel && rel.name && !(ctx.history || []).some(h => /\[suggested /.test(String(h.c)))) {
    step({ kind: 'text', text: T('suggest', V({ related: rel.name })), sep: true }); log.push(`[suggested ${rel.name}]`);
  }
};
const changePick = () => {
  step({ kind: 'list', text: T('change_pick', V()), button: T('btn_pick'), section: T('btn_change'),
    rows: [['CH_NAME', '👤 ', 'f_name'], ['CH_ADDRESS', '🏠 ', 'f_address'], ['CH_PHONE', '📞 ', 'f_phone'], ['CH_QTY', '🔢 ', 'f_qty']]
      .map(([id, e, k]) => ({ id, title: clip(e + title(T(k)), 24), description: '' })) });
  awaitingOut = null; orderingNow = true; log.push('[asked what to change]');
};
const cancelOrder = () => {
  const lo = ctx.last_order;
  if (draft && draft.status === 'draft' && (anyDetail(draft) || awaitingOut || chat.awaiting)) {
    draft.status = 'cancelled'; event = 'cancelled';
  } else if (lo && lo.status === 'confirmed' && !lo.exported_at && Date.now() - new Date(lo.confirmed_at || lo.updated_at).getTime() < 24 * 3600e3) {
    draft = { ...lo, status: 'cancelled' }; event = 'cancelled';
  } else if (lo && lo.status === 'confirmed') {
    needsCall = true; callReason = `Wants to cancel order #${lo.id} (already sent to the courier file)`;
    step({ kind: 'text', text: T('will_check', V()) }); log.push('[wants to cancel a sent order: the shop will call]');
    return;
  }
  step({ kind: 'text', text: T('cancelled', V()) }); awaitingOut = null; log.push('[order cancelled]');
};

// ---------- the AI's answer, checked before it is sent ----------
function guard(r) {
  const low = r.toLowerCase();
  const b = banned.find(x => low.includes(x));
  if (b) return `banned claim "${b}"`;
  const nums = s => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/,/g, '').replace(/\.0+$/, '').replace(/^0+(?=\d)/, ''));
  const p = prod || {};
  const factText = [p.price, p.delivery_fee, p.total, [1, 2, 3, 4, 5].map(n => Number(p.price) * n + Number(p.delivery_fee)).join(' '), p.how_to_use, p.precautions,
    p.ingredients, p.benefits, p.short_description, p.long_description, JSON.stringify(p.faqs || []), seller.delivery_days, seller.call_hours, seller.phone,
    seller.about, ...(ctx.matches || []).map(x => `${x.price} ${x.total}`), '1 2 3 24 7 100'].join(' ');
  const allowed = new Set(nums(factText));
  const strange = nums(r).filter(n => !allowed.has(n));
  if (strange.length) return `number not in the facts (${strange.slice(0, 3).join(', ')})`;
  if (Array.from(r).length > 600) return 'answer too long';
  if (/[\u0D80-\u0DFF][A-Za-z]|[A-Za-z][\u0D80-\u0DFF]/.test(r)) return 'Sinhala and English letters mixed in one word';
  const si = (r.match(/[඀-෿]/g) || []).length, lat = (r.match(/[A-Za-z]/g) || []).length;
  if (lang === 'si' && si < lat * 0.6) return 'not in Sinhala';
  if ((lang === 'sg' || lang === 'en') && si > 3) return 'Sinhala letters for a Singlish/English chat';
  return '';
}
// Lingo's reply, cleaned before it is checked and sent: no 🙏, no "dr" inside Sinhala script, never
// internal words ("facts", "the team will check", "I don't know"), never a sentence she already sent.
const JARGON = /\bfacts?\b|ෆැක්ට්|product info|information (i have|we have)|\bteam\b|ටීම්|i don'?t know|දන්නේ නෑ|දන්නෑ|හරියටම කියන්න බෑ|කියන්න බැහැ|kiyanna ba|danne na|sadahan na|සඳහන් නෑ|සඳහන් නැති|no information|not mentioned/i;
const sentNorm = (x) => String(x).toLowerCase().replace(/[^a-z0-9\u0D80-\u0DFF]+/g, ' ').trim();
const sentBefore = (ctx.history || []).filter(h => h.r === 'b').slice(-6).map(h => sentNorm(h.c));
function polish(r) {
  let t = String(r || '').replace(/🙏/g, '😊').replace(/(😊\s*){2,}/g, '😊 ');
  if (lang === 'si') t = t.replace(/(^|[\s,])dr(?=[\s,.!?😊]|$)/gi, '$1').replace(/[ \t]{2,}/g, ' ');
  const parts = t.split(/(?<=[.!?]|\p{Extended_Pictographic})\s+|\n+/u).map(x => x.trim()).filter(Boolean);
  const kept = parts.filter(x => !JARGON.test(x) && !(sentNorm(x).length > 12 && sentBefore.some(b => b.includes(sentNorm(x).slice(0, 40)))));
  if (kept.length < parts.length) log.push(`[cleaned the answer: ${parts.length - kept.length} line(s) dropped]`);
  return kept.join(' ').trim();
}
const aiReply = () => {
  const r = polish(String(c.reply || '').trim());
  if (!r) return '';
  const why = guard(r);
  if (why) { needsCall = true; callReason = `Lingo's answer was held back (${why}): "${cut(u.now, 80)}"`; log.push(`[AI answer blocked: ${why}]`); return T('will_check', V()); }
  return r;
};

// =====================================================================
// The flow
// =====================================================================
const tap = u.taps.find(t => !/^P_\d+$/.test(t)) || '';
const lastBot = [...(ctx.history || [])].reverse().find(h => h.r === 'b');
const lastNote = String((lastBot || {}).c || '');
const firstContact = u.first_contact;
const status0 = chat.status || 'new';
let saidSomething = u.taps.length > 0 || (u.typed && !(u.opener && firstContact));

if (intent === 'spam') {
  log.push('[spam link: no reply]');
} else if (!prod) {
  // Which product? (unknown ad, or a message that names none)
  const ms = (ctx.matches || []).filter(p => p.enabled !== false).slice(0, 10);
  if (u.form || u.lead || intent === 'details') {
    const d = { ...(u.lead || {}), ...(u.form || {}), ...(aiFrom ? c : {}) };
    detailsOut = { name: cleanName(d.name || saved.name || ''), address: cleanName(d.address || saved.address || ''), phone: localPhone(d.phone) || saved.phone || '', phone2: localPhone(d.phone2) || '' };
  }
  const r = aiFrom ? aiReply() : '';
  if (ms.length > 1) {
    step({ kind: 'list', text: [firstContact ? T('hello', V()) : '', r, T('pick_product', V())].filter(Boolean).join('\n\n'), button: T('btn_products'), section: 'Products',
      rows: ms.map(p => ({ id: 'P_' + p.id, title: clip(p.name, 24), description: clip(`Rs. ${money(p.price)} · ${p.short_description || ''}`, 72) })) });
    log.push('[asked which product (list)]');
  } else if (firstContact || !r) {
    step({ kind: 'text', text: [r, T('ask_product', V())].filter(Boolean).join('\n\n') }); log.push('[asked which product]');
  } else {
    answerAi(r, `[answered: ${cut(r, 120)}]`);
  }
  awaitingOut = 'product';
  if (intent === 'call_me') { needsCall = true; callReason = 'Asked for a call'; }
  if (intent === 'complaint') { needsCall = true; callReason = `Complaint: "${cut(u.now, 100)}"`; pause = true; }
} else {
  const needIntro = !seen.includes(pid) && !['CONFIRM', 'CANCEL', 'CHANGE', 'SAME', 'NEW'].includes(tap) && !/^(QTY|CH)_/.test(tap);
  if (needIntro) intro(prod);
  if (switched && draft && draft.status === 'draft') draft.product_id = pid;

  const qtyTap = /^QTY_(\d+)$/.exec(tap);
  const chTap = /^CH_(NAME|ADDRESS|PHONE|QTY)$/.exec(tap);
  const gaveSome = has(c.name) || has(c.address) || has(c.phone) || has(c.phone_bad);
  const det = (['details', 'field'].includes(intent) && gaveSome) || intent === 'qty' || (aiFrom && gaveSome);

  if (qtyTap || intent === 'qty' || (intent === 'field' && chat.awaiting === 'field_qty')) {
    ensureDraft(); draft.qty = qtyTap ? Number(qtyTap[1]) : Number(c.qty) || 1; orderingNow = true;
    if (anyDetail(draft)) nextStep(); else if (savedFull) sameDetails(); else askDetails();
  } else if (tap === 'ORDER' || intent === 'want_order' || rule('how_order')) {
    // "I want it" (even with a question): answer the question in a line, then straight to the order.
    if (aiFrom && intent === 'want_order') { const r = aiReply(); if (r) answerAi(r, `[answered: ${cut(r, 120)}]`); }
    if (aiFrom && det) { applyDetails(c); nextStep(); } else startOrder(Number(c.qty) || 0, tap === 'ORDER');
  } else if (tap === 'USE_WA' || (intent === 'yes' && chat.awaiting === 'phone')) {
    ensureDraft(); if (waPhone) draft.phone1 = waPhone; orderingNow = true; progress = true; nextStep();
  } else if (tap === 'OTHER_PHONE' || (intent === 'no' && chat.awaiting === 'phone')) {
    ensureDraft(); orderingNow = true;
    step({ kind: 'text', ask: ['phone'], text: T('ask_phone', V()) }); awaitingOut = 'field_phone'; log.push('[asked for the phone number]');
  } else if (intent === 'same_details') {
    if (has(saved.name) && has(saved.address)) { applyDetails({ name: saved.name, address: saved.address, phone: saved.phone, phone2: saved.phone2 }, { replace: true }); nextStep(); }
    else { ensureDraft(); askDetails(); }
  } else if (tap === 'SAME' || (intent === 'yes' && chat.awaiting === 'same')) {
    applyDetails({ name: saved.name, address: saved.address, phone: saved.phone, phone2: saved.phone2 }, { replace: true }); nextStep();
  } else if (tap === 'NEW' || (intent === 'no' && chat.awaiting === 'same')) {
    ensureDraft(); draft.name = ''; draft.address = ''; draft.phone1 = ''; draft.phone2 = ''; orderingNow = true; askDetails();
  } else if (tap === 'CONFIRM' || (intent === 'yes' && chat.awaiting === 'confirm') || (intent === 'confirm' && chat.awaiting === 'confirm')) {
    if (draft && draft.status === 'draft' && !missingOf(draft).length) confirmOrder();
    else if (!draft && ctx.last_order) { step({ kind: 'text', text: T('thanks', V()) }); log.push('[already confirmed]'); }
    else { ensureDraft(); nextStep(); }
  } else if (tap === 'CHANGE' || (intent === 'no' && chat.awaiting === 'confirm') || (intent === 'change' && !(has(c.name) || has(c.address) || has(c.phone) || Number(c.qty) > 0))) {
    if (draft && draft.status === 'draft') changePick(); else { ensureDraft(); nextStep(); }
  } else if (chTap) {
    ensureDraft(); orderingNow = true;
    if (chTap[1] === 'QTY') askQty();
    else { const f = chTap[1].toLowerCase(); step({ kind: 'text', text: T('change_ask', V({ field: T('f_' + f) })) }); awaitingOut = 'field_' + f; log.push(`[asked for the new ${f}]`); }
  } else if (tap === 'CANCEL' || intent === 'cancel') {
    cancelOrder();
  } else if (intent === 'field') {
    const f = String(chat.awaiting).slice(6);
    applyDetails({ [f]: c[f], phone2: c.phone2, phone_bad: c.phone_bad }, { replace: true });
    nextStep();
  } else if (det) {
    applyDetails(aiFrom ? c : c, { replace: intent === 'change' });

    const r = aiFrom ? aiReply() : '';
    if (r) answerAi(r, `[answered: ${cut(r, 120)}]`);
    if (firstContact && (u.lead || u.form)) blocks.push({ kind: 'note', text: T('got_details', V()) });
    nextStep();
  } else if (tap === 'USAGE' || rule('usage')) {
    answer(has(prod.how_to_use) ? T('how_to_use', V({ how_to_use: prod.how_to_use, precautions: has(prod.precautions) ? '\n\n⚠️ ' + prod.precautions : '' })) : T('will_check', V()), '[sent how to use]');
    if (!has(prod.how_to_use)) { needsCall = true; callReason = 'Asked how to use it (no instructions saved for this product)'; }
  } else if (tap === 'PRICE' || rule('price')) {
    if (!needIntro) answer(T('price', V()), '[sent price]');
  } else if (rule('delivery')) {
    answer(T('delivery', V()), '[sent delivery details]');
  } else if (rule('payment')) {
    answer(T('payment', V()), '[sent payment details]');
  } else if (rule('shop')) {
    answer(T('shop', V()), '[sent shop details]');
  } else if (tap === 'CALL' || rule('call') || intent === 'call_me') {
    needsCall = true; callReason = 'Asked for a call';
    step({ kind: 'text', text: T('call_ok', V()) }); log.push('[the shop will call]');
  } else if (intent === 'complaint') {
    needsCall = true; pause = true; callReason = `Complaint: "${cut(u.now, 100)}"`;
    step({ kind: 'text', text: T('complaint', V()) }); log.push('[complaint: the shop will call]');
  } else if (intent === 'not_interested' || (intent === 'no' && !chat.awaiting)) {
    const r = aiFrom ? aiReply() : '';
    const triedOnce = (ctx.history || []).some(h => /\[showed why it suits them\]/.test(String(h.c)));
    if (!triedOnce && prod && status0 !== 'ordered' && !ctx.last_order) {
      // They back off: once, a warm reason why it suits THEM (the AI, from the product's facts), no risk (pay at the door), and the Order button.
      step({ kind: 'buttons', text: r || T('win_back', V()), buttons: [B('ORDER', 'btn_order'), B('CALL', 'btn_call')] });
      log.push('[showed why it suits them]');
    } else {
      notInterested = true;
      step({ kind: 'text', text: (triedOnce ? '' : r) || T('not_interested', V()) }); log.push('[not interested]');
    }
  } else if (intent === 'opener' || (intent === 'greet' && firstContact)) {
    if (!firstContact && !needIntro) okReply();                 // the welcome is added below on the first message
  } else if (['thanks', 'ok', 'greet'].includes(intent) || (aiFrom && intent === 'chat' && !String(c.reply || '').trim())) {
    const ordered = status0 === 'ordered' || (ctx.last_order && !draft);
    const waiting = ['details', 'phone', 'qty'].includes(chat.awaiting) || String(chat.awaiting || '').startsWith('field_');
    if (waiting) awaitingOut = chat.awaiting;                     // still waiting for the same thing
    if (waiting && /\[said: send them later\]/.test(lastNote)) log.push('[ok: still waiting for their details]');
    else if (waiting && intent !== 'greet') { step({ kind: 'text', text: T('later', V()) }); log.push('[said: send them later]'); }
    else if (ordered) { if (intent === 'thanks') react('❤️'); answer(T('thanks', V()), '[said thanks]'); }
    else if (!needIntro) okReply();
  } else if (intent === 'ai_failed' || intent === 'ai_off') {
    needsCall = true; callReason = intent === 'ai_off' ? `AI allowance used up; asked: "${cut(u.now, 80)}"` : `Lingo couldn't answer (AI error): "${cut(u.now, 80)}"`;
    step({ kind: 'text', text: T('will_check', V()) }); log.push('[will check: the shop will call]');
  } else if (intent === 'unclear' || (aiFrom && intent !== 'other_product' && !String(c.reply || '').trim())) {
    unsure = true;
    if (Number(chat.unsure || 0) >= 1) {
      needsCall = true; callReason = `Lingo didn't understand twice: "${cut(u.now, 80)}"`;
      step({ kind: 'text', text: T('will_check', V()) }); log.push('[unclear twice: the shop will call]');
    } else {
      step({ kind: 'buttons', text: T('unclear', V()), buttons: [B('ORDER', 'btn_order'), B('USAGE', 'btn_usage'), B('CALL', 'btn_call')] }); log.push('[asked what they mean]');
    }
  } else if (intent === 'other_product' && !switched) {
    const ms = (ctx.matches || []).filter(p => p.enabled !== false && Number(p.id) !== pid).slice(0, 10);
    const r = aiReply();
    if (ms.length > 1) {
      step({ kind: 'list', text: [r, T('pick_product', V())].filter(Boolean).join('\n\n'), button: T('btn_products'), section: 'Products',
        rows: ms.map(p => ({ id: 'P_' + p.id, title: clip(p.name, 24), description: clip(`Rs. ${money(p.price)} · ${p.short_description || ''}`, 72) })) });
      log.push('[asked which product (list)]');
    } else if (r) answerAi(r, `[answered: ${cut(r, 120)}]`); else answer(T('will_check', V()), '[will check]');
  } else if (aiFrom) {
    const r = aiReply();
    if (r) answerAi(r, `[answered: ${cut(r, 120)}]`);
    else okReply();                                                  // nothing worth saying (all cleaned away): move to the order
    if (c.needs_human === true && !needsCall && (!r || /complain|angry|pregnan|breastfeed|ගැබ්|කිරි දෙන|doctor/i.test(String(c.memo || '') + ' ' + u.now))) {
      needsCall = true; callReason = `Lingo wasn't sure: "${cut(u.now, 80)}"`;
    }
  }

  // First message of the chat: the greeting with the total and the details form (+ any answer).
  if (firstContact && !stepAdded) {
    step({ kind: 'buttons', text: [T('hello', V()), ...answers.map(a => (typeof a === 'object' ? a.text : a)), answers.length ? '' : T('total_line', V()), T('details_form', V())].filter(Boolean).join('\n\n'),
      buttons: [B('ORDER', 'btn_order'), B('USAGE', 'btn_usage'), B('CALL', 'btn_call')] });
    answers.length = 0;
    awaitingOut = awaitingOut || 'details';
    log.push('[greeted them, asked for name, address, phone]');
  } else if (firstContact && stepAdded) {
    const i = blocks.findIndex(b => b.kind !== 'image' && b.kind !== 'note' && !b.pid);
    const note = blocks.find(b => b.kind === 'note');
    if (i >= 0) blocks[i].text = [T('hello', V()), note ? note.text : '', ...answers.map(a => (typeof a === 'object' ? a.text : a)), blocks[i].text].filter(Boolean).join('\n\n');
    answers.length = 0;
  } else if (needIntro && !stepAdded && !answers.length) {
    if (!ctx.last_order && has(saved.name) && has(saved.address)) {
      // details they gave before we knew the product
      applyDetails({ name: saved.name, address: saved.address, phone: saved.phone, phone2: saved.phone2 }, { replace: true });
      nextStep();
    } else if (ctx.last_order || switched) {
      step({ kind: 'buttons', text: T('next_product', V()), buttons: [B('ORDER', 'btn_order'), B('USAGE', 'btn_usage')] });
      log.push('[offered to order this product]');
    } else {
      step({ kind: 'buttons', text: [T('total_line', V()), T('details_form', V())].join('\n\n'), buttons: [B('ORDER', 'btn_order'), B('USAGE', 'btn_usage'), B('CALL', 'btn_call')] });
      awaitingOut = 'details'; log.push('[asked for name, address, phone]');
    }
  }
}
function okReply() {
  // "Ok / hari / ow" right after she offered the order means yes: take it (never silence, never the same offer again).
  // (an answer carries the 🛒 Order button, so "ok" after an answer is the same yes)
  if (/\[offered to order|\[answered:/.test(lastNote) && status0 !== 'ordered' && !['thanks', 'greet'].includes(intent)) { log.push('[ok to the order offer: started the order]'); startOrder(0, false); return; }
  step({ kind: 'buttons', text: T('ok_reply', V()), buttons: [B('ORDER', 'btn_order'), B('USAGE', 'btn_usage')] });
  log.push('[offered to order]');
}

// Never the same request twice in a row: if Lingo asked for the same details last time and nothing new came,
// she offers a call instead; the third time the chat goes to "Call them".
const askIdx = blocks.findIndex(b => b.ask);
if (askIdx >= 0 && !progress && !badPhone) {
  const note = log.find(l => /^\[asked (name, address|for: |: use their WhatsApp|for the phone)/.test(l)) || '';
  const again = /\[asked again/.test(lastNote);
  if (again || (note && lastNote.includes(note.slice(0, 18)))) {
    const ask = blocks[askIdx].ask;
    if (again) {
      needsCall = true; callReason = `Couldn't get the order details in the chat (${ask.join(', ')} missing)`;
      blocks[askIdx] = { kind: 'text', text: T('call_ok', V()) };
      log.push('[asked twice: the shop will call for the details]');
    } else {
      blocks[askIdx] = { kind: 'buttons', text: T('ask_again', V({ missing: wordList(ask) })), buttons: [B('CALL', 'btn_call')] };
      log.push('[asked again, offered a call]');
    }
  }
}

// Answers go before the order step; when no order is going on, the last answer carries a 🛒 Order button
// (not twice in a row).
const orderOpen = orderingNow || (draft && draft.status === 'draft' && anyDetail(draft));
const offeredLast = !!(lastBot && /\[offered to order|\[greeted them/.test(String(lastBot.c)));
if (answers.length) {
  const firstStep = blocks.findIndex(b => b.kind !== 'image' && !b.pid && b.kind !== 'note');
  const ans = answers.map(t => (typeof t === 'object' ? { kind: 'text', text: t.text, sep: true } : { kind: 'text', text: t }));
  if (!orderOpen && !stepAdded && event !== 'confirmed' && status0 !== 'ordered' && !notInterested && !offeredLast && intent !== 'spam') {
    const lastA = ans.pop();
    ans.push({ kind: 'buttons', text: lastA.text, buttons: [B('ORDER', 'btn_order')] });
    log.push('[offered to order]');
  }
  if (firstStep >= 0) blocks.splice(firstStep, 0, ...ans); else blocks.push(...ans);
}
const out = blocks.filter(b => b.kind !== 'note');
const lastIn = [...(ctx.msgs || [])].reverse().find(x => x.wa_id) || null;
if (reaction && lastIn && out.length) out.push({ kind: 'reaction', emoji: reaction, to: lastIn.wa_id });
// Every reply quotes what the customer wrote (not a button tap, not the ad's pre-filled first message).
const quote = lastIn && !lastIn.tap && !(firstContact && u.opener) && intent !== 'spam' ? lastIn.wa_id : null;
if (!out.length && !event && awaitingOut === null && chat.awaiting) awaitingOut = chat.awaiting;   // a plain "ok": still waiting for the same thing

// ---------- status ----------
let status = status0;
if (intent === 'spam') status = 'spam';
else if (event === 'confirmed') status = 'ordered';
else if (event === 'cancelled') status = ctx.last_order && ctx.last_order.status === 'confirmed' && Number(ctx.last_order.id) !== Number(draft && draft.id) ? 'ordered' : 'cancelled';   // still has an order
else if (notInterested) status = 'not_interested';
else if (orderingNow && (awaitingOut || (draft && draft.status === 'draft'))) status = 'ordering';
else if (status0 === 'ordered' || status0 === 'ordering') status = status0;
else if (saidSomething) status = 'asking';
if (status === 'ordering' && !saidSomething && !u.lead) status = status0 === 'new' ? 'new' : status;

function rule(name) { return u.rule === name; }

return [{ json: {
  blocks: out,
  quote,
  route,
  lang,
  ai: u.need_ai ? { from: aiFrom || null, error: aiError || null } : null,
  save: {
    user_id: m.user_id, phone: m.phone, test: !!m.test,
    msgs: (ctx.msgs || []).map(x => ({ wa_id: x.wa_id, t: x.t, kind: x.kind })),
    log: log.join('\n'),
    route,
    chat: {
      product_id: pid || null, seen_add: seenAdd, lang, status, awaiting: awaitingOut || '',
      needs_call: needsCall, call_reason: callReason, pause, said_something: saidSomething,
      memo: aiFrom ? String(c.memo || '').slice(0, 300) : '', unsure, details: detailsOut,
    },
    order: draft && (draft.id || orderingNow || event) && draft.product_id ? {
      id: draft.id || null, product_id: draft.product_id, qty: draft.qty || 1, name: draft.name || null, address: draft.address || null,
      phone1: draft.phone1 || null, phone2: draft.phone2 || null, status: draft.status,
    } : null,
  },
} }];

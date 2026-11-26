// What does the customer want? Most messages are understood here in code, with no AI:
//   • button / list taps, the ad's pre-filled "Hello! Can I get more info on this?"
//   • Meta lead-form messages and our details form filled in (name / address / phone)
//   • a reply to what Lingo asked (a quantity, "ow" to the summary, the new address…)
//   • short common questions, typos and all (kiyada? delivery? dawas kiyak yanawada?)
//   • spam links
// Anything else → ONE AI call ("brain") that both reads the message and writes Lingo's reply, with
// only this chat's product (never the catalogue). OpenAI first; Gemini if OpenAI fails.
// @include lib.js
// @include persona.js
const m = $('Message').first().json;
const ctx = $('Claim Batch').first().json;
const chat = ctx.chat || {};
const seller = ctx.seller || m.seller || {};
const ai = seller.ai || {};
const prod = ctx.product || null;
const matches = ctx.matches || [];
const order = ctx.order || null;
const awaiting = chat.awaiting || '';
const budget = ctx.budget || {};

const msgs = ctx.msgs || [];
const taps = msgs.filter(x => x.tap).map(x => x.tap);
const typedList = msgs.filter(x => !x.tap).map(x => String(x.t || ''));
const now = cut(typedList.join('\n'), 1500);
const typed = /\S/.test(now);

// ---------- Meta lead-form message: "Hello! I filled out your form… Full name: … Street address: … Phone number: …" ----------
const LEAD_RE = /(filled\s+(in|out)\s+(your|you|you're)?\s*form|පෝරමය\s+පුරවා)/i;
const LEAD_LABELS = '(?:Full name|Street address|Work phone number|Phone number|City|Address|Name)\\s*:';
const leadField = (label, text) => {
  const r = new RegExp(label + '\\s*:\\s*([\\s\\S]*?)(?=' + LEAD_LABELS + '|\\n|$)', 'i').exec(text);
  return r ? r[1].replace(/\s+/g, ' ').trim() : '';
};
let lead = null, rest = now;
const leadMsg = typedList.find(t => LEAD_RE.test(t));
if (leadMsg) {
  const body = leadMsg.replace(/Work phone number\s*:\s*[+\d\s-]+/i, ' ');
  lead = {
    name: leadField('Full name', leadMsg).slice(0, 80),
    address: [leadField('Street address', leadMsg), leadField('City', leadMsg)].filter(Boolean).join(', ').slice(0, 300),
    phone: localPhone((/Phone number\s*:\s*(\+?[\d][\d\s-]{7,16}\d)/i.exec(body) || [])[1]) || localPhone((/Work phone number\s*:\s*(\+?[\d][\d\s-]{7,16}\d)/i.exec(leadMsg) || [])[1]),
  };
  if (lead.address && /^[\d\s/.,-]{1,8}$/.test(lead.address)) lead.address = '';     // "31", "502/271": not an address alone
  for (const k of Object.keys(lead)) if (!lead[k]) delete lead[k];
  rest = cut(typedList.filter(t => t !== leadMsg).join('\n'), 1500);
}

// ---------- our details form filled in ("👤 නම : …  🏠 ලිපිනය : …  📞 දුරකථන අංකය : …") or loose lines ----------
const PHONE_RE = /(?:\+?94|0)\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}|\b7\d{8}\b/g;
const LABELS = [
  ['name', /^(?:👤\s*)?(?:සම්පූර්ණ නම|නම|nama|name|full name)\s*[:：=-]\s*(.*)$/i],
  ['address', /^(?:🏠\s*|📍\s*)?(?:ලිපිනය|ලිපිනේ|lipinaya|address(?:\s+eka)?|street address)\s*[:：=-]\s*(.*)$/i],
  ['phone', /^(?:📞\s*|☎️?\s*|📱\s*)?(?:දුරකථන අංකය|දුරකථන අංක|දු\.?\s*අ\.?|අංකය|phone(?:\s+number)?(?:\s+eka)?|mobile(?:\s+number)?|tel|tp|contact(?:\s+number)?|number|whatsapp(?:\s+number)?)\s*[:：=-]\s*(.*)$/i],
];
const phonesIn = s => [...String(s || '').matchAll(PHONE_RE)].map(x => localPhone(x[0])).filter(Boolean);
/** Digits that look like an attempt at a phone number but aren't a full Sri Lankan number. */
const badDigits = s => { const d = String(s || '').replace(/[^\d+]/g, ''); return d.replace(/\D/g, '').length >= 5 && !localPhone(d) ? clip(d, 20) : ''; };
function parseForm(text) {
  const out = {}; let found = 0, cur = '';
  const lines = String(text || '')
    .replace(/[ \t]*(👤|🏠|📍|📞|📱)/gu, '\n$1')                                   // labels written on one line
    .replace(/[ \t,]+(?=(?:නම|ලිපිනය|දුරකථන අංකය|nama|address(?:\s+eka)?|phone(?:\s+number)?(?:\s+eka)?|mobile|tel)\s*[:：])/giu, '\n')
    .replace(/(^|\n)(👤|🏠|📍|📞|📱)[ \t]*\n/gu, '$1$2 ');
  for (const raw of lines.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let hit = false;
    for (const [k, re] of LABELS) {
      const r = re.exec(line);
      if (!r) continue;
      hit = true; found++; cur = k;
      const v = r[1].trim();
      if (k === 'phone') {
        const ps = phonesIn(v);
        if (ps[0]) out.phone = out.phone || ps[0];
        if (ps[1]) out.phone2 = ps[1];
        if (!ps[0] && badDigits(v)) out.phone_bad = badDigits(v);                       // "077 12345": not a full number
      }
      else if (v) out[k] = v;
      break;
    }
    if (!hit && cur === 'address') out.address = (out.address ? out.address.replace(/,?\s*$/, ', ') : '') + line;   // address on several lines
    else if (!hit && cur === 'phone') { const ps = phonesIn(line); if (ps[0]) { if (!out.phone) out.phone = ps[0]; else out.phone2 = out.phone2 || ps[0]; } }
  }
  return found ? out : null;
}
function parseLoose(text) {
  if (/[?？]/.test(text)) return null;
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const ps = phonesIn(text);
  if (!ps.length || lines.length < 2 || lines.length > 6) return null;
  const left = lines.map(l => l.replace(PHONE_RE, '').replace(/^[\s,/.-]+|[\s,/.-]+$/g, '').trim()).filter(Boolean);
  const out = { phone: ps[0], phone2: ps[1] || '' };
  const i = left.findIndex(l => !/\d/.test(l) && l.split(/\s+/).length <= 4 && Array.from(l).length <= 40);
  if (i >= 0) out.name = left.splice(i, 1)[0];
  if (left.length) out.address = left.join(', ');
  if (out.address && !(/\d|,/.test(out.address) || out.address.split(/\s+/).length >= 2)) return null;
  return out;
}
const formSrc = lead ? rest : now;
const form = typed && !taps.length ? (parseForm(formSrc) || parseLoose(formSrc)) : null;

// ---------- spam: a strange link from someone who never ordered or talked ----------
const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(buzz|xyz|top|click|live|online|site|info|icu|cc|ru|cn|vip|shop)\b/i;
const OK_LINK = /(facebook\.com|fb\.me|fb\.com|fb\.watch|instagram\.com|wa\.me|whatsapp\.com|tiktok\.com|youtube\.com|youtu\.be|google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
const spam = typed && URL_RE.test(now) && !OK_LINK.test(now) && !order && !ctx.last_order && !chat.said_something;

// ---------- quick rules on the whole message (no AI) ----------
const QTY_WORDS = { ekak: 1, akak: 1, ekkak: 1, 'එකක්': 1, dekak: 2, dekk: 2, 'දෙකක්': 2, thunak: 3, tunak: 3, 'තුනක්': 3, hatharak: 4, 'හතරක්': 4, pahak: 5, 'පහක්': 5 };
const qtyOf = s => {
  const n = normalize(s);
  const d = /^(\d{1,2})\s*(k|ක්|ක|ekak|bottles?|packs?|pieces?|pcs|boxes?|ona|oni|onee|ඕන|da)?$/.exec(n) || /^(?:mata\s+)?(\d{1,2})\s*(?:k|ක්)?\s*(?:ona|oni|ewanna|evanna|ඕන|එවන්න)$/.exec(n);
  if (d && Number(d[1]) >= 1 && Number(d[1]) <= 20) return Number(d[1]);
  for (const w of n.split(' ')) if (QTY_WORDS[w]) return QTY_WORDS[w];
  return 0;
};
const RULES = [
  ['yes', /^(ow+|owu|ou|ov|yes+|yep|ya|ok+|okay|hari+|ela+|confirm(ed)?|correct|ow hari|hari hari|ow confirm|ok confirm|ow ow|ඔව්|ඔව්වා|හරි|ඔව් හරි|හරි හරි|ඔව් ඔව්)( dr| sir| miss| please)?$/],
  ['no', /^(no+|nope|epa|epaa|එපා|ona na|one na|oni na|onna|ඕන නෑ|එපා එපා|na|naa|නෑ|epa dr|na dr)$/],
  ['thanks', /^(thanks?|thank you|thank u|tnx|thx|ty|ස්තූතියි|ස්තුතියි|thanks dr|ok thanks?|ok thank you|hari thanks|thank you dr|bohoma sthuthi|bohoma sthuthiy|බොහොම ස්තූතියි|ok ස්තූතියි|හරි ස්තූතියි)$/],
  ['ok', /^(ok+|okay|hari+|ela+|හරි|ok dr|hari dr|ela dr|hmm+|mm+|ow|owu|ඔව්|ok ok)$/],
  ['price', /^(ඩිලිවරි ගාස්තුව එක්ක )?(මුළු |මුලු )?(ගාන|ගාණ|මිල) ?(කියද|කීයද|කීයද්ද)$|^(kiyada|kiyd|kiyda|keyada|kiyadha|kiyad|kiyada dr|kiyada mila|mila kiyada|mila|price|price eka|price eka kiyada|price kiyada|price eka one|price please|price plz|how much|how much is it|me priceda|me price eka|gana kiyada|ganan kiyada|ganan kohomada|gana|ganan|ganana|මිල|කීයද|කියද|මිල කීයද|ගාන කීයද|මිල ගනන් කොහොමද|මිල ගණන් කොහොමද|total eka kiyada|delivery ekka kiyada|delivery ekkama kiyada)$/],
  ['delivery', /^(delivery|dilivery|dilewary|delivary|delivery kiyada|delivery charge|delivery charges|delivery gana|delivery gasthu kiyada|dilivery gasthu kiyada|deliver karanawada|delivery thiyenawada|delivery karanawada|ඩිලිවරි|ඩිලිවරි ගාස්තුව කීයද|ඩිලිවරි කරනවද|dawas kiyak yanawada|dawas kiyak yaida|dws kiyak ynwda|kawada enne|kawadda enne|kawada ganna puluwan|kawada wage ganna puluwan|kochchara welawak yanawada|kochchara kalayak yanawada|දවස් කීයක් යනවද|කවදද එන්නේ|කොච්චර කල් යනවද|kochchara kal yanawada)$/],
  ['payment', /^(cash on delivery( da| thiyenawada)?|cod( da| thiyenawada)?|salli kohomada gewanne|gewanne kohomada|payment kohomada|ගෙවන්නේ කොහොමද|සල්ලි ගෙවන්නේ කොහොමද|card payment thiyenawada|online payment)$/],
  ['shop', /^(koheda thiyenne|shop eka koheda|kade koheda|oyala koheda|location eka|oyalage address eka|ඔයාලා කොහෙද|කඩේ කොහෙද|ෂොප් එක කොහෙද|nishpadithaya koheda|koheda hadanne|kadawala thiyenawada|food city wala thiyenawada)$/],
  ['usage', /^(use karanne kohomada|use karana widiha|use karana hati|bonne kohomada|ganna widiha|ganne kohomada|pawichchi karanne kohomada|පාවිච්චි කරන්නේ කොහොමද|බොන්නේ කොහොමද|භාවිතා කරන්නේ කොහොමද|how to use|how to use it|ganna ona widiha)$/],
  ['how_order', /^(ඔඩර් එකක් දාන්නේ කොහොමද|ඕඩර් එකක් දාන්නේ කොහොමද|order ekak danne kohomada|oder ekak danne kohomada|order karanne kohomada|order karanna ona|order ekak danna|order ekak danna ona|how (do i|to|can i) order|i want to order|order|oder|order karanna|order karannam|ඕඩර් කරන්න|ඔඩර් කරන්න|ඕඩර් එකක් දාන්න)( dr| please| plz)?$/],
  ['want', /^(mata(th)? )?(ekak|akak|dekak|thunak|ekak ona|ekak oni|akak ona|ekak one|dekak ona|ekak awanna|akak awanna|ekak ewanna|ekak evanna|dekak evanna|dekak ewanna|ekak ganna|dekak ganna|ona|oni|mata ona|mata oni|ganna ona|ganna kamathi|මට එකක් ඕන|මට ඕන|මටත් එකක් ඕන|මට දෙකක් ඕන|එකක් එවන්න|දෙකක් එවන්න|එකක් ඕන)( puluwada| puluwanda| dr| please| plz)?$/],
  ['call', /^(call (me|karanna|karanna puluwanda|ekak denna|ekak dennako|ekak ganna)|mata call (ekak|karanna)( denna| puluwanda)?|කෝල් එකක් දෙන්න|call එකක් දෙන්න|මට call කරන්න|මට කෝල් කරන්න|කතා කරන්න ඕන)( please| plz| dr)?$/],
  ['greet', /^(hi+|hello+|hey+|helo+|hai+|ayubowan|ආයුබෝවන්|හායි|හලෝ|good (morning|evening|night|afternoon)|gm|ge)( dr| sir| miss)?$/],
];

const bareText = lead ? rest : now;
const norm = normalize(bareText);
const probe = norm || (typed ? 'ok' : '');                 // only emojis (👍 🙏) = "ok"
const compact = probe.replace(/[\s-]/g, '');
const firstContact = !(chat.products_seen || []).length && !(ctx.history || []).some(h => h.r === 'b');
const opener = typed && (PREFILL.test(bareText) || OPENER.test(norm)) && Array.from(norm).length <= 90;

let c = null, source = 'none', rule = '';
const C = (intent, extra = {}) => ({ intent, product_id: 0, name: '', address: '', phone: '', phone2: '', qty: 0, reply: '', needs_human: false, lang: '', memo: '', ...extra });
if (spam) { c = C('spam'); source = 'rule'; rule = 'spam'; }
else if (!typed && taps.length) { c = C('tap'); source = 'tap'; }
else if (typed && awaiting.startsWith('field_') && !/[?？]/.test(bareText) && Array.from(norm).length <= 300 && !RULES.slice(4).some(([, re]) => re.test(probe))) {
  const f = awaiting.slice(6);
  const v = f === 'qty' ? qtyOf(bareText) : f === 'phone' ? (phonesIn(bareText)[0] || '') : bareText.replace(/\s+/g, ' ').trim();
  if (v) { c = C('field', { [f === 'qty' ? 'qty' : f]: v, phone2: f === 'phone' ? (phonesIn(bareText)[1] || '') : '' }); source = 'rule'; rule = 'field'; }
  else if (f === 'phone' && badDigits(bareText)) { c = C('field', { phone_bad: badDigits(bareText) }); source = 'rule'; rule = 'field'; }
} else if (typed && awaiting === 'qty' && qtyOf(bareText)) { c = C('qty', { qty: qtyOf(bareText) }); source = 'rule'; rule = 'qty'; }
if (!c && lead && !/\S/.test(rest)) { c = C('details', { ...lead }); source = 'lead'; }
if (!c && form && (form.name || form.address || form.phone || form.phone_bad)) {
  c = C('details', { ...(lead || {}), ...Object.fromEntries(Object.entries(form).filter(([, v]) => v)) });
  source = lead ? 'lead' : 'form';
}
// only a phone number (or a number that is too short / too long: Lingo says so)
if (!c && typed && /^\+?\d{7,13}$/.test(compact)) {
  c = localPhone(compact) ? C('details', { phone: localPhone(compact) }) : C('details', { phone_bad: compact });
  source = 'rule'; rule = 'phone';
}
// "use the details I gave before" (kalin dunna details walata · ekatama · ඒකටම)
const saved = chat.details || {};
const SAME_RE = /(kalin|kalim|issella|isella|parana|purana|pereda|kalinma)\s*(dunna|dila|dhunna|dapu|dunnu)?\s*(details?|address|lipinaya|wisthara|eka|ekata|ekatama|walatama|walata|wlt|wlta)|(^|\s)(ekatama|ektama|ekatma|ekama address|same (address|details|eka))(\s|$)|කලින් දුන්න|කලින් (විස්තර|ලිපිනය)|ඒකටම|පරණ ලිපිනය|ඒ ලිපිනයටම/i;
if (!c && typed && has(saved.name) && has(saved.address) && ['details', 'same', ''].includes(awaiting) && Array.from(norm).length <= 60 && SAME_RE.test(norm)) {
  c = C('same_details'); source = 'rule'; rule = 'same_details';
}
if (!c && typed && opener && (firstContact || chat.status === 'new')) { c = C('opener'); source = 'rule'; rule = 'opener'; }
if (!c && typed) {
  for (const [name, re] of RULES) {
    if (!re.test(probe)) continue;
    if ((name === 'yes' || name === 'no') && !['confirm', 'same', 'phone'].includes(awaiting)) continue;   // "ow" means something only after a question
    rule = name; source = 'rule';
    c = name === 'want' ? C('want_order', { qty: qtyOf(probe) }) : C(name);
    if (lead) Object.assign(c, lead, { intent: 'details' });
    break;
  }
}

// ---------- the brain (one AI call) for everything else ----------
const mode = budget.mode || 'full';
const needAi = !c && typed;
let brain = null;
if (needAi && mode === 'off') c = C('ai_off');
else if (needAi) {
  const model = mode === 'cheap' ? (ai.cheap || 'gpt-5.4-nano') : (ai.brain || 'gpt-5.4-mini');
  const primary = /^gemini/i.test(model) ? 'gemini' : 'openai';
  const fill = s => String(s || '').replace(/\{price\}/g, money((prod || {}).price)).replace(/\{delivery_fee\}/g, money((prod || {}).delivery_fee)).replace(/\{total\}/g, money((prod || {}).total));
  const facts = p => [
    `PRODUCT (id ${p.id}): ${p.name}`,
    `Price Rs. ${money(p.price)} | Delivery Rs. ${money(p.delivery_fee)} to anywhere in Sri Lanka (charged once per order) | Total Rs. ${money(p.total)} | Cash on delivery`,
    `Totals: ${[1, 2, 3, 4, 5].map(n => `${n} = Rs. ${money(Number(p.price) * n + Number(p.delivery_fee))}`).join(', ')}`,
    p.short_description ? `About: ${p.short_description}` : '',
    p.benefits ? `Helps with: ${p.benefits}` : '',
    p.how_to_use ? `How to use: ${p.how_to_use}` : '',
    p.precautions ? `Precautions: ${p.precautions}` : '',
    p.ingredients ? `Ingredients: ${p.ingredients}` : '',
    p.long_description ? `Description (already sent with the photo): ${fill(p.long_description).replace(/[*_]/g, '').replace(/\n+/g, ' / ')}` : '',
    ...(Array.isArray(p.faqs) ? p.faqs.slice(0, 15).map(f => (f && f.q && f.a ? `FAQ: ${f.q} → ${f.a}` : '')) : []),
  ].filter(Boolean).join('\n');
  const catalog = Array.isArray(ctx.catalog) ? ctx.catalog : [];
  const productBlock = prod ? facts(prod)
    : 'PRODUCT: not known yet (they have not said which product they want).' + (catalog.length
      ? '\nOUR PRODUCTS (id: name · what it is for). If they describe a need or a product (also in a voice note), put the best matching id in product_id; if several could fit or none, product_id 0.\n'
        + catalog.map(p => `${p.id}: ${p.name}${p.k ? ' · ' + p.k : ''}`).join('\n')
      : '');
  const others = matches.filter(p => !prod || p.id !== prod.id).slice(0, 4);
  const o = order;
  const lo = ctx.last_order;
  const orderLine = o
    ? (awaiting === 'confirm'
        ? `waiting for their confirmation: ${o.qty} × ${o.product_name}, ${o.name}, ${o.address}, ${o.phone1}`
        : `being filled in: ${o.qty} × ${o.product_name}; have ${['name', 'address', 'phone1'].filter(k => has(o[k])).map(k => k.replace('1', '')).join(', ') || 'nothing yet'}`)
    : 'none in progress';
  const asked = { details: 'their name, address and phone number', qty: 'how many they want', confirm: 'to confirm the order summary', same: 'if we should use their last order details', phone: 'if we may use their WhatsApp number for the order',
    field_name: 'their new name', field_address: 'their new address', field_phone: 'their new phone number', field_qty: 'the new quantity', product: 'which product they want' }[awaiting] || 'nothing';
  const langName = { si: 'Sinhala script', sg: 'Singlish', en: 'English' }[chat.lang] || 'Sinhala script';
  const label = r => (r === 'c' ? 'Customer: ' : r === 's' ? 'Shop staff: ' : 'Lingo: ');
  const dyn = [
    `SHOP: ${seller.business || 'our shop'}${seller.location ? ', ' + seller.location : ''}. Online shop, island-wide courier delivery in ${seller.delivery_days || '2-3'} days, cash on delivery. Team calls: ${seller.call_hours || 'daytime'}.${seller.phone ? ' Shop phone: ' + seller.phone + '.' : ''}${seller.about ? ' ' + seller.about : ''}`,
    `OTHER PRODUCTS: ${others.length ? others.map(p => `${p.id}: ${p.name} (Rs. ${money(p.price)})`).join(' | ') : 'none mentioned'}`,
    `ORDER: ${orderLine}${lo ? ` | ordered before: ${lo.qty} × ${lo.product_name}` : ''}`,
    `WE ASKED: ${asked}`,
    `CUSTOMER: WhatsApp name "${cut(chat.profile_name || '', 40)}"; writes ${langName}`,
    `MEMO: ${chat.memo || '-'}`,
    'CHAT (oldest first):',
    ...((ctx.history || []).map(h => label(h.r) + cut(h.c, 220))),
    lead ? 'NOTE: their lead form already gave name, address and phone.' : '',
    `NEW MESSAGE: ${cut(bareText || now, 1200)}`,
  ].filter(Boolean).join('\n');
  const props = {
    intent: { type: 'string', enum: ['question', 'details', 'same_details', 'want_order', 'confirm', 'change', 'cancel', 'other_product', 'call_me', 'complaint', 'not_interested', 'chat', 'unclear'] },
    product_id: { type: 'integer' }, name: { type: 'string' }, address: { type: 'string' }, phone: { type: 'string' }, phone2: { type: 'string' },
    qty: { type: 'integer' }, reply: { type: 'string' }, needs_human: { type: 'boolean' }, lang: { type: 'string', enum: ['si', 'sg', 'en'] }, memo: { type: 'string' },
  };
  const required = Object.keys(props);
  const style = has(ctx.style) && typeof ctx.style === 'string' ? `\n\nSHOP STYLE NOTES: ${cut(ctx.style, 600)}` : '';
  const openai_req = {
    model: primary === 'openai' ? model : (ai.cheap || 'gpt-5.4-nano'),
    messages: [{ role: 'system', content: PERSONA + style }, { role: 'system', content: productBlock }, { role: 'user', content: dyn }],
    response_format: { type: 'json_schema', json_schema: { name: 'lingo_turn', strict: true, schema: { type: 'object', additionalProperties: false, properties: props, required } } },
    max_completion_tokens: 900,
    prompt_cache_key: 'lingo-feeder-p' + (prod ? prod.id : 0),
  };
  if (/^gpt-5/.test(openai_req.model) && has(ai.openai_reasoning)) openai_req.reasoning_effort = String(ai.openai_reasoning);
  if (ai.openai_cache_24h === true) openai_req.prompt_cache_retention = '24h';
  const gemini_model = primary === 'gemini' ? model : (ai.fallback || 'gemini-3.5-flash-lite');
  const gemini_req = {
    systemInstruction: { parts: [{ text: PERSONA + style + '\n\n' + productBlock }] },
    contents: [{ role: 'user', parts: [{ text: dyn }] }],
    generationConfig: { maxOutputTokens: 1200, responseMimeType: 'application/json', responseJsonSchema: { type: 'object', properties: props, required },
                        thinkingConfig: { thinkingLevel: ai.gemini_thinking || 'minimal' } },
  };
  brain = { primary, openai_model: openai_req.model, gemini_model, openai_req, gemini_req, started: Date.now(), chars: PERSONA.length + productBlock.length + dyn.length };
}

const langText = (lead ? rest : now).replace(PREFILL, ' ');
return [{ json: {
  now, typed, taps, lead, form, spam, opener, rule, source, first_contact: firstContact,
  c, need_ai: !!brain, brain, mode,
  lang_guess: typed && !opener ? guessLang(langText, chat.lang || 'si') : (chat.lang || 'si'),
} }];

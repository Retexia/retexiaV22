// Lingo Feeder: checks Meta's signature, then splits the webhook: delivery statuses, the seller's own replies from
// the WhatsApp Business app (echoes) and the customer's message(s). The HMAC-SHA256 of the raw body
// with this number's app secret (Retexia's in embedded mode) is made by the "Sign Body" Crypto node,
// so no NODE_FUNCTION_ALLOW_BUILTIN setting is needed on the n8n server.
const w = $('Read Webhook').first().json;
const num = $('Number').first().json;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const keep = (s, n) => { s = String(s || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

const sign = $('Sign Body').isExecuted ? ($('Sign Body').first().json || {}) : {};
const expect = sign.hmac ? 'sha256=' + String(sign.hmac).toLowerCase() : '';
const got = String(w.signature || '').toLowerCase();
let diff = expect.length === got.length && expect.length > 7 ? 0 : 1;
for (let i = 0; i < Math.min(expect.length, got.length); i++) diff |= expect.charCodeAt(i) ^ got.charCodeAt(i);
if (diff !== 0) return [];                            // not from Meta (or the app secret is wrong): ignore

const statuses = [], echoes = [];
let msgs = [], contacts = [];
for (const e of w.body.entry || []) for (const ch of e.changes || []) {
  const v = ch.value || {};
  if (String((v.metadata || {}).phone_number_id || '') !== String(num.phone_number_id)) continue;
  if (ch.field === 'messages') {
    for (const s of v.statuses || []) {
      const err = (s.errors || [])[0] || {};
      statuses.push({
        id: s.id, status: s.status, recipient: s.recipient_id,
        billable: s.pricing ? !!s.pricing.billable : null, category: s.pricing ? (s.pricing.category || '') : '',
        error: s.status === 'failed' ? cut(`${err.code || ''} ${err.title || ''} ${(err.error_data || {}).details || err.message || ''}`, 300) : null,
      });
    }
    contacts = contacts.concat(v.contacts || []);
    msgs = msgs.concat(v.messages || []);
  } else if (ch.field === 'smb_message_echoes') {
    for (const x of v.message_echoes || []) {
      const text = x.type === 'text' ? (x.text || {}).body : `[${x.type || 'message'}] ${((x[x.type] || {}).caption) || ''}`;
      echoes.push({ to: String(x.to || ''), id: x.id, text: cut(text, 4000) });
    }
  }
}

let message = null;
if (msgs.length) {
  const from = msgs[0].from;
  const mine = msgs.filter(x => x.from === from);
  const texts = [];
  let media = null, tap = null, quotedId = '', referral = null;
  for (const x of mine) {
    if (x.context && x.context.id && !quotedId) quotedId = x.context.id;
    if (x.referral && !referral) referral = x.referral;
    switch (x.type) {
      case 'text': texts.push(x.text.body); break;
      case 'image': if (!media) media = { kind: 'image', id: x.image.id, mime: x.image.mime_type }; if (x.image.caption) texts.push(x.image.caption); break;
      case 'audio': if (!media) media = { kind: 'audio', id: x.audio.id, mime: x.audio.mime_type }; break;
      case 'video': texts.push('[video] ' + ((x.video || {}).caption || '')); break;
      case 'document': texts.push(`[document ${(x.document || {}).filename || ''}] ${(x.document || {}).caption || ''}`); break;
      case 'location': { const l = x.location || {}; texts.push(`[location ${l.latitude},${l.longitude} ${l.name || ''} ${l.address || ''}]`); break; }
      case 'contacts': { const c = (x.contacts || [])[0] || {}; texts.push(`[contact ${(c.name || {}).formatted_name || ''} ${((c.phones || [])[0] || {}).phone || ''}]`); break; }
      case 'interactive': {
        const it = x.interactive || {};
        const r = it.button_reply || it.list_reply;
        if (r) { tap = tap || { id: r.id, title: r.title }; texts.push(`[tapped: ${r.title}]`); }
        if (it.type === 'nfm_reply' && it.nfm_reply) {
          // The order form (WhatsApp Flow) was sent: its answers come as JSON.
          let f = {};
          try { f = JSON.parse(it.nfm_reply.response_json || '{}'); } catch (e) { f = {}; }
          const form = { name: cut(f.name, 80), address: cut(f.address, 300), phone: cut(f.phone, 20), phone2: cut(f.phone2, 20), qty: Number(f.qty) || 1, pid: Number(f.pid) || 0 };
          tap = { id: 'FORM' + JSON.stringify(form), title: '📝 Order form' };
          texts.push(`📝 Order form: ${[form.name, form.address, form.phone, form.phone2, 'qty ' + form.qty].filter(Boolean).join(' · ')}`);
        }
        break;
      }
      case 'button': tap = tap || { id: x.button.payload, title: x.button.text }; texts.push(`[tapped: ${x.button.text}]`); break;
      default: break;                                  // reaction, sticker, unsupported, system…
    }
  }
  const text = keep(texts.join('\n'), 1500);                // line breaks matter (addresses, our details form)
  if (text || media) {
    const last = mine[mine.length - 1];
    const contact = contacts.find(c => c.wa_id === from) || contacts[0] || {};
    message = {
      phone: String(from), waId: last.id, name: cut((contact.profile || {}).name, 80),
      text, media, tap, quotedId,
      referral: referral ? {
        source_id: referral.source_id || '', source_url: referral.source_url || '', source_type: referral.source_type || '',
        headline: cut(referral.headline, 200), body: cut(referral.body, 400),
      } : null,
      ts: Number(last.timestamp) || Math.floor(Date.now() / 1000),
    };
  }
}
return [{ json: { statuses, echoes, message } }];

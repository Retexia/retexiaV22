// feeder.retexia.com → n8n (X-Retexia-Key checked by the webhook's Header Auth credential).
//   test_bot: one message through the real pipeline in test mode (nothing sent to WhatsApp)
//   check:    is this seller's number + token working? (Test connection)
//   send:     the seller's reply from the Inbox (free text, inside WhatsApp's 24 h window)
const b = $('Panel: Lingo').first().json.body || {};
const seller = Number(b.lingo_user_id);
if (!Number.isSafeInteger(seller) || seller <= 0) throw new Error('lingo_user_id is required');
const action = String(b.action || '');
const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) : s; };

if (action === 'test_bot') {
  const session = String(b.session || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'panel';
  const tap = b.tap && b.tap.id ? { id: cut(b.tap.id, 60), title: cut(b.tap.title, 60) } : null;
  const text = cut(b.text, 1500);
  if (!text && !tap) throw new Error('text or tap is required');
  return [{ json: { action, lingo_user_id: seller, message: {
    phone: 'test-' + session, waId: 'test.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8), name: 'Test customer',
    text: tap ? `[tapped: ${tap.title}]` : text, media: null, tap, quotedId: cut(b.quoted_id, 120), referral: null,
    ts: Math.floor(Date.now() / 1000), start_product: Number(b.start_product) || null,
  } } }];
}
if (action === 'check') return [{ json: { action, lingo_user_id: seller } }];
if (action === 'send') {
  const to = String(b.to || '').replace(/\D/g, '');
  const text = cut(b.text, 4000);
  if (!/^\d{6,20}$/.test(to) || !text) throw new Error('to and text are required');
  return [{ json: { action, lingo_user_id: seller, to, text } }];
}
throw new Error('unknown action');

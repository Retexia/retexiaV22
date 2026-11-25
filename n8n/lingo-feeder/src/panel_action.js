// feeder.retexia.com → n8n (X-Retexia-Key checked by the webhook's Header Auth credential).
//   test_bot: one message through the real pipeline in test mode (nothing sent to WhatsApp)
//   check:    is this seller's number + token working? (Test connection)
//   send:     the seller's reply from the panel (free text, inside WhatsApp's 24 h window)
const b = $('Panel: Lingo Feeder').first().json.body || {};
const user = String(b.user_id || '');
if (!/^[0-9a-f-]{36}$/i.test(user)) throw new Error('user_id is required');
const action = String(b.action || '');
const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n) : s; };

if (action === 'test_bot') {
  const session = String(b.session || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'panel';
  const tap = b.tap && b.tap.id ? { id: cut(b.tap.id, String(b.tap.id).startsWith('FORM') ? 1200 : 60), title: cut(b.tap.title, 60) } : null;
  const text = cut(b.text, 1500);
  if (!text && !tap) throw new Error('text or tap is required');
  return [{ json: { action, user_id: user, message: {
    phone: 'test-' + session, waId: 'test.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8), name: cut(b.name, 40) || 'Test customer',
    text: tap ? (tap.id.startsWith('FORM') ? `📝 Order form: ${Object.values((() => { try { return JSON.parse(tap.id.slice(4)); } catch (e) { return {}; } })()).filter(Boolean).join(' · ')}` : `[tapped: ${tap.title}]`) : text, media: null, tap, quotedId: cut(b.quoted_id, 120),
    referral: b.ad && (b.ad.headline || b.ad.body) ? { source_id: 'test-ad', source_url: '', source_type: 'ad', headline: cut(b.ad.headline, 200), body: cut(b.ad.body, 400) } : null,
    ts: Math.floor(Date.now() / 1000), start_product: Number(b.start_product) || null,
  } } }];
}
if (action === 'check' || action === 'flow_setup') return [{ json: { action, user_id: user } }];
if (action === 'send') {
  const to = String(b.to || '').replace(/\D/g, '');
  const text = cut(b.text, 4000);
  if (!/^\d{6,20}$/.test(to) || !text) throw new Error('to and text are required');
  return [{ json: { action, user_id: user, to, text } }];
}
throw new Error('unknown action');

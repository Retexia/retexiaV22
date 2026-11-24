// The answer to feeder.retexia.com for "check" (Test connection), "send" (a reply from the panel) or an unknown seller.
const a = $('Panel Action').first().json;
const s = $('Seller').first().json;
const err = r => {
  const e = (r && (r.error || (r.body && r.body.error))) || null;
  if (!e) return '';
  return typeof e === 'string' ? e : `${e.code ? '(' + e.code + ') ' : ''}${e.error_user_msg || e.message || 'error'}`.slice(0, 300);
};
const body = r => (r && r.body !== undefined ? r.body : r) || {};

if (!s.ok) return [{ json: { reply: { ok: false, error: s.why || 'unknown seller' } } }];
if (!s.token || !s.phone_number_id) return [{ json: { reply: { ok: false, error: 'No WhatsApp number or token saved yet.' } } }];

if (a.action === 'check') {
  const info = $('WA: Number Info').first().json;
  const apps = $('WA: Subscribed Apps').isExecuted ? $('WA: Subscribed Apps').first().json : null;
  const e = err(info);
  const i = body(info);
  const subscribed = apps && !err(apps) ? (body(apps).data || []).length > 0 : null;
  return [{ json: { reply: {
    ok: !e && !!i.id, error: e || (i.id ? null : 'WhatsApp did not answer'),
    info: e ? null : { display_phone_number: i.display_phone_number || '', verified_name: i.verified_name || '', quality_rating: i.quality_rating || '',
                       code_verification_status: i.code_verification_status || '', name_status: i.name_status || '', platform_type: i.platform_type || '' },
    subscribed, subscribe_error: apps ? err(apps) || null : null,
  } } }];
}

// send
const r = $('WA: Send Reply').first().json;
const e = err(r);
const id = ((body(r).messages || [])[0] || {}).id || null;
return [{ json: { reply: { ok: !e && !!id, wa_id: id, error: e || (id ? null : 'WhatsApp did not accept the message') } } }];

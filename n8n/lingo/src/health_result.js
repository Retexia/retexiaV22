// Health answer per number → bot_save_check (problems show as a banner in the seller's Lingo and in admin).
const asked = $('Split Numbers').all();
return $input.all().map((r, i) => {
  const j = r.json || {};
  const b = j.body !== undefined ? j.body : j;
  const e = (b && b.error) || null;
  const err = e ? `${e.code ? '(' + e.code + ') ' : ''}${e.error_user_msg || e.message || 'error'}`.slice(0, 300) : null;
  return { json: { p: {
    phone_number_id: asked[i] ? asked[i].json.phone_number_id : null,
    ok: !err && !!(b && b.id),
    error: err || (b && b.id ? null : 'WhatsApp did not answer'),
    info: err ? {} : { display_phone_number: b.display_phone_number || '', verified_name: b.verified_name || '', quality_rating: b.quality_rating || '',
                        code_verification_status: b.code_verification_status || '', name_status: b.name_status || '' },
  } } };
}).filter(x => x.json.p.phone_number_id);

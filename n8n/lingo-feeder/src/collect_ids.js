// WhatsApp message ids of the follow-ups just sent → saved with each message (for delivery statuses).
const sent = $('Build Follow-ups').all();
const items = $input.all().map((r, i) => {
  const j = r.json || {};
  const id = ((j.messages || [])[0] || {}).id || null;
  const e = j.error ? (typeof j.error === 'string' ? j.error : `${j.error.code || ''} ${j.error.message || ''}`.trim()) : null;
  return { msg_id: sent[i] ? sent[i].json.msg_id : null, wa_id: id, error: e || (id ? null : 'no message id') };
}).filter(x => x.msg_id);
return [{ json: { p: { items } } }];

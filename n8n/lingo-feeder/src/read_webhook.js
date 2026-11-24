// Meta's webhook → which WhatsApp number it came to, plus the exact raw body for the
// X-Hub-Signature-256 check (Webhook node: Options → Raw Body ON). Meta already got its 200.
const item = $input.first();
const headers = item.json.headers || {};
let raw = '';
try { raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8'); } catch (e) { raw = ''; }
let body = item.json.body;
if (!body || typeof body !== 'object' || !Object.keys(body).length) {
  try { body = JSON.parse(raw); } catch (e) { body = {}; }
}
if (!raw) raw = JSON.stringify(body);

let pnid = '';
for (const e of body.entry || []) for (const ch of e.changes || []) {
  const id = ((ch.value || {}).metadata || {}).phone_number_id;
  if (id) { pnid = String(id); break; }
}
if (!pnid) return [];                                  // not a WhatsApp event we handle
return [{ json: { phone_number_id: pnid, signature: String(headers['x-hub-signature-256'] || ''), raw, body } }];

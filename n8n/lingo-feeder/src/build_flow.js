// "Create order form" from the panel: the order form is created AND published in the seller's own
// WhatsApp Business Account (POST /{waba_id}/flows with flow_json + publish), with their own token.
// @include order_form.js
const s = $('Seller').first().json;
const flow = ((s.seller || {}).flow) || {};
return [{ json: {
  ok: !!(s.ok && s.token && s.waba_id),
  why: !s.waba_id ? 'Add your WhatsApp Business Account ID on the WhatsApp tab first.' : (!s.token ? 'No token saved yet.' : null),
  url: `https://graph.facebook.com/${$('Config').first().json.GRAPH_VERSION}/${s.waba_id}/flows`,
  body: { name: 'Lingo Feeder order form ' + new Date().toISOString().slice(0, 16).replace('T', ' '), categories: ['OTHER'], flow_json: JSON.stringify(orderFormJson(flow.json_version)), publish: true },
} }];

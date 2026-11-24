// Follow-ups (texts filled in and saved by bot_due_followups): one WhatsApp message each with a
// 🛒 Order button, sent with that seller's own token.
const cfg = $('Config').first().json;
const res = $input.first().json || {};
const items = [];
for (const it of res.items || []) {
  if (!it.text || !it.token || !it.phone_number_id) continue;
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: String(it.to), type: 'interactive',
    interactive: { type: 'button', body: { text: Array.from(it.text).slice(0, 1024).join('') },
      action: { buttons: [{ type: 'reply', reply: { id: 'ORDER', title: Array.from(it.button || 'Order').slice(0, 20).join('') } }] } } };
  items.push({ json: { msg_id: it.msg_id, auth: 'Bearer ' + it.token, url: `https://graph.facebook.com/${cfg.GRAPH_VERSION}/${it.phone_number_id}/messages`, body } });
}
return items;

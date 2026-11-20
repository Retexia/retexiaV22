// One customer turn, whether it came from WhatsApp or from the panel's Test bot (test mode:
// nothing is sent to WhatsApp, rows are marked test). Every later node reads $('Message').
if ($('Verify & Split').isExecuted) {
  const v = $('Verify & Split').first().json;
  const n = $('Number').first().json;
  return [{ json: { ...v.message, lingo_user_id: n.lingo_user_id, phone_number_id: n.phone_number_id, token: n.token, settings: n.settings || {}, test: false, start_product: null } }];
}
const a = $('Panel Action').first().json;
const s = $('Seller').first().json;
return [{ json: { ...a.message, lingo_user_id: s.lingo_user_id, phone_number_id: s.phone_number_id, token: null, settings: s.settings || {}, test: true } }];

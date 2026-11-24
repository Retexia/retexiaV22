// One customer turn, from WhatsApp or from the panel's "Try Lingo" (test mode: nothing is sent to
// WhatsApp, rows are marked test). Every later node reads $('Message').
const base = $('Verify & Split').isExecuted
  ? (() => {
      const v = $('Verify & Split').first().json;
      const n = $('Number').first().json;
      return { ...v.message, user_id: n.user_id, phone_number_id: n.phone_number_id, token: n.token, seller: n.seller || {}, test: false, start_product: null };
    })()
  : (() => {
      const a = $('Panel Action').first().json;
      const s = $('Seller').first().json;
      return { ...a.message, user_id: s.user_id, phone_number_id: s.phone_number_id, token: null, seller: s.seller || {}, test: true };
    })();
const kind = base.tap ? 'tap' : base.media ? (base.media.kind === 'audio' ? 'voice' : 'image') : 'text';
return [{ json: { ...base, kind } }];

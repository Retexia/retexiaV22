// The ad-match answer → bot_set_ad (0 = nothing fits: the seller picks the product in Products → Ads).
const m = $('Message').first().json;
const gate = $('Gate').first().json;
const r = $input.first().json || {};
let pid = 0;
try { pid = Number(JSON.parse(String((((r.choices || [])[0] || {}).message || {}).content || '{}')).p) || 0; } catch (e) { pid = 0; }
return [{ json: { p: { user_id: m.user_id, ad_id: (gate.ad || {}).id, product_id: pid || null, phone: m.phone } } }];

// The ad-match answer → bot_set_ad (0 = nothing fits: the seller picks the product in Lingo → Ads).
const m = $('Message').first().json;
const gate = $('Gate').first().json;
const g = $input.first().json || {};
const raw = ((((g.candidates || [])[0] || {}).content || {}).parts || []).filter(x => !x.thought).map(x => x.text || '').join('');
let pid = 0;
try { pid = Number(JSON.parse(raw.replace(/```(json)?/g, '').trim()).p) || 0; } catch (e) { pid = 0; }
return [{ json: { p: { lingo_user_id: m.lingo_user_id, ad_id: (gate.ad || {}).id, product_id: pid || null, phone: m.phone } } }];

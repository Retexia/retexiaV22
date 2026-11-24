// Every connected WhatsApp number → one health check each (token valid, number status, quality rating).
const cfg = $('Config').first().json;
const list = Array.isArray($input.first().json) ? $input.first().json : ($input.first().json || {}).items || $input.all().map(i => i.json);
return (list || []).filter(n => n && n.token && n.phone_number_id).map(n => ({ json: {
  phone_number_id: n.phone_number_id,
  auth: 'Bearer ' + n.token,
  url: `https://graph.facebook.com/${cfg.GRAPH_VERSION}/${n.phone_number_id}`,
  qs: { fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type' },
} }));

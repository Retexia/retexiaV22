-- =====================================================================
-- 0043: Lingo Feeder, more like a person texting
--   * Greetings in English for every customer ("Good morning Nimal 😊 …"): that's how Sri Lankans greet.
--   * settings.variants: 3-4 ways to say each common message; Lingo picks a different one each time
--     (your edits in settings.texts stay the first choice of each).
--   * bot_claim returns 'related': one product for a short, no-pressure suggestion after an order.
-- Safe to run again. Run after 0042.
-- =====================================================================

update lingo_feeder.settings set value = value || $json${
  "greet_morning":   {"si": "Good morning", "sg": "Good morning", "en": "Good morning"},
  "greet_afternoon": {"si": "Good afternoon", "sg": "Good afternoon", "en": "Good afternoon"},
  "greet_evening":   {"si": "Good evening", "sg": "Good evening", "en": "Good evening"},
  "greet_night":     {"si": "Hi", "sg": "Hi", "en": "Hi"},
  "suggest": {
    "si": "ඔයාට {related} ගැනත් විස්තර ඕන නම් කියන්න 😊",
    "sg": "Oyata {related} gena details ona nam kiyanna 😊",
    "en": "If you'd like to know about {related} too, just ask 😊"}
}$json$::jsonb where key = 'texts';

insert into lingo_feeder.settings (key, value, note) values ('variants', $json${
  "hello": {
    "si": ["{greet} {name} 😊 මම Lingo, {business} එකෙන්.", "{greet} {name}! 😊 මම Lingo, {business} එකෙන් කතා කරන්නේ.", "{greet} {name} 😊 {business} එකෙන් මම Lingo."],
    "sg": ["{greet} {name} 😊 Mama Lingo, {business} eken.", "{greet} {name}! 😊 Mama Lingo, {business} eken katha karanne.", "{greet} {name} 😊 {business} eken mama Lingo."],
    "en": ["{greet} {name} 😊 I'm Lingo from {business}.", "{greet} {name}! 😊 This is Lingo from {business}.", "{greet} {name} 😊 Lingo here, from {business}."]},
  "got_details": {
    "si": ["ඔයාගේ විස්තර ලැබුණා, ස්තූතියි 🙏", "විස්තර ලැබුණා {name}, බොහොම ස්තූතියි 😊", "හරි, විස්තර ටික ලැබුණා 👍"],
    "sg": ["Oyage details labuna, thank you 🙏", "Details labuna {name}, bohoma sthuthi 😊", "Hari, details tika labuna 👍"],
    "en": ["Got your details, thank you 🙏", "Thanks {name}, got your details 😊", "Great, I have your details 👍"]},
  "ask_missing": {
    "si": ["ස්තූතියි 🙏 ඕඩර් එක දාන්න තව {missing} එවන්නකෝ.", "හරි {name} 😊 {missing} විතරක් එවන්න, එච්චරයි.", "ස්තූතියි! තව {missing} ලැබුණොත් ඕඩර් එක දාන්න පුළුවන් 😊"],
    "sg": ["Thank you 🙏 Order eka danna thawa {missing} ewannako.", "Hari {name} 😊 {missing} witharak ewanna, echcharai.", "Thank you! Thawa {missing} labunoth order eka danna puluwan 😊"],
    "en": ["Thank you 🙏 Please send your {missing} too.", "Thanks {name} 😊 Just your {missing} and we're done.", "Great! I only need your {missing} to place the order 😊"]},
  "ask_wa_phone": {
    "si": ["ස්තූතියි {name} 🙏 ඕඩර් එකට ඔයා මේ message කරන WhatsApp number එකම ({wa_phone}) දාන්නද?", "හරි {name} 😊 courier එකට මේ WhatsApp number එකට ({wa_phone}) call කරන්නද?", "ස්තූතියි! phone number එකට මේ WhatsApp number එකම ({wa_phone}) දාන්නද {name}?"],
    "sg": ["Thank you {name} 🙏 Order ekata oya me message karana WhatsApp number ekama ({wa_phone}) dannada?", "Hari {name} 😊 Courier ekata me WhatsApp number ekata ({wa_phone}) call karannada?", "Thank you! Phone number ekata me WhatsApp number ekama ({wa_phone}) dannada {name}?"],
    "en": ["Thank you {name} 🙏 Shall I use this WhatsApp number ({wa_phone}) for the order?", "Thanks {name} 😊 Can the courier call you on this WhatsApp number ({wa_phone})?", "Great! Shall I put this WhatsApp number ({wa_phone}) as your phone number, {name}?"]},
  "confirmed": {
    "si": ["❤️ බොහොම ස්තූතියි {o_first}! ඔයාගේ ඕඩර් එක confirm කළා.\n📦 ඉක්මනින්ම pack කරලා courier එකට දෙනවා. දවස් {delivery_days}ක් ඇතුළත ගෙදරටම ලැබෙයි, එන්න කලින් courier එකෙන් call එකක් දෙයි 📞",
           "❤️ ඕඩර් එක confirm කළා {o_first}, ස්තූතියි!\n📦 අද හෙටම pack කරලා courier එකට දෙනවා. දවස් {delivery_days}ක් ඇතුළත ලැබෙයි, courier එකෙන් එන්න කලින් call කරයි 📞",
           "❤️ හරි {o_first}, ඔයාගේ ඕඩර් එක දැම්මා!\n📦 දවස් {delivery_days}ක් ඇතුළත ගෙදරටම එවනවා. එන්න කලින් courier එකෙන් call එකක් එයි 📞"],
    "sg": ["❤️ Bohoma sthuthi {o_first}! Oyage order eka confirm kala.\n📦 Ikmanatama pack karala courier ekata denawa. Dawas {delivery_days} athara gedaratama labei, enna kalin courier eken call ekak dei 📞",
           "❤️ Order eka confirm kala {o_first}, thank you!\n📦 Ada hetama pack karala courier ekata denawa. Dawas {delivery_days} athara labei, enna kalin call karai 📞",
           "❤️ Hari {o_first}, oyage order eka dammaa!\n📦 Dawas {delivery_days} athara gedaratama ewanawa. Enna kalin courier eken call ekak ei 📞"],
    "en": ["❤️ Thank you so much {o_first}! Your order is confirmed.\n📦 We'll pack it and hand it to the courier soon. It reaches your door within {delivery_days} days, and the courier will call before delivering 📞",
           "❤️ Your order is confirmed, {o_first}. Thank you!\n📦 It goes to the courier within a day and reaches you in {delivery_days} days. They'll call before they come 📞",
           "❤️ Done, {o_first}! Your order is placed.\n📦 Expect it within {delivery_days} days; the courier will call you first 📞"]},
  "cancelled": {
    "si": ["හරි {name}, ඕඩර් එක cancel කළා 👍 ආයෙත් ඕන වුණොත් මට message එකක් දාන්න 😊", "කමක් නෑ {name}, cancel කළා 👍 ඕන වෙලාවක message කරන්න 😊"],
    "sg": ["Hari {name}, order eka cancel kala 👍 Ayeth ona unoth mata message ekak danna 😊", "Kamak na {name}, cancel kala 👍 Ona welawaka message karanna 😊"],
    "en": ["Okay {name}, your order is cancelled 👍 Message me anytime if you need it again 😊", "No problem {name}, it's cancelled 👍 I'm here whenever you need me 😊"]},
  "call_ok": {
    "si": ["හරි {name} 😊 අපේ කෙනෙක් ඉක්මනින්ම මේ number එකට call එකක් දෙයි 📞 ({call_hours})", "හරි {name}, අපේ team එකෙන් ඉක්මනින්ම call කරන්නම් 📞 ({call_hours})"],
    "sg": ["Hari {name} 😊 Ape kenek ikmanatama me number ekata call ekak dei 📞 ({call_hours})", "Hari {name}, ape team eken ikmanatama call karannam 📞 ({call_hours})"],
    "en": ["Sure {name} 😊 Someone from our team will call you on this number soon 📞 ({call_hours})", "Of course {name}, our team will give you a call soon 📞 ({call_hours})"]},
  "thanks": {
    "si": ["ස්තූතියි {name} 😊 තව මොනවා හරි ඕන නම් අහන්න, මම ඉන්නවා.", "ඔයාටත් ස්තූතියි {name} ❤️", "හරි {name} 😊 ඕන දෙයක් තිබ්බොත් message කරන්න."],
    "sg": ["Thank you {name} 😊 Thawa monawa hari ona nam ahanna, mama innawa.", "Oyatath thank you {name} ❤️", "Hari {name} 😊 Ona deyak thibboth message karanna."],
    "en": ["Thank you {name} 😊 Just ask if you need anything else.", "Thank you too, {name} ❤️", "Anytime {name} 😊 Message me if you need anything."]},
  "ok_reply": {
    "si": ["හරි {name} 😊 ඕඩර් එක දාන්න කැමති නම් පහළ button එක ඔබන්න, නැත්නම් ඕන දෙයක් අහන්න 👇", "හරි 😊 තව මොනවා හරි දැනගන්න ඕනද {name}? ඕඩර් කරන්න නම් පහළින් ඔබන්න 👇"],
    "sg": ["Hari {name} 😊 Order eka danna kamathi nam pahala button eka obanna, nathnam ona deyak ahanna 👇", "Hari 😊 Thawa monawa hari dana ganna onada {name}? Order karanna nam pahalin obanna 👇"],
    "en": ["Sure {name} 😊 Tap the button below to order, or ask me anything 👇", "Okay 😊 Anything else you'd like to know, {name}? To order, tap below 👇"]},
  "later": {
    "si": ["හරි {name} 😊 ලෑස්ති වුණාම විස්තර ටික එවන්න, මම ඉන්නවා.", "කමක් නෑ {name} 😊 වෙලාවක් තියෙද්දී එවන්න.", "හරි හරි 😊 පස්සේ එවන්න, මම බලන් ඉන්නම්."],
    "sg": ["Hari {name} 😊 Lassana welawaka details tika ewanna, mama innawa.", "Kamak na {name} 😊 Welawak thiyeddi ewanna.", "Hari hari 😊 Passe ewanna, mama balan innam."],
    "en": ["Sure {name} 😊 Send the details whenever you're ready, I'm here.", "No rush {name} 😊 Send them when you have a moment.", "Okay 😊 Whenever you're ready."]},
  "not_interested": {
    "si": ["හරි {name} 😊 කමක් නෑ. ආයෙත් ඕන වුණොත් මට message එකක් දාන්න.", "කමක් නෑ {name} 😊 ඕන වෙලාවක message කරන්න."],
    "sg": ["Hari {name} 😊 Kamak na. Ayeth ona unoth mata message ekak danna.", "Kamak na {name} 😊 Ona welawaka message karanna."],
    "en": ["No problem {name} 😊 Message me anytime if you need it.", "That's fine {name} 😊 I'm here if you change your mind."]},
  "followup": {
    "si": ["{name} 😊 {product} ගැන තව මොනවා හරි දැනගන්න ඕනද? ඕඩර් එකක් දාන්න කැමති නම් පහළ button එක ඔබන්න 👇", "{name} 😊 {product} ඕඩර් එක දාන්නද? ලෑස්ති නම් පහළින් ඔබන්න 👇"],
    "sg": ["{name} 😊 {product} gena thawa monawa hari dana ganna onada? Order ekak danna kamathi nam pahala button eka obanna 👇", "{name} 😊 {product} order eka dannada? Lassana nam pahalin obanna 👇"],
    "en": ["{name} 😊 Anything else you'd like to know about {product}? If you'd like to order, just tap the button below 👇", "{name} 😊 Shall I place your order for {product}? Tap below when you're ready 👇"]}
}$json$::jsonb, 'Other ways to say a message (by text key and language). Lingo picks one at random; settings.texts is always one of the choices.')
on conflict (key) do update set value = excluded.value;

create or replace function lingo_feeder.bot_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user  uuid := (p->>'user_id')::uuid;
  v_phone text := p->>'phone';
  v_buf   bigint := (p->>'buffer_id')::bigint;
  v_msgs  jsonb;
  v_text  text;
  v_chat  lingo_feeder.chats;
  v_quoted int;
begin
  perform pg_advisory_xact_lock(hashtext('lingo-feeder:' || v_user || ':' || v_phone));
  if exists (select 1 from lingo_feeder.buffer where user_id = v_user and phone = v_phone and id > v_buf) then
    return jsonb_build_object('ok', false, 'why', 'newer message is waiting');
  end if;
  with d as (delete from lingo_feeder.buffer where user_id = v_user and phone = v_phone and id <= v_buf returning *)
  select jsonb_agg(jsonb_build_object('t', content, 'kind', kind, 'qid', quoted_id, 'tap', tap, 'wa_id', wa_id) order by coalesce(wa_ts, 0), id),
         string_agg(content, ' ' order by coalesce(wa_ts, 0), id)
    into v_msgs, v_text from d;
  if v_msgs is null then return jsonb_build_object('ok', false, 'why', 'already handled'); end if;

  select * into v_chat from lingo_feeder.chats where user_id = v_user and phone = v_phone;
  select pm.product_id into v_quoted from lingo_feeder.product_msgs pm
   where pm.user_id = v_user and pm.wa_id in (select x->>'qid' from jsonb_array_elements(v_msgs) x where x->>'qid' is not null) limit 1;

  return jsonb_build_object(
    'ok', true,
    'msgs', v_msgs,
    'chat', to_jsonb(v_chat),
    'seller', lingo_feeder.seller_info(v_user),
    'product', (select to_jsonb(c) from lingo_feeder.catalog(v_user) c where c.id = v_chat.product_id),
    'quoted', (select to_jsonb(c) from lingo_feeder.catalog(v_user) c where c.id = v_quoted and c.enabled),
    'matches', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('score', m.score) order by m.score desc)
                           from jsonb_to_recordset(lingo_feeder.match_products(v_user, v_text, 4)) as m(id int, name text, score int)
                           join lingo_feeder.catalog(v_user) c on c.id = m.id), '[]'::jsonb),
    'history', coalesce((
        select jsonb_agg(jsonb_build_object('r', m.role, 'c', left(coalesce(nullif(m.note, ''), m.content), 220)) order by m.id)
          from (select * from lingo_feeder.messages
                 where user_id = v_user and phone = v_phone and not (role = 'b' and note = '')
                 order by id desc limit 8) m), '[]'::jsonb),
    'order', (select to_jsonb(o) from lingo_feeder.orders o
               where o.user_id = v_user and o.phone = v_phone and o.status = 'draft' and o.updated_at > now() - interval '14 days'
               order by o.id desc limit 1),
    'last_order', (select to_jsonb(o) from lingo_feeder.orders o
                    where o.user_id = v_user and o.phone = v_phone and o.status = 'confirmed' order by o.id desc limit 1),
    'texts', coalesce(lingo_feeder.setting('texts'), '{}'::jsonb),
    'variants', coalesce(lingo_feeder.setting('variants'), '{}'::jsonb),
    'banned', coalesce(lingo_feeder.setting('banned'), '[]'::jsonb),
    'style', coalesce(lingo_feeder.setting('lingo_style'), '""'::jsonb),
    'budget', lingo_feeder.budget(v_user),
    -- One related product for a short suggestion after an order (same need / same kind of product).
    'related', (select to_jsonb(c) from lingo_feeder.catalog(v_user) c
                 join jsonb_to_recordset(lingo_feeder.match_products(v_user,
                        (select concat_ws(' ', p.keywords, p.benefits, p.aliases) from lingo_feeder.products p where p.product_id = v_chat.product_id), 6))
                      as m(id int, name text, score int) on m.id = c.id
                where v_chat.product_id is not null and c.enabled and c.id <> v_chat.product_id and m.score >= 8
                  and not (c.id = any (v_chat.products_seen))
                order by (c.picture_url is not null) desc, m.score desc limit 1),
    -- Lingo doesn't know the product yet: the whole (short) catalogue, so the AI can tell from what
    -- they describe ("sugar beheth", a voice note…) which product they mean.
    'catalog', case when v_chat.product_id is null then coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'price', c.price, 'delivery_fee', c.delivery_fee, 'total', c.total, 'enabled', true,
                                            'short_description', c.short_description, 'long_description', c.long_description, 'picture_url', c.picture_url,
                                            'how_to_use', c.how_to_use, 'precautions', c.precautions, 'benefits', c.benefits, 'ingredients', c.ingredients,
                                            'faqs', c.faqs, 'k', left(concat_ws(', ', nullif(c.keywords, ''), nullif(c.benefits, '')), 90)) order by c.id)
          from lingo_feeder.catalog(v_user) c where c.enabled), '[]'::jsonb) end
  );
end $$;

revoke execute on function lingo_feeder.bot_claim(jsonb) from public, anon, authenticated;
grant execute on function lingo_feeder.bot_claim(jsonb) to service_role;

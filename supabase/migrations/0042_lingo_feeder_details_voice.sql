-- =====================================================================
-- 0042: Lingo Feeder, better order details and voice notes (after real tests)
--
--   * Order details are checked: a town alone isn't an address (Lingo asks for the house / work address),
--     a wrong phone number is pointed out, and a missing phone number is asked as "Shall I use this
--     WhatsApp number?" with buttons (chats.awaiting = 'phone').
--   * New texts for that (added only where they aren't in settings.texts yet: your edits stay).
--   * Voice notes are written down by Gemini 3.5 Flash (clearer Sinhala than Flash-Lite), with the chat's
--     product as a hint (bot_gate returns product_name). settings.ai.media_audio; photos stay on Flash-Lite.
--   * When Lingo doesn't know the product yet, bot_claim also returns the short catalogue so the AI can
--     pick the product from what the customer describes.
-- Safe to run again. Run after 0039 and 0040.
-- =====================================================================

alter table lingo_feeder.chats drop constraint if exists chats_awaiting_check;
alter table lingo_feeder.chats add constraint chats_awaiting_check check (awaiting is null or awaiting in
  ('details', 'qty', 'confirm', 'same', 'phone', 'field_name', 'field_address', 'field_phone', 'field_qty', 'product'));

insert into lingo_feeder.model_prices (model, provider, in_per_m, cached_per_m, out_per_m, audio_per_m) values
  ('gemini-3.5-flash', 'gemini', 1.50, 0.15, 9.00, 1.50)
on conflict (model) do nothing;

update lingo_feeder.settings set value = jsonb_build_object('media_audio', 'gemini-3.5-flash') || value where key = 'ai';
update lingo_feeder.settings set note = note || ' media_audio = voice notes (gemini-3.5-flash hears Sinhala best; media = photos).'
 where key = 'ai' and note not like '%media_audio%';

-- New texts: the defaults go UNDER what is there, so edited texts are kept.
update lingo_feeder.settings set value = $json${
  "ask_wa_phone": {
    "si": "ස්තූතියි {name} 🙏 ඕඩර් එකට ඔයා මේ message කරන WhatsApp number එකම ({wa_phone}) දාන්නද?",
    "sg": "Thank you {name} 🙏 Order ekata oya me message karana WhatsApp number ekama ({wa_phone}) dannada?",
    "en": "Thank you {name} 🙏 Shall I use this WhatsApp number ({wa_phone}) for the order?"},
  "ask_phone": {
    "si": "හරි 😊 courier එකට call කරන්න පුළුවන් phone number එක එවන්න 📞",
    "sg": "Hari 😊 Courier ekata call karanna puluwan phone number eka ewanna 📞",
    "en": "Sure 😊 Send the phone number the courier can call 📞"},
  "phone_bad": {
    "si": "{bad} අංකය හරි නෑ වගේ 🙏 ඉලක්කම් 10ක අංකයක් එවන්න (උදා: 077 123 4567).",
    "sg": "{bad} number eka hari na wage 🙏 Ilakkam 10ka number ekak ewanna (ex: 077 123 4567).",
    "en": "{bad} doesn't look like a full phone number 🙏 Please send a 10-digit number (e.g. 077 123 4567)."},
  "address_vague": {
    "si": "\"{address}\" කියලා විතරක් courier එකට ගෙදර හොයාගන්න අමාරුයි 🙏 ගෙදර හරි වැඩ කරන තැනේ හරි සම්පූර්ණ ලිපිනය එවන්න (අංකය, පාර, නගරය).",
    "sg": "\"{address}\" witharak courier ekata hoyaganna amarui 🙏 Gedara hari wada karana thane hari full address eka ewanna (number eka, para, nagaraya).",
    "en": "Just \"{address}\" isn't enough for the courier 🙏 Please send the full home or work address (number, street, town)."},
  "ask_again": {
    "si": "{name} 😊 type කරන්න අමාරු නම් අපේ කෙනෙක් call කරලා විස්තර ගන්නම්. නැත්නම් {missing} එවන්නකෝ 🙏",
    "sg": "{name} 😊 Type karanna amaru nam ape kenek call karala details gannam. Nathnam {missing} ewannako 🙏",
    "en": "{name} 😊 If typing is hard, someone from our team can call you and take the details. Or just send your {missing} 🙏"},
  "later": {
    "si": "හරි {name} 😊 ලෑස්ති වුණාම විස්තර ටික එවන්න, මම ඉන්නවා.",
    "sg": "Hari {name} 😊 Lassana welawaka details tika ewanna, mama innawa.",
    "en": "Sure {name} 😊 Send the details whenever you're ready, I'm here."},
  "btn_wa_yes": {"si": "✅ ඔව්, මේ number එක", "sg": "✅ Ow, me number eka", "en": "✅ Yes, this number"},
  "btn_wa_no":  {"si": "📞 වෙන number එකක්", "sg": "📞 Wena number ekak", "en": "📞 Another number"}
}$json$::jsonb || value where key = 'texts';


create or replace function lingo_feeder.bot_gate(p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_user  uuid := nullif(p->>'user_id', '')::uuid;
  v_phone text := p->>'phone';
  v_test  boolean := coalesce((p->>'test')::boolean, false);
  v_ref   jsonb := p->'referral';
  v_ad    text;
  v_adrow lingo_feeder.ads;
  v_chat  lingo_feeder.chats;
  v_s     lingo_feeder.sellers;
  v_rows  int;
  v_start int := nullif(p->>'start_product', '')::int;
  v_m     jsonb;
  v_new   boolean;
begin
  select * into v_s from lingo_feeder.sellers where user_id = v_user;
  if v_s.user_id is null then return jsonb_build_object('status', 'unknown'); end if;
  if v_test <> (v_phone like 'test-%') then return jsonb_build_object('status', 'refused'); end if;

  if not v_test then
    update lingo_feeder.numbers set last_webhook_at = now() where user_id = v_user;
    insert into lingo_feeder.seen (wa_id) values (p->>'wa_id') on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then return jsonb_build_object('status', 'dup'); end if;
    if random() < 0.02 then delete from lingo_feeder.seen where at < now() - interval '3 days'; end if;
  end if;

  if jsonb_typeof(v_ref) = 'object' then
    v_ad := left(coalesce(nullif(v_ref->>'source_id', ''), nullif(v_ref->>'source_url', '')), 300);
  end if;

  select * into v_chat from lingo_feeder.chats where user_id = v_user and phone = v_phone;
  v_new := v_chat.phone is null;
  if v_new and v_ad is null and not v_test and v_s.ads_only then
    return jsonb_build_object('status', 'ignored');
  end if;

  insert into lingo_feeder.chats (user_id, phone, profile_name, last_in_at, test)
  values (v_user, v_phone, nullif(left(btrim(p->>'name'), 80), ''), now(), v_test)
  on conflict (user_id, phone) do update
     set last_in_at = now(), profile_name = coalesce(excluded.profile_name, lingo_feeder.chats.profile_name)
  returning * into v_chat;

  if v_ad is not null then
    insert into lingo_feeder.ads (user_id, ad_id, headline, body, source_url)
    values (v_user, v_ad, left(v_ref->>'headline', 300), left(v_ref->>'body', 1000), left(v_ref->>'source_url', 500))
    on conflict (user_id, ad_id) do update set chats = lingo_feeder.ads.chats + 1;
    select * into v_adrow from lingo_feeder.ads where user_id = v_user and ad_id = v_ad;
    -- A clear match in the ad's own words: no AI needed.
    if v_adrow.product_id is null and not v_adrow.tried then
      v_m := lingo_feeder.match_products(v_user, concat_ws(' ', v_adrow.headline, v_adrow.body, v_adrow.source_url), 2);
      if jsonb_array_length(v_m) >= 1 and (v_m->0->>'score')::int >= 8
         and (jsonb_array_length(v_m) = 1 or (v_m->0->>'score')::int >= (v_m->1->>'score')::int * 2) then
        update lingo_feeder.ads set product_id = (v_m->0->>'id')::int, matched_by = 'text', tried = true
         where user_id = v_user and ad_id = v_ad returning * into v_adrow;
      end if;
    end if;
    -- A new ad click moves the chat to that ad's product (a customer can come back from another ad).
    update lingo_feeder.chats set ad_id = v_ad, product_id = coalesce(v_adrow.product_id, product_id)
     where user_id = v_user and phone = v_phone returning * into v_chat;
  end if;
  if v_test and v_start is not null and exists (select 1 from lingo_feeder.catalog(v_user) c where c.id = v_start and c.enabled) then
    update lingo_feeder.chats set product_id = v_start where user_id = v_user and phone = v_phone returning * into v_chat;
  end if;

  -- Spam stays quiet; a paused chat (the seller is answering) or Lingo off: keep the message for the panel and stop.
  if v_chat.status = 'spam' or (v_chat.paused_until is not null and v_chat.paused_until > now()) or (v_s.status <> 'live' and not v_test) then
    insert into lingo_feeder.messages (user_id, phone, role, kind, content, wa_id)
    values (v_user, v_phone, 'c', coalesce(nullif(p->>'kind', ''), 'text'), left(coalesce(nullif(p->>'text', ''), '[media]'), 2000), nullif(p->>'wa_id', ''));
    update lingo_feeder.chats set last_msg_at = now() where user_id = v_user and phone = v_phone;
    return jsonb_build_object('status', case when v_chat.status = 'spam' then 'spam' when v_s.status <> 'live' and not v_test then 'off' else 'paused' end);
  end if;

  if v_ad is not null and v_adrow.product_id is null and not v_adrow.tried then
    return jsonb_build_object(
      'status', 'ok', 'need_ad_match', true,
      'ad', jsonb_build_object('id', v_ad, 'headline', v_adrow.headline, 'body', v_adrow.body),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'n', c.name, 'k', left(c.aliases, 60)) order by c.id)
                              from lingo_feeder.catalog(v_user) c where c.enabled), '[]'::jsonb));
  end if;
  return jsonb_build_object('status', 'ok', 'need_ad_match', false,
    'product_name', (select pr.name from lingo_feeder.products pr where pr.product_id = v_chat.product_id));
end $$;

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
    'banned', coalesce(lingo_feeder.setting('banned'), '[]'::jsonb),
    'style', coalesce(lingo_feeder.setting('lingo_style'), '""'::jsonb),
    'budget', lingo_feeder.budget(v_user),
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

revoke execute on function lingo_feeder.bot_gate(jsonb) from public, anon, authenticated;
revoke execute on function lingo_feeder.bot_claim(jsonb) from public, anon, authenticated;
grant execute on function lingo_feeder.bot_gate(jsonb) to service_role;
grant execute on function lingo_feeder.bot_claim(jsonb) to service_role;

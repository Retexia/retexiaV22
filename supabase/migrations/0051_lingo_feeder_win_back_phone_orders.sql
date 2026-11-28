-- =====================================================================
-- 0051: Lingo Feeder wins customers back, and the seller can take an
-- order by phone.
--   * texts.win_back: when a customer backs off ("not now", "too expensive",
--     "I'll think"), Lingo says once why this product suits them (from the
--     product's facts), that they pay only at the door, and shows the Order
--     button. A second "no" is accepted kindly. (The AI writes the reason;
--     this text is the fallback.)
--   * panel_add_order(): many customers don't text back after the first
--     message. The seller calls them, fills a short form in the chat, and
--     the order is saved as confirmed. texts.phone_order is the WhatsApp
--     message they get: thanks, with their order details.
-- Safe to run again. Run after 0050.
-- =====================================================================

-- New texts (the seller's own edits in settings.texts stay).
update lingo_feeder.settings set value = $json${
  "win_back": {
    "si": "තේරෙනවා {name} 😊 කිසිම බලපෑමක් නෑ. ඒත් {product} ඔයාට ගොඩක් උදව් වෙයි කියලා හිතෙනවා. බඩුව ගෙදරට ආවම තමයි ගෙවන්නේ (Cash on delivery), කිසිම අවදානමක් නෑ. ඕඩර් කරන්නද? 👇",
    "sg": "Therenawa {name} 😊 Kisima balapemak na. Eth {product} oyata godak udaw wei kiyala hithenawa. Badu gedarata awama thamai gewanne (Cash on delivery), kisima risk ekak na. Order karannada? 👇",
    "en": "I understand {name} 😊 No pressure at all. I really think {product} can help you, and you only pay when it reaches your home (cash on delivery), so there's no risk. Shall I take the order? 👇"},
  "phone_order": {
    "si": "❤️ බොහොම ස්තූතියි {o_first}! ඔයාගේ ඕඩර් එක confirm කළා.\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n💵 මුළු මුදල රු. {total}/- (delivery එක්කම, බඩුව ලැබුණම ගෙවන්න)\n\n📦 දවස් {delivery_days}ක් ඇතුළත ගෙදරටම ලැබෙයි, එන්න කලින් courier එකෙන් call එකක් දෙයි 📞",
    "sg": "❤️ Bohoma sthuthi {o_first}! Oyage order eka confirm kala.\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n💵 Total Rs. {total}/- (delivery ekkama, badu labunama gewanna)\n\n📦 Dawas {delivery_days} athara gedaratama labei, enna kalin courier eken call ekak dei 📞",
    "en": "❤️ Thank you so much {o_first}! Your order is confirmed.\n\n🛍️ {product} × {qty}\n👤 {o_name}\n🏠 {o_address}\n📞 {o_phones}\n💵 Total Rs. {total}/- (incl. delivery, pay when it arrives)\n\n📦 It reaches your door within {delivery_days} days, and the courier will call before delivering 📞"}
}$json$::jsonb || value where key = 'texts';

-- An order taken by phone: saved confirmed, the chat marked ordered, and the message to send.
create or replace function lingo_feeder.panel_add_order(p_user uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = lingo_feeder, public as $$
declare
  v_phone text := btrim(coalesce(p->>'phone', ''));
  v_qty int := greatest(1, least(20, coalesce(nullif(p->>'qty', '')::int, 1)));
  v_name text := left(nullif(btrim(p->>'name'), ''), 80);
  v_address text := left(nullif(btrim(p->>'address'), ''), 300);
  v_p1 text := left(nullif(btrim(p->>'phone1'), ''), 20);
  v_p2 text := left(nullif(btrim(p->>'phone2'), ''), 20);
  v_chat lingo_feeder.chats;
  v_prod record;
  v_order bigint;
  v_total numeric;
  v_days text;
  v_texts jsonb;
  v_msg text;
  v_money text;
begin
  select * into v_chat from lingo_feeder.chats where user_id = p_user and phone = v_phone and not test;
  if v_chat.phone is null then return jsonb_build_object('ok', false, 'error', 'chat'); end if;
  if v_name is null or v_address is null or v_p1 is null then return jsonb_build_object('ok', false, 'error', 'details'); end if;
  select c.id, c.name, c.price, c.delivery_fee into v_prod from lingo_feeder.catalog(p_user) c where c.id = nullif(p->>'product_id', '')::int;
  if v_prod.id is null then return jsonb_build_object('ok', false, 'error', 'product'); end if;

  v_total := v_prod.price * v_qty + coalesce(v_prod.delivery_fee, 0);
  insert into lingo_feeder.orders (user_id, phone, product_id, product_name, qty, name, address, phone1, phone2,
                                   unit_price, delivery_fee, total, status, ad_id, test, confirmed_at)
  values (p_user, v_phone, v_prod.id, v_prod.name, v_qty, v_name, v_address, v_p1, v_p2,
          v_prod.price, v_prod.delivery_fee, v_total, 'confirmed', v_chat.ad_id, false, now())
  returning id into v_order;

  update lingo_feeder.chats
     set status = 'ordered', status_at = now(), needs_call = false, awaiting = null, product_id = v_prod.id,
         details = jsonb_strip_nulls(jsonb_build_object('name', v_name, 'address', v_address, 'phone', v_p1, 'phone2', v_p2))
   where user_id = p_user and phone = v_phone;
  -- Drafts Lingo started for this chat are replaced by this order.
  update lingo_feeder.orders set status = 'cancelled', cancelled_at = now()
   where user_id = p_user and phone = v_phone and status = 'draft';
  insert into lingo_feeder.events (user_id, phone, type, detail)
  values (p_user, v_phone, 'order_confirmed', jsonb_build_object('order_id', v_order, 'by', 'seller_phone'));

  select coalesce(delivery_days, '2-3') into v_days from lingo_feeder.sellers where user_id = p_user;
  select value into v_texts from lingo_feeder.settings where key = 'texts';
  v_money := to_char(v_total, 'FM999,999,990');
  v_msg := coalesce(v_texts->'phone_order'->>v_chat.lang, v_texts->'phone_order'->>'si', '');
  v_msg := replace(replace(replace(replace(replace(replace(replace(replace(v_msg,
             '{o_first}', coalesce(lingo_feeder.first_name(v_name), v_name)),
             '{product}', v_prod.name), '{qty}', v_qty::text), '{o_name}', v_name), '{o_address}', v_address),
             '{o_phones}', concat_ws(' / ', v_p1, v_p2)), '{total}', v_money), '{delivery_days}', coalesce(v_days, '2-3'));

  return jsonb_build_object(
    'ok', true, 'order_id', v_order, 'message', v_msg, 'lang', v_chat.lang,
    'window_open', v_chat.last_in_at is not null and v_chat.last_in_at > now() - interval '24 hours');
end $$;

revoke execute on function lingo_feeder.panel_add_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function lingo_feeder.panel_add_order(uuid, jsonb) to service_role;

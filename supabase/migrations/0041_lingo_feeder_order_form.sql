-- =====================================================================
-- 0041: Lingo Feeder order form (WhatsApp Flows).
--
-- The 🛒 Order button opens a native WhatsApp form inside the chat: name, address, phone, a second phone
-- and the quantity (with the total for each). The form is created and published in the seller's own
-- WhatsApp Business Account from the panel (WhatsApp tab → Order form); its id is kept here. Sellers
-- without a form keep the typed details flow. Safe to run again. Run after 0039.
-- =====================================================================

alter table lingo_feeder.numbers add column if not exists flow_id text check (flow_id is null or flow_id ~ '^[0-9]{6,25}$');
alter table lingo_feeder.numbers add column if not exists flow_status text check (flow_status is null or flow_status in ('published', 'draft', 'failed'));
alter table lingo_feeder.numbers add column if not exists flow_error text;
alter table lingo_feeder.numbers add column if not exists flow_at timestamptz;
comment on column lingo_feeder.numbers.flow_id is 'The published WhatsApp Flow (order form) in this number''s WABA. Empty = customers type their details.';
grant select (flow_id, flow_status, flow_error, flow_at) on lingo_feeder.numbers to authenticated;

-- The engine gets the form id (only when it is published) with the seller's details.
create or replace function lingo_feeder.seller_info(p_user uuid) returns jsonb
language sql stable security definer set search_path = lingo_feeder, public as $$
  select jsonb_build_object(
    'business', s.business_name, 'phone', coalesce(s.phone, ''), 'location', coalesce(s.location, ''), 'address', coalesce(s.address, ''),
    'delivery_days', s.delivery_days, 'call_hours', s.call_hours, 'about', coalesce(s.about, ''), 'ads_only', s.ads_only, 'status', s.status,
    'ai', coalesce(lingo_feeder.setting('ai'), '{}'::jsonb), 'timing', coalesce(lingo_feeder.setting('timing'), '{}'::jsonb),
    'flow', coalesce(lingo_feeder.setting('flow'), '{}'::jsonb),
    'flow_id', (select n.flow_id from lingo_feeder.numbers n where n.user_id = s.user_id and n.flow_status = 'published'))
  from lingo_feeder.sellers s where s.user_id = p_user;
$$;
revoke execute on function lingo_feeder.seller_info(uuid) from public, anon, authenticated;
grant execute on function lingo_feeder.seller_info(uuid) to service_role;

insert into lingo_feeder.settings (key, value, note) values
('flow', '{"json_version": "7.0", "message_version": "3"}',
 'WhatsApp Flows (the order form): json_version = Flow JSON version used when a seller creates their form; message_version = flow_message_version when sending it.')
on conflict (key) do nothing;

-- New texts (existing texts are kept as they are).
update lingo_feeder.settings set value = $json${
  "ask_form": {
    "si": "හරි {name} 😊 පහළ button එක ඔබලා ඕඩර් form එක පුරවන්න 👇 තත්පර 30ක වැඩක් විතරයි.",
    "sg": "Hari {name} 😊 Pahala button eka obala order form eka purawanna 👇 Thathpara 30k wadak witharai.",
    "en": "Sure {name} 😊 Tap the button below and fill in the order form 👇 It takes 30 seconds."},
  "btn_form": {"si": "📝 ඕඩර් form එක", "sg": "📝 Order form eka", "en": "📝 Order form"},
  "form_got": {"si": "Form එක ලැබුණා, ස්තූතියි 🙏", "sg": "Form eka labuna, thank you 🙏", "en": "Got your form, thank you 🙏"}
}$json$::jsonb || value
 where key = 'texts';

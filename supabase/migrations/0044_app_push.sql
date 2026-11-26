-- =====================================================================
-- 0044: the Retexia app (Android now, iPhone later): push notifications and account deletion
--   * public.push_tokens: the phones a person is signed in to the app on (Expo push tokens).
--     register_push_token() moves a phone's token to whoever signed in on it last.
--   * public.notification_prefs: per person, push on/off, muted kinds of notification, and when
--     they last opened the app's Inbox.
--   * notifications_outbox gets the channel 'push' (subject = title, body, payload.url = the screen
--     the notification opens). admin.retexia.com/api/notifications/dispatch sends them through the
--     Expo Push API (the Database Webhook on INSERT already calls it).
--   * public.queue_push(): one push for a person, only when they have the app and didn't turn it off.
--   * Account notices (_notify_customer) also push when a product is being set up, goes live, or a
--     free trial starts. The app never sells, so nothing about prices or paying is pushed.
--   * Lingo Feeder pushes "Call them", new confirmed orders and WhatsApp number problems. Pushes go
--     through Expo and Google, so they never carry the end customer's name, phone or words.
--   * public.account_deletion_requests + request_account_deletion() / cancel_account_deletion():
--     "Delete my account" in the app and on retexia.com/delete-account (Google Play and Apple
--     require both). The team deletes the account in admin (0022); the request then shows as done.
--   * Realtime for lingo_feeder.chats and lingo_feeder.messages (live chats in the app; RLS still
--     limits each seller to their own rows).
-- Safe to run again. Run after 0043.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Push tokens
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  expo_token      text not null unique check (expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  platform        text not null check (platform in ('android', 'ios')),
  device_name     text check (device_name is null or char_length(device_name) <= 120),
  app_version     text check (app_version is null or char_length(app_version) <= 40),
  last_seen_at    timestamptz not null default now(),
  disabled        boolean not null default false,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id) where not disabled;
comment on table public.push_tokens is 'Phones signed in to the Retexia app. One row per phone (its Expo push token); the token moves to whoever signed in on that phone last.';
comment on column public.push_tokens.disabled is 'True when Expo said the app was removed from the phone, or the person signed out. Disabled tokens get no pushes.';

drop trigger if exists set_updated_at on public.push_tokens;
create trigger set_updated_at before update on public.push_tokens for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;
drop policy if exists "Own push tokens" on public.push_tokens;
create policy "Own push tokens" on public.push_tokens for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Remove own push tokens" on public.push_tokens;
create policy "Remove own push tokens" on public.push_tokens for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

-- Sign-in on a phone: keep (or move) that phone's token for the signed-in person.
create or replace function public.register_push_token(p_token text, p_platform text, p_device text default null, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, expo_token, platform, device_name, app_version, last_seen_at, disabled, disabled_reason)
  values (v_uid, trim(p_token), p_platform, nullif(left(trim(coalesce(p_device, '')), 120), ''), nullif(left(trim(coalesce(p_version, '')), 40), ''), now(), false, null)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, device_name = excluded.device_name,
        app_version = excluded.app_version, last_seen_at = now(), disabled = false, disabled_reason = null;
end;
$$;

-- Sign-out on a phone: that phone stops getting this person's pushes.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where expo_token = trim(p_token) and user_id = auth.uid();
$$;

revoke execute on function public.register_push_token(text, text, text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text, text, text) to authenticated, service_role;
grant execute on function public.unregister_push_token(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Notification preferences
-- ---------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  push          boolean not null default true,
  muted         text[] not null default '{}' check (cardinality(muted) <= 50),
  inbox_seen_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.notification_prefs is 'Per person: app notifications on or off, which kinds are muted, and when they last opened the Inbox. No row = everything on.';
comment on column public.notification_prefs.muted is 'Muted notifications: an exact event ("lingo_feeder.order") or a whole kind ("order.*" mutes every order.… event).';

drop trigger if exists set_updated_at on public.notification_prefs;
create trigger set_updated_at before update on public.notification_prefs for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;
drop policy if exists "Own notification prefs" on public.notification_prefs;
create policy "Own notification prefs" on public.notification_prefs for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Add own notification prefs" on public.notification_prefs;
create policy "Add own notification prefs" on public.notification_prefs for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Change own notification prefs" on public.notification_prefs;
create policy "Change own notification prefs" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;

-- ---------------------------------------------------------------------
-- 3. The outbox learns "push"
-- ---------------------------------------------------------------------
alter table public.notifications_outbox drop constraint if exists notifications_outbox_channel_check;
alter table public.notifications_outbox add constraint notifications_outbox_channel_check check (channel in ('email', 'whatsapp', 'push'));
comment on column public.notifications_outbox.channel is 'email (Resend), whatsapp (n8n) or push (the Retexia app, through Expo; user_id says whose phones, payload.url the screen it opens).';
create index if not exists notifications_outbox_push_idx on public.notifications_outbox (user_id, created_at desc) where channel = 'push';

-- The app's Inbox: a person reads their own app notifications (never emails or anyone else's).
drop policy if exists "Own app notifications" on public.notifications_outbox;
create policy "Own app notifications" on public.notifications_outbox
  for select to authenticated using (channel = 'push' and user_id = (select auth.uid()));

-- One push for one person. Nothing is queued when they have no phone with the app, turned app
-- notifications off, or muted this kind. Returns true when a push was queued.
create or replace function public.queue_push(
  p_user uuid,
  p_event text,
  p_title text,
  p_body text,
  p_url text default null,
  p_data jsonb default '{}'::jsonb,
  p_order_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs public.notification_prefs%rowtype;
begin
  if p_user is null or coalesce(trim(p_title), '') = '' then
    return false;
  end if;
  if not exists (select 1 from public.push_tokens t where t.user_id = p_user and not t.disabled) then
    return false;
  end if;
  select * into v_prefs from public.notification_prefs where user_id = p_user;
  if found and (not v_prefs.push or p_event = any (v_prefs.muted) or split_part(p_event, '.', 1) || '.*' = any (v_prefs.muted)) then
    return false;
  end if;
  insert into public.notifications_outbox (event, channel, user_id, order_id, subject, body, payload)
  values (p_event, 'push', p_user, p_order_id, left(trim(p_title), 120), left(coalesce(p_body, ''), 400),
          coalesce(p_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('url', p_url)));
  return true;
end;
$$;
revoke execute on function public.queue_push(uuid, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.queue_push(uuid, text, text, text, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Account notices also push (only "it's ready" news; billing stays on retexia.com)
-- ---------------------------------------------------------------------
create or replace function public._notify_customer(
  p_event text,
  p_order_id uuid,
  p_user_id uuid,
  p_subject text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce(
    (select notification_settings -> p_event from public.staff_settings where id = 1),
    '{"email": true}'::jsonb
  );
  v_profile public.profiles%rowtype;
  v_status text := coalesce(p_payload ->> 'to_status', p_payload ->> 'status');
  v_product text;
begin
  if p_user_id is null then
    return;
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return;
  end if;
  if coalesce((v_cfg ->> 'email')::boolean, true) and v_profile.email is not null then
    insert into public.notifications_outbox (event, channel, recipient, user_id, order_id, subject, body, payload)
    values (p_event, 'email', v_profile.email, p_user_id, p_order_id, p_subject, p_body, p_payload);
  end if;
  if coalesce((v_cfg ->> 'whatsapp')::boolean, false) and coalesce(v_profile.whatsapp, v_profile.phone) is not null then
    insert into public.notifications_outbox (event, channel, recipient, user_id, order_id, subject, body, payload)
    values (p_event, 'whatsapp', coalesce(v_profile.whatsapp, v_profile.phone), p_user_id, p_order_id, p_subject, p_body, p_payload);
  end if;

  -- The app: its own short words, never the email text (that one talks about paying).
  if (p_event = 'order.status_changed' and v_status in ('setting_up', 'active'))
     or (p_event = 'order.created' and v_status = 'trial') then
    select coalesce(pr.name, 'Retexia') into v_product
      from public.orders o left join public.products pr on pr.id = o.product_id where o.id = p_order_id;
    v_product := coalesce(v_product, 'Retexia');
    perform public.queue_push(
      p_user_id, p_event,
      case v_status when 'active' then v_product || ' is ready'
                    when 'trial' then 'Your free trial of ' || v_product || ' has started'
                    else 'We''re setting up ' || v_product end,
      case v_status when 'setting_up' then 'We''ll tell you here when it''s ready.' else 'Open it in the app.' end,
      '/', jsonb_build_object('ref', p_payload ->> 'ref'), p_order_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Lingo Feeder pushes
-- ---------------------------------------------------------------------
-- "Call them": a chat was just flagged (not by the seller themselves, not a test chat).
create or replace function lingo_feeder.push_call() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.test or not new.needs_call or coalesce(new.call_reason, '') = 'Marked by you' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.needs_call then
    return null;
  end if;
  perform public.queue_push(
    new.user_id, 'lingo_feeder.call', '📞 Call them',
    'A customer is waiting for your call. Open Call them to see who.',
    '/lingo-feeder/chats?status=call', '{}'::jsonb
  );
  return null;
end;
$$;
drop trigger if exists push_call on lingo_feeder.chats;
create trigger push_call after insert or update of needs_call on lingo_feeder.chats
  for each row execute function lingo_feeder.push_call();

-- A new confirmed order (a draft confirmed by the customer; "order back on" from the panel doesn't push).
create or replace function lingo_feeder.push_order() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.test or new.status <> 'confirmed' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    return null;
  end if;
  perform public.queue_push(
    new.user_id, 'lingo_feeder.order', '🛒 New order',
    concat_ws(' · ', coalesce(nullif(new.product_name, ''), 'An order') || case when new.qty > 1 then ' × ' || new.qty else '' end,
              case when new.total is not null then 'Rs. ' || to_char(round(new.total), 'FM999,999,999,990') end),
    '/lingo-feeder/orders', jsonb_build_object('order_id', new.id)
  );
  return null;
end;
$$;
drop trigger if exists push_order on lingo_feeder.orders;
create trigger push_order after insert or update of status on lingo_feeder.orders
  for each row execute function lingo_feeder.push_order();

-- The seller's WhatsApp number stopped working.
create or replace function lingo_feeder.push_number() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'problem' and old.status is distinct from 'problem' then
    perform public.queue_push(
      new.user_id, 'lingo_feeder.number', '⚠️ Your WhatsApp number has a problem',
      'Lingo can''t answer on it right now. Open Lingo Feeder to see what''s wrong.',
      '/lingo-feeder', '{}'::jsonb
    );
  end if;
  return null;
end;
$$;
drop trigger if exists push_number on lingo_feeder.numbers;
create trigger push_number after update of status on lingo_feeder.numbers
  for each row execute function lingo_feeder.push_number();

revoke execute on function lingo_feeder.push_call() from public, anon, authenticated;
revoke execute on function lingo_feeder.push_order() from public, anon, authenticated;
revoke execute on function lingo_feeder.push_number() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Account deletion requests
-- ---------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  email      text,
  reason     text check (reason is null or char_length(reason) <= 1000),
  source     text not null default 'web' check (source in ('app', 'web')),
  status     text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists account_deletion_requests_one_open on public.account_deletion_requests (user_id) where status = 'pending';
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests (status, created_at);
comment on table public.account_deletion_requests is 'People who asked to delete their Retexia account (from the app or retexia.com/delete-account). Delete the customer in admin (Customers → Delete everything); the request then shows as done.';

-- When the account itself is deleted, its open request is done (the email stays as the record).
create or replace function public.account_deletion_done() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is null and old.user_id is not null and new.status = 'pending' then
    new.status := 'done';
    new.handled_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists account_deletion_done on public.account_deletion_requests;
create trigger account_deletion_done before update on public.account_deletion_requests
  for each row execute function public.account_deletion_done();
drop trigger if exists set_updated_at on public.account_deletion_requests;
create trigger set_updated_at before update on public.account_deletion_requests for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;
drop policy if exists "Own deletion requests" on public.account_deletion_requests;
create policy "Own deletion requests" on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

-- The signed-in person asks for their account to be deleted. Asking twice keeps the first request.
create or replace function public.request_account_deletion(p_reason text default null, p_source text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_req public.account_deletion_requests%rowtype;
  v_emails text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_req from public.account_deletion_requests where user_id = v_uid and status = 'pending';
  if found then
    return jsonb_build_object('id', v_req.id, 'created_at', v_req.created_at, 'new', false);
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  insert into public.account_deletion_requests (user_id, email, reason, source)
  values (v_uid, v_profile.email, nullif(left(trim(coalesce(p_reason, '')), 1000), ''),
          case when p_source = 'app' then 'app' else 'web' end)
  returning * into v_req;

  perform public._audit('deletion_requested', 'profiles', v_uid::text,
    coalesce(v_profile.email, v_uid::text) || ' asked to delete their account (' || v_req.source || ')');

  -- The team is always told (a legal duty, not a setting): every staff notification address.
  select staff_notification_emails into v_emails from public.staff_settings where id = 1;
  foreach v_email in array string_to_array(coalesce(v_emails, ''), ',')
  loop
    v_email := trim(v_email);
    if v_email <> '' then
      insert into public.notifications_outbox (event, channel, recipient, subject, body, payload)
      values ('account.deletion_requested', 'email', v_email,
              'Account deletion request: ' || coalesce(v_profile.email, 'a customer'),
              coalesce(nullif(v_profile.full_name, ''), v_profile.email, 'A customer') || ' asked to delete their Retexia account'
                || ' (from the ' || case when v_req.source = 'app' then 'app' else 'website' end || ').'
                || coalesce(E'\n\nReason: ' || v_req.reason, '')
                || E'\n\nDelete it in admin: Customers → the customer → Delete everything.',
              jsonb_build_object('audience', 'staff', 'url', '/customers/' || v_uid));
    end if;
  end loop;
  return jsonb_build_object('id', v_req.id, 'created_at', v_req.created_at, 'new', true);
end;
$$;

-- Changed their mind before the team deleted it.
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.account_deletion_requests set status = 'cancelled', handled_at = now()
   where user_id = auth.uid() and status = 'pending';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public._audit('deletion_cancelled', 'profiles', auth.uid()::text, 'Cancelled their account deletion request');
  end if;
  return v_n > 0;
end;
$$;

revoke execute on function public.request_account_deletion(text, text) from public, anon;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion(text, text) to authenticated, service_role;
grant execute on function public.cancel_account_deletion() to authenticated, service_role;
revoke execute on function public.account_deletion_done() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Live chats in the app (Supabase Realtime; RLS own_read still applies)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['chats', 'messages'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'lingo_feeder' and tablename = t) then
        execute format('alter publication supabase_realtime add table lingo_feeder.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

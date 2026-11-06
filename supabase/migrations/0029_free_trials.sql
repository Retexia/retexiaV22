-- =====================================================================
-- 0029: Free trials (Retexia Feeder → Bulk create v2: 14 days).
--
--   * packages.trial_days: a package with a trial starts without payment or
--     approval: the request goes straight to "Free trial" (panel open) and
--     ends on orders.trial_ends_at.
--   * One trial per customer per product, also per phone / WhatsApp number
--     (a new email doesn't get a second trial); otherwise the normal
--     "Awaiting payment" flow.
--   * public.run_trials() (every hour): reminders 4 days and 1 day before the
--     end, then "Free trial ended" (panel locked, setup kept).
--   * After the trial: the usual payment (bank slip or card) makes it Active.
--   * admin_extend_trial(): staff add days to a trial.
-- Safe to run again. Run after 0028.
-- =====================================================================

alter table public.packages add column if not exists trial_days int not null default 0 check (trial_days between 0 and 90);
comment on column public.packages.trial_days is 'Free trial days (0 = none). New customers start without paying; the panel opens straight away.';

alter table public.orders add column if not exists trial_ends_at timestamptz;
alter table public.orders add column if not exists trial_phone_keys text[];
alter table public.orders add column if not exists trial_reminders int not null default 0;
comment on column public.orders.trial_ends_at is 'End of the free trial (null = no trial).';
comment on column public.orders.trial_phone_keys is 'Last 9 digits of the phone numbers used for the trial (one trial per number).';
grant select (trial_ends_at) on public.orders to authenticated;

-- Statuses and steps.
insert into public.order_statuses (key, label, description, tone, is_final, customer_can_cancel, sort_order) values
  ('trial', 'Free trial', 'Your free trial is running. Open your panel and use everything; nothing to pay until it ends.', 'success', false, true, 4),
  ('trial_ended', 'Free trial ended', 'Your free trial has ended. Pay from here to keep using it; your setup is kept.', 'warning', false, true, 4)
on conflict (key) do nothing;

insert into public.order_status_transitions
  (from_status, to_status, action_label, min_roles, requires_confirmed_payment, requires_reason, notify_customer_default, customer_note_template, sort_order)
select v.f, v.t, v.label, v.roles, v.paid, v.reason, v.notify, v.note, v.n
from (values
  ('trial', 'trial_ended', 'End trial now', array['admin', 'owner'], false, false, true, null::text, 1),
  ('trial', 'active', 'Activate (paid)', array['admin', 'owner'], true, false, true, 'Thank you. Your plan is active.', 2),
  ('trial', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('trial_ended', 'active', 'Activate (paid)', array['support', 'admin', 'owner'], true, false, true, 'Thank you. Your plan is active again.', 1),
  ('trial_ended', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('trial', 'setting_up', 'Start setup (paid)', array['admin', 'owner'], true, false, true, null, 3),
  ('trial_ended', 'setting_up', 'Start setup (paid)', array['support', 'admin', 'owner'], true, false, true, null, 2)
) as v(f, t, label, roles, paid, reason, notify, note, n)
-- (On a new project the core statuses come from seed.sql, which has these steps too.)
where exists (select 1 from public.order_statuses where key = v.f)
  and exists (select 1 from public.order_statuses where key = v.t)
on conflict (from_status, to_status) do nothing;

-- Feeder → Bulk create v2: 14 days free.
update public.packages k
   set trial_days = 14, badge = '14 days free', cta_label = 'Start free trial',
       fine_print = 'Free for 14 days: no payment and no card needed to start. Then LKR 1,900 a month.', updated_at = now()
  from public.products p
 where p.id = k.product_id and p.slug = 'feeder' and k.slug = 'bulk-import-v2';

-- ---------------------------------------------------------------------
-- New request → free trial (when the package has one and the customer hasn't used it).
-- ---------------------------------------------------------------------
create or replace function public._phone_keys(p_answers jsonb, p_user uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct right(d, 9)) filter (where length(d) >= 9), '{}')
    from (
      select regexp_replace(coalesce(a ->> 'value', ''), '\D', '', 'g') as d
        from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) a
       where coalesce(a ->> 'key', '') ~* '(phone|whatsapp|mobile|contact_n|tel)'
      union all
      select regexp_replace(coalesce(x, ''), '\D', '', 'g')
        from public.profiles pr, unnest(array[pr.phone, pr.whatsapp]) x
       where pr.id = p_user
    ) s;
$$;
revoke execute on function public._phone_keys(jsonb, uuid) from public, anon, authenticated;

create or replace function public.prepare_order_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days int;
  v_keys text[];
begin
  if public.is_privileged() or new.status not in ('submitted', 'awaiting_payment') then
    return new;
  end if;
  select trial_days into v_days from public.packages where id = new.package_id;
  if coalesce(v_days, 0) <= 0 then return new; end if;
  v_keys := public._phone_keys(new.answers, new.user_id);
  -- One trial per customer and per phone number for this product.
  if exists (
    select 1 from public.orders o
     where o.product_id = new.product_id and o.trial_ends_at is not null
       and (o.user_id = new.user_id or (cardinality(v_keys) > 0 and o.trial_phone_keys && v_keys))
  ) then
    return new;
  end if;
  new.status := 'trial';
  new.starts_at := now();
  new.trial_ends_at := now() + make_interval(days => v_days);
  new.trial_phone_keys := v_keys;
  new.status_note := 'Free trial until ' || to_char(new.trial_ends_at at time zone 'Asia/Colombo', 'FMDD Mon YYYY');
  return new;
end;
$$;
-- Fires after prepare_order and prepare_order_payment (same kind of trigger: name order).
drop trigger if exists prepare_order_trial on public.orders;
create trigger prepare_order_trial before insert on public.orders
  for each row execute function public.prepare_order_trial();

-- The confirmation email: a trial starts right away.
create or replace function public.notify_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  select * into v_product from public.products where id = new.product_id;
  perform public._notify_customer(
    'order.created', new.id, new.user_id,
    case when new.status = 'trial' then 'Your free trial of ' || coalesce(v_product.name, 'Retexia') || ' has started'
         else 'We received your request ' || new.ref end,
    case
      when new.status = 'trial' then
        'Welcome! Your free trial (' || new.ref || ') is running until '
          || to_char(new.trial_ends_at at time zone 'Asia/Colombo', 'FMDD Mon YYYY') || '. Nothing to pay until then. '
          || coalesce('Open ' || nullif(v_product.panel_url, '') || ' and sign in with this email to get started.', 'Open your panel from your Retexia account to get started.')
      when new.status = 'awaiting_payment' then
        'Thank you. Your ' || coalesce(v_product.name, '') || ' request (' || new.ref || ') is saved. Pay from your account to start; we begin as soon as the payment goes through.'
      else
        'Thank you. We received your ' || coalesce(v_product.name, '') || ' request (' || new.ref || ') and will review it within one working day.'
    end,
    jsonb_build_object('ref', new.ref, 'status', new.status, 'trial_ends_at', new.trial_ends_at)
  );
  perform public._notify_staff(
    'order.created',
    case when new.status = 'trial' then 'New free trial ' || new.ref else 'New request ' || new.ref end,
    'A new ' || coalesce(v_product.name, '') || ' request (' || new.ref || ', ' || coalesce(new.package_name, '') || ') was submitted'
      || case when new.status = 'trial' then ' and started its free trial.' when new.status = 'awaiting_payment' then ' and is waiting for payment.' else '.' end,
    new.id,
    jsonb_build_object('ref', new.ref, 'source', new.source)
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Every hour: reminders, then "Free trial ended".
-- ---------------------------------------------------------------------
create or replace function public.run_trials() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_reminded int := 0;
  v_ended int := 0;
  v_price text;
begin
  for o in
    select x.*, p.name as product_name
      from public.orders x join public.products p on p.id = x.product_id
     where x.status = 'trial' and x.trial_ends_at is not null
     order by x.trial_ends_at
     for update of x skip locked
  loop
    v_price := coalesce(o.currency, 'LKR') || ' ' || to_char(coalesce(o.price_amount, 0) + coalesce(o.setup_fee, 0), 'FM999,999,990');
    if o.trial_ends_at <= now() then
      perform public._change_order_status(
        o.id, 'trial_ended',
        'Your free trial has ended. Pay ' || v_price || ' from your Retexia account (' || o.ref || ') to keep using ' || coalesce(o.product_name, 'it') || '. Your setup is kept.',
        null, true, null, 'system');
      v_ended := v_ended + 1;
    elsif o.trial_ends_at <= now() + interval '1 day' and o.trial_reminders < 2 then
      perform public._notify_customer('order.trial_ending', o.id, o.user_id,
        'Your free trial ends tomorrow',
        'Your ' || coalesce(o.product_name, 'Retexia') || ' free trial (' || o.ref || ') ends on '
          || to_char(o.trial_ends_at at time zone 'Asia/Colombo', 'FMDD Mon, FMHH12:MI AM') || '. To keep using it, pay ' || v_price
          || ' from your Retexia account when it ends. Your products and settings are kept.',
        jsonb_build_object('ref', o.ref, 'trial_ends_at', o.trial_ends_at));
      update public.orders set trial_reminders = 2 where id = o.id;
      v_reminded := v_reminded + 1;
    elsif o.trial_ends_at <= now() + interval '4 days' and o.trial_reminders < 1 then
      perform public._notify_customer('order.trial_ending', o.id, o.user_id,
        '4 days left in your free trial',
        'Your ' || coalesce(o.product_name, 'Retexia') || ' free trial (' || o.ref || ') ends on '
          || to_char(o.trial_ends_at at time zone 'Asia/Colombo', 'FMDD Mon YYYY') || '. After that it is ' || v_price
          || ' a month; you pay from your Retexia account. Your products and settings are kept.',
        jsonb_build_object('ref', o.ref, 'trial_ends_at', o.trial_ends_at));
      update public.orders set trial_reminders = 1 where id = o.id;
      v_reminded := v_reminded + 1;
    end if;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'ended', v_ended);
end;
$$;
revoke execute on function public.run_trials() from public, anon, authenticated;
grant execute on function public.run_trials() to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('retexia-trials', '7 * * * *', 'select public.run_trials();');
  else
    raise notice 'pg_cron is not enabled: enable it (Database → Extensions) and run this file again, so trials end on time.';
  end if;
end $$;

-- Staff: add days to a running (or just ended) trial.
create or replace function public.admin_extend_trial(p_order_id uuid, p_days int) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_end timestamptz;
begin
  if not public.is_staff() and public.request_role() in ('anon', 'authenticated') then
    raise exception 'Only the Retexia team can extend trials' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'Give 1 to 60 days' using errcode = '22023';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.trial_ends_at is null or v_order.status not in ('trial', 'trial_ended') then
    raise exception 'This request has no free trial to extend' using errcode = 'P0001';
  end if;
  v_end := greatest(v_order.trial_ends_at, now()) + make_interval(days => p_days);
  update public.orders set trial_ends_at = v_end, trial_reminders = 0,
         status_note = 'Free trial until ' || to_char(v_end at time zone 'Asia/Colombo', 'FMDD Mon YYYY')
   where id = p_order_id;
  if v_order.status = 'trial_ended' then
    update public.orders set status = 'trial' where id = p_order_id;
  end if;
  perform public._audit('trial_extend', 'orders', p_order_id::text,
    v_order.ref || ': free trial extended by ' || p_days || ' days (until ' || to_char(v_end at time zone 'Asia/Colombo', 'FMDD Mon YYYY') || ')',
    jsonb_build_object('trial_ends_at', v_order.trial_ends_at), jsonb_build_object('trial_ends_at', v_end));
  return v_end;
end $$;
revoke execute on function public.admin_extend_trial(uuid, int) from public, anon;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Paying after the trial: slip upload, card, and the confirmed payment.
-- ---------------------------------------------------------------------
create or replace function public.customer_submit_payment_proof(
  p_order_id uuid,
  p_proof_path text,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('awaiting_payment', 'trial_ended') then
    raise exception 'This request is not waiting for a payment' using errcode = 'P0001';
  end if;
  if p_proof_path is null or p_proof_path not like (auth.uid()::text || '/' || p_order_id::text || '/%') then
    raise exception 'Upload the proof first' using errcode = '22023';
  end if;
  insert into public.payments (order_id, user_id, kind, amount, currency, method, reference, status, proof_path, note, recorded_by)
  values (
    p_order_id, v_order.user_id, 'setup_fee', coalesce(v_order.setup_fee, 0) + coalesce(v_order.price_amount, 0),
    v_order.currency, 'bank_transfer', left(nullif(trim(coalesce(p_reference, '')), ''), 200), 'pending', p_proof_path,
    coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 1000),
             case when v_order.status = 'trial_ended' then 'First month after the free trial (proof uploaded by the customer)'
                  else 'Setup fee and first period (proof uploaded by the customer)' end),
    null
  )
  returning id into v_id;
  perform public._notify_staff(
    'payment.proof_uploaded', 'Payment proof for ' || v_order.ref,
    'The customer uploaded a payment proof for ' || v_order.ref || '.', p_order_id,
    jsonb_build_object('ref', v_order.ref, 'payment_id', v_id)
  );
  return v_id;
end;
$$;

create or replace function public.customer_set_payment_method(p_order_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.payment_methods where key = p_method and status = 'active') then
    raise exception 'This payment method is not available' using errcode = '22023';
  end if;
  update public.orders set payment_method = p_method
   where id = p_order_id and user_id = (select auth.uid())
     and status in ('submitted', 'reviewing', 'awaiting_payment', 'trial_ended');
  if not found then
    raise exception 'This request is not waiting for a payment' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.apply_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_auto boolean;
  v_panel text;
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    select * into v_order from public.orders where id = new.order_id;
    if new.kind = 'subscription' and new.period_end is not null then
      update public.orders
         set renews_at = greatest(coalesce(renews_at, new.period_end), new.period_end)
       where id = new.order_id;
    end if;
    perform public._notify_customer(
      'payment.confirmed', new.order_id, new.user_id,
      'Payment received for ' || v_order.ref,
      'Thank you. We received ' || coalesce(new.currency, '') || ' ' || to_char(new.amount, 'FM999,999,990.00')
        || ' for ' || v_order.ref || '. Receipt ' || new.receipt_number || '.',
      jsonb_build_object('ref', v_order.ref, 'receipt_number', new.receipt_number, 'payment_id', new.id)
    );
    -- A trial (running or ended) that is paid: the plan is active; the paid month starts when the trial ends.
    if new.kind in ('setup_fee', 'subscription') and v_order.status in ('trial', 'trial_ended') then
      update public.orders
         set starts_at = greatest(now(), coalesce(trial_ends_at, now())),
             renews_at = case when new.kind = 'subscription' and new.period_end is not null then renews_at else null end
       where id = v_order.id;
      begin
        perform public._order_move(v_order.id, 'active', 'Thank you. Your plan is active; keep using your panel as before.', true);
      exception when others then
        -- Setup fields still missing for "Active": the team finishes the setup (the payment is never refused).
        perform public._order_move(v_order.id, 'setting_up', 'Payment received, thank you. We are finishing your setup.', true);
      end;
    -- The first payment starts the service: setting up, and live for self-serve products.
    elsif new.kind in ('setup_fee', 'subscription') and v_order.status in ('submitted', 'reviewing', 'awaiting_payment') then
      if v_order.status in ('submitted', 'reviewing') then
        perform public._order_move(v_order.id, 'awaiting_payment', null, false);
      end if;
      perform public._order_move(v_order.id, 'setting_up', 'Payment received, thank you. We have started setting things up.', true);
      select auto_activate, panel_url into v_auto, v_panel from public.products where id = v_order.product_id;
      if coalesce(v_auto, false) then
        perform public._order_move(v_order.id, 'active',
          'You are live. ' || coalesce('Open ' || nullif(v_panel, '') || ' and sign in with this email to finish your setup (it takes a few minutes).', 'Open your panel to get started.'),
          true);
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'failed' and old.status = 'pending' and new.method = 'bank_transfer' then
    select * into v_order from public.orders where id = new.order_id;
    perform public._notify_customer(
      'payment.rejected', new.order_id, new.user_id,
      'We couldn''t confirm your payment for ' || v_order.ref,
      'We couldn''t confirm the payment slip you sent for ' || v_order.ref || '.'
        || coalesce(' ' || nullif(trim(new.review_note), ''), '')
        || ' Please upload the correct slip from your Retexia account, or message us.',
      jsonb_build_object('ref', v_order.ref, 'payment_id', new.id)
    );
  end if;
  return null;
end;
$$;

-- =====================================================================
-- 0020: Payment methods (bank transfer and card), Paddle removed.
--
--   * public.payment_methods: bank transfer and card (PayHere), each Active,
--     Coming soon or Off, one default (bank transfer). Bank details live on the
--     bank transfer method. The admin edits them under Settings → Payments.
--   * orders.payment_method: the method the customer chose (the default at first);
--     they can change it while the request waits for payment.
--   * Bank transfer: the customer uploads the slip; when the team confirms it the
--     request moves on by itself (setting up, and live for self-serve products such
--     as Retexia Post, so the panel opens). Rejecting a slip tells the customer why.
--   * Paddle removed: its columns, table, functions and trigger. The card payment
--     logic PayHere uses now has neutral names (svc_gateway_*).
-- Safe to run again. Run after 0019.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Payment methods
-- ---------------------------------------------------------------------
create table if not exists public.payment_methods (
  key          text primary key check (key in ('bank_transfer', 'card')),
  label        text not null,
  description  text,
  status       text not null default 'off' check (status in ('active', 'coming_soon', 'off')),
  is_default   boolean not null default false,
  instructions text,
  sort_order   int not null default 0,
  updated_at   timestamptz not null default now(),
  constraint payment_methods_default_active check (not is_default or status = 'active')
);
create unique index if not exists payment_methods_one_default on public.payment_methods (is_default) where is_default;
comment on table public.payment_methods is 'How customers can pay: bank transfer and card (PayHere). Active, coming soon (shown, not selectable) or off; one default.';
comment on column public.payment_methods.instructions is 'Markdown shown with this method, e.g. the bank account details for bank transfer.';

drop trigger if exists payment_methods_updated on public.payment_methods;
create trigger payment_methods_updated before update on public.payment_methods for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;
drop policy if exists "Public can read" on public.payment_methods;
create policy "Public can read" on public.payment_methods for select to anon, authenticated using (true);
drop policy if exists "Admins can change" on public.payment_methods;
create policy "Admins can change" on public.payment_methods for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.payment_methods to anon, authenticated;
grant update (label, description, status, instructions, sort_order) on public.payment_methods to authenticated;
grant all on public.payment_methods to service_role;

insert into public.payment_methods (key, label, description, status, is_default, instructions, sort_order)
values
  ('bank_transfer', 'Bank transfer', 'Pay into our bank account, then upload the slip. We confirm it within one working day.', 'active', true,
   coalesce(
     (select nullif(trim(payment_instructions), '') from public.site_settings where id = 1),
     E'Bank: [your bank]\nAccount name: [account name]\nAccount number: [account number]\nBranch: [branch]\n\nUse your request reference (for example PST-2026-0001) as the payment reference.'),
   1),
  ('card', 'Card', 'Visa, Mastercard and other cards, paid securely through PayHere. Renews automatically.', 'coming_soon', false, null, 2)
on conflict (key) do nothing;

-- One default, and it must be active (admins only).
create or replace function public.set_default_payment_method(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_privileged() then
    raise exception 'Only an admin can change this' using errcode = '42501';
  end if;
  if not exists (select 1 from public.payment_methods where key = p_key and status = 'active') then
    raise exception 'Switch the method on (Active) before making it the default' using errcode = 'P0001';
  end if;
  update public.payment_methods set is_default = false where key <> p_key and is_default;
  update public.payment_methods set is_default = true where key = p_key;
end $$;
revoke execute on function public.set_default_payment_method(text) from public, anon;
grant execute on function public.set_default_payment_method(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. The customer's chosen method on each request
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists payment_method text check (payment_method in ('bank_transfer', 'card'));
comment on column public.orders.payment_method is 'How the customer pays this request (the default method at first; they can change it while it waits for payment).';
grant select (payment_method) on public.orders to authenticated;

-- New requests: the default method, and paid plans wait for payment right after the form
-- (products with "pay right after the form" off are reviewed first, then approved).
drop trigger if exists prepare_order_paddle on public.orders;
drop function if exists public.prepare_order_paddle();
create or replace function public.prepare_order_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay boolean;
begin
  if new.payment_method is null
     or not exists (select 1 from public.payment_methods where key = new.payment_method and status = 'active') then
    new.payment_method := (select key from public.payment_methods where is_default and status = 'active' limit 1);
  end if;
  if public.is_privileged() or new.status <> 'submitted' then
    return new;
  end if;
  select coalesce(p.pay_online, true) into v_pay from public.products p where p.id = new.product_id;
  if coalesce(v_pay, true)
     and exists (select 1 from public.payment_methods where status = 'active')
     and coalesce(new.price_amount, 0) + coalesce(new.setup_fee, 0) > 0 then
    new.status := 'awaiting_payment';
  end if;
  return new;
end;
$$;
-- Fires after prepare_order (triggers of the same kind run in name order).
drop trigger if exists prepare_order_payment on public.orders;
create trigger prepare_order_payment before insert on public.orders
  for each row execute function public.prepare_order_payment();

-- The customer switches between the active methods while the request waits for payment.
create or replace function public.customer_set_payment_method(p_order_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.payment_methods where key = p_method and status = 'active') then
    raise exception 'This payment method is not available' using errcode = '22023';
  end if;
  update public.orders set payment_method = p_method
   where id = p_order_id and user_id = (select auth.uid())
     and status in ('submitted', 'reviewing', 'awaiting_payment');
  if not found then
    raise exception 'This request is not waiting for a payment' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.customer_set_payment_method(uuid, text) from public, anon;
grant execute on function public.customer_set_payment_method(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Confirming a payment moves the request on (bank transfer and card alike);
--    rejecting a slip tells the customer why.
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists review_note text;
comment on column public.payments.review_note is 'Why the team could not confirm this payment (shown to the customer).';

-- Customers also see their own rejected slips (with the reason), so they know to send another.
drop policy if exists "Staff and owners can read payments" on public.payments;
create policy "Staff and owners can read payments" on public.payments
  for select to authenticated
  using (
    (select public.is_staff())
    or (user_id = (select auth.uid()) and status in ('confirmed', 'refunded', 'pending', 'failed'))
  );

-- Moves a request along if that step exists from its current status (no error otherwise).
create or replace function public._order_move(p_order_id uuid, p_to text, p_note text, p_notify boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  select status into v_from from public.orders where id = p_order_id;
  if v_from is null or v_from = p_to then return false; end if;
  if not exists (select 1 from public.order_status_transitions where from_status = v_from and to_status = p_to) then
    return false;
  end if;
  perform public._change_order_status(p_order_id, p_to, p_note, null, p_notify, null, 'payment');
  return true;
end;
$$;

create or replace function public.apply_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_auto boolean;
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
    -- The first payment starts the service: setting up, and live for self-serve products.
    if new.kind in ('setup_fee', 'subscription') and v_order.status in ('submitted', 'reviewing', 'awaiting_payment') then
      if v_order.status in ('submitted', 'reviewing') then
        perform public._order_move(v_order.id, 'awaiting_payment', null, false);
      end if;
      perform public._order_move(v_order.id, 'setting_up', 'Payment received, thank you. We have started setting things up.', true);
      select auto_activate into v_auto from public.products where id = v_order.product_id;
      if coalesce(v_auto, false) then
        perform public._order_move(v_order.id, 'active', 'You are live. Open your panel to get started.', true);
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

-- ---------------------------------------------------------------------
-- 4. Card payments (PayHere): the shared logic, under neutral names
-- ---------------------------------------------------------------------
-- A completed card payment: one confirmed payment (receipt, renewal date); the
-- request then moves on through apply_payment().
create or replace function public.svc_gateway_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_status text := coalesce(nullif(p ->> 'status', ''), 'confirmed');
  v_period_end timestamptz := nullif(p ->> 'period_end', '')::timestamptz;
begin
  select * into v_order from public.orders where id = nullif(p ->> 'order_id', '')::uuid for update;
  if not found then
    raise exception 'No request for this payment' using errcode = 'P0002';
  end if;

  select * into v_payment from public.payments where method = 'online_gateway' and reference = p ->> 'transaction_id';
  if found then
    return jsonb_build_object('order_id', v_order.id, 'payment_id', v_payment.id, 'duplicate', true);
  end if;

  update public.orders
     set payment_method = 'card',
         renews_at = case when v_status = 'confirmed' and v_period_end is not null
                          then greatest(coalesce(renews_at, v_period_end), v_period_end) else renews_at end
   where id = v_order.id;

  insert into public.payments (order_id, user_id, kind, amount, currency, method, reference, status, paid_at, period_start, period_end, note, recorded_by)
  values (
    v_order.id, v_order.user_id,
    coalesce(nullif(p ->> 'kind', ''), 'subscription'),
    (p ->> 'amount')::numeric,
    upper(p ->> 'currency'),
    'online_gateway',
    p ->> 'transaction_id',
    v_status,
    coalesce(nullif(p ->> 'paid_at', '')::timestamptz, now()),
    nullif(p ->> 'period_start', '')::timestamptz,
    v_period_end,
    coalesce(nullif(p ->> 'note', ''), 'Card'),
    null
  )
  returning * into v_payment;

  if v_status = 'confirmed' then
    -- A renewal paid for a paused request (subscription resumed).
    if v_order.status = 'paused' and p ->> 'origin' = 'subscription_recurring' then
      perform public._order_move(v_order.id, 'active', 'Welcome back. Everything is running again.', true);
    end if;
  else
    perform public._notify_staff(
      'payment.review',
      'Check card payment for ' || v_order.ref,
      coalesce(p ->> 'note', 'A card payment needs a look.'),
      v_order.id,
      jsonb_build_object('ref', v_order.ref, 'transaction_id', p ->> 'transaction_id')
    );
  end if;

  return jsonb_build_object('order_id', v_order.id, 'payment_id', v_payment.id, 'receipt_number', v_payment.receipt_number);
end;
$$;

-- Subscription changes (cancelled, failed renewal).
create or replace function public.svc_gateway_subscription(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_status text := p ->> 'status';
  v_next timestamptz := nullif(p ->> 'next_billed_at', '')::timestamptz;
  v_moved boolean := false;
begin
  select * into v_order from public.orders where id = nullif(p ->> 'order_id', '')::uuid for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  update public.orders set renews_at = coalesce(v_next, renews_at) where id = v_order.id;

  if v_status = 'canceled' then
    v_moved := public._order_move(v_order.id, 'cancelled', 'Your subscription was cancelled. Thank you for using Retexia.', true);
  elsif v_status = 'past_due' and coalesce(p ->> 'previous_status', '') <> 'past_due' then
    perform public._notify_customer(
      'payment.past_due', v_order.id, v_order.user_id,
      'Payment problem for ' || v_order.ref,
      'We couldn''t take your latest card payment for ' || v_order.ref || '. Please check your card, or pay by bank transfer from your Retexia account, so your service keeps running.',
      jsonb_build_object('ref', v_order.ref)
    );
    perform public._notify_staff(
      'payment.past_due', 'Payment failed: ' || v_order.ref,
      'The card renewal for ' || v_order.ref || ' failed. PayHere retries automatically.',
      v_order.id, jsonb_build_object('ref', v_order.ref)
    );
  end if;
  return jsonb_build_object('found', true, 'order_id', v_order.id, 'moved', v_moved);
end;
$$;

-- An approved card refund or chargeback.
create or replace function public.svc_gateway_refund(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid;
begin
  select * into v_payment from public.payments where method = 'online_gateway' and reference = p ->> 'transaction_id' and kind <> 'refund';
  if not found then
    return jsonb_build_object('found', false);
  end if;
  if exists (select 1 from public.payments where method = 'online_gateway' and reference = p ->> 'adjustment_id') then
    return jsonb_build_object('found', true, 'duplicate', true);
  end if;
  insert into public.payments (order_id, user_id, kind, amount, currency, method, reference, status, note, recorded_by)
  values (v_payment.order_id, v_payment.user_id, 'refund', (p ->> 'amount')::numeric, upper(p ->> 'currency'), 'online_gateway',
          p ->> 'adjustment_id', 'confirmed', coalesce(nullif(p ->> 'reason', ''), 'Card refund'), null)
  returning id into v_refund_id;
  if (p ->> 'amount')::numeric >= v_payment.amount then
    update public.payments set status = 'refunded' where id = v_payment.id;
  end if;
  return jsonb_build_object('found', true, 'refund_id', v_refund_id);
end;
$$;

-- PayHere notifications use the shared logic.
create or replace function public.svc_payhere_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := public._payhere_order(p);
begin
  if v_order is null then
    raise exception 'No request for this PayHere payment' using errcode = 'P0002';
  end if;
  update public.orders
     set payhere_subscription_id = coalesce(payhere_subscription_id, nullif(p ->> 'subscription_id', ''))
   where id = v_order;
  return public.svc_gateway_payment(p || jsonb_build_object('order_id', v_order, 'note', coalesce(nullif(p ->> 'note', ''), 'PayHere')));
end;
$$;

create or replace function public.svc_payhere_subscription(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := public._payhere_order(p);
begin
  if v_order is null then
    return jsonb_build_object('found', false);
  end if;
  update public.orders
     set payhere_subscription_id = coalesce(payhere_subscription_id, nullif(p ->> 'subscription_id', ''))
   where id = v_order;
  return public.svc_gateway_subscription(jsonb_build_object('order_id', v_order, 'status', p ->> 'status', 'next_billed_at', coalesce(p ->> 'next_billed_at', '')));
end;
$$;

create or replace function public.customer_cancelled_subscription(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payhere_subscription_id is not null) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  perform public._order_move(p_order_id, 'cancelled', 'You cancelled your subscription. Thank you for using Retexia.', true);
end;
$$;

revoke execute on function public._order_move(uuid, text, text, boolean), public.svc_gateway_payment(jsonb),
  public.svc_gateway_subscription(jsonb), public.svc_gateway_refund(jsonb) from public, anon, authenticated;
grant execute on function public.svc_gateway_payment(jsonb), public.svc_gateway_subscription(jsonb), public.svc_gateway_refund(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 5. Paddle removed
-- ---------------------------------------------------------------------
drop function if exists public.svc_paddle_payment(jsonb);
drop function if exists public.svc_paddle_subscription(jsonb);
drop function if exists public.svc_paddle_refund(jsonb);
drop function if exists public._paddle_move(uuid, text, text, boolean);
drop function if exists public.customer_set_paddle_transaction(uuid, text);
drop table if exists public.paddle_events;
alter table public.orders drop column if exists paddle_subscription_id;
alter table public.orders drop column if exists paddle_customer_id;
alter table public.orders drop column if exists paddle_transaction_id;
alter table public.packages drop column if exists paddle_price_monthly;
alter table public.packages drop column if exists paddle_price_yearly;
alter table public.packages drop column if exists paddle_price_setup;
alter table public.products drop column if exists paddle_product_id;
alter table public.site_settings drop column if exists online_payments;
alter table public.site_settings drop column if exists payment_instructions;
comment on column public.products.pay_online is 'Customers pay right after the form (bank transfer or card). Off: the team reviews the request first, then approves it for payment.';

-- ---------------------------------------------------------------------
-- 6. Website wording: bank transfer or card
-- ---------------------------------------------------------------------
update public.order_statuses
   set description = 'Pay by bank transfer or card to start. Your request is saved; pay any time from your account.'
 where key = 'awaiting_payment';
update public.order_status_transitions
   set customer_note_template = 'Good news: your request is approved. Open it in your Retexia account to pay by bank transfer or card.'
 where to_status = 'awaiting_payment';
update public.faqs set answer = 'Choose a plan and answer a few questions. Then pay by bank transfer (upload the slip in your account; we confirm it within one working day) or by card where available. We start as soon as the payment is confirmed.'
 where id = md5('retexia:faq:general:3')::uuid;

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(s.content ->> 'body',
       'Payments are processed securely by PayHere (PayHere (Private) Limited, Sri Lanka); we never see or store your full card details. By paying, you allow us to charge the price of your plan through PayHere.',
       'You can pay by bank transfer (upload the slip in your account; your plan starts when we confirm it) or by card. Card payments are processed securely by PayHere (PayHere (Private) Limited, Sri Lanka); we never see or store your full card details. By paying by card, you allow us to charge the price of your plan through PayHere.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'terms' and s.type = 'rich_text'
   and position('pay by bank transfer' in s.content ->> 'body') = 0;

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(s.content ->> 'body',
       'Approved refunds go back to the card you paid with, through PayHere. It usually takes 5 to 10 working days for the money to show, depending on your bank.',
       'Approved refunds go back the way you paid: to your card through PayHere, or to your bank account for bank transfers. It usually takes 5 to 10 working days for the money to show, depending on your bank.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'refund-policy' and s.type = 'rich_text';

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(s.content ->> 'body',
       '- **Payment details:** the plan, amounts and dates of your payments. Your card details are handled by PayHere; we never see or store your full card number.',
       '- **Payment details:** the plan, amounts and dates of your payments, and the bank slips you upload for bank transfers. Your card details are handled by PayHere; we never see or store your full card number.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'privacy' and s.type = 'rich_text';

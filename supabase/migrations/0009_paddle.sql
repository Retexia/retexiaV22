-- =====================================================================
-- 0009: Payments through Paddle (Merchant of Record), prices in USD.
--
--   * Paddle catalog ids on products and packages (filled by the admin's
--     "Sync plans to Paddle" button);
--   * Paddle subscription/customer ids on orders, and a log of webhook events;
--   * orders for packages sold through Paddle start as "awaiting_payment": the
--     customer pays right after the form;
--   * service functions the admin's Paddle webhook calls: record a payment
--     (receipt, renewal date, status → setting up / active), follow the
--     subscription (paused, cancelled, past due), record refunds;
--   * website data: USD prices, Paddle wording, refund policy page.
--
-- Safe to run again. Run after 0001–0008.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.products add column if not exists paddle_product_id text;
alter table public.products add column if not exists auto_activate boolean not null default false;
comment on column public.products.paddle_product_id is 'Paddle product (pro_…). Set by the admin''s "Sync plans to Paddle".';
comment on column public.products.auto_activate is 'Self-serve products: a paid request goes straight to Active (no setup by the team).';

alter table public.packages add column if not exists paddle_price_monthly text;
alter table public.packages add column if not exists paddle_price_yearly text;
alter table public.packages add column if not exists paddle_price_setup text;
comment on column public.packages.paddle_price_monthly is 'Paddle recurring monthly price (pri_…).';
comment on column public.packages.paddle_price_yearly is 'Paddle recurring yearly price (pri_…).';
comment on column public.packages.paddle_price_setup is 'Paddle one-time setup fee price (pri_…), charged with the first payment.';

alter table public.orders add column if not exists paddle_subscription_id text;
alter table public.orders add column if not exists paddle_customer_id text;
alter table public.orders add column if not exists paddle_transaction_id text;
create unique index if not exists orders_paddle_subscription_idx on public.orders (paddle_subscription_id) where paddle_subscription_id is not null;
comment on column public.orders.paddle_subscription_id is 'Paddle subscription (sub_…) that pays for this request.';
grant select (paddle_subscription_id, paddle_customer_id, paddle_transaction_id) on public.orders to authenticated;

-- One payment per Paddle transaction / adjustment.
create unique index if not exists payments_gateway_reference_idx on public.payments (reference) where method = 'online_gateway' and reference is not null;

-- Webhook events (deduplicated by Paddle's event id).
create table if not exists public.paddle_events (
  id           text primary key,
  event_type   text not null,
  occurred_at  timestamptz,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  order_id     uuid references public.orders (id) on delete set null,
  error        text,
  payload      jsonb not null default '{}'::jsonb
);
create index if not exists paddle_events_received_idx on public.paddle_events (received_at desc);
alter table public.paddle_events enable row level security;
revoke all on public.paddle_events from anon, authenticated;
grant select on public.paddle_events to authenticated;
drop policy if exists "Staff read Paddle events" on public.paddle_events;
create policy "Staff read Paddle events" on public.paddle_events for select to authenticated using ((select public.is_staff()));
grant all on public.paddle_events to service_role;
comment on table public.paddle_events is 'Paddle webhook events received by the admin (deduplicated, with processing errors).';

-- ---------------------------------------------------------------------
-- 2. New requests for Paddle packages wait for payment
-- ---------------------------------------------------------------------
create or replace function public.prepare_order_paddle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price text;
begin
  if public.is_privileged() or new.status <> 'submitted' then
    return new;
  end if;
  select case when new.billing_cycle = 'yearly' then pk.paddle_price_yearly else pk.paddle_price_monthly end
    into v_price
    from public.packages pk where pk.id = new.package_id;
  if v_price is not null then
    new.status := 'awaiting_payment';
  end if;
  return new;
end;
$$;
-- Fires after prepare_order (triggers of the same kind run in name order).
drop trigger if exists prepare_order_paddle on public.orders;
create trigger prepare_order_paddle before insert on public.orders
  for each row execute function public.prepare_order_paddle();

-- The customer's confirmation email: "pay to start" instead of "we will review".
create or replace function public.notify_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product text := (select name from public.products where id = new.product_id);
begin
  perform public._notify_customer(
    'order.created', new.id, new.user_id,
    'We received your request ' || new.ref,
    case when new.status = 'awaiting_payment' then
      'Thank you. Your ' || coalesce(v_product, '') || ' request (' || new.ref || ') is saved. Pay from your account to start; we begin as soon as the payment goes through.'
    else
      'Thank you. We received your ' || coalesce(v_product, '') || ' request (' || new.ref || ') and will review it within one working day.'
    end,
    jsonb_build_object('ref', new.ref, 'status', new.status)
  );
  perform public._notify_staff(
    'order.created',
    'New request ' || new.ref,
    'A new ' || coalesce(v_product, '') || ' request (' || new.ref || ', ' || coalesce(new.package_name, '') || ') was submitted'
      || case when new.status = 'awaiting_payment' then ' and is waiting for payment.' else '.' end,
    new.id,
    jsonb_build_object('ref', new.ref, 'source', new.source)
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Service functions for the Paddle webhook (service role only)
-- ---------------------------------------------------------------------

-- Moves a request along if that step exists from its current status (no error otherwise).
create or replace function public._paddle_move(p_order_id uuid, p_to text, p_note text, p_notify boolean)
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
  perform public._change_order_status(p_order_id, p_to, p_note, null, p_notify, null, 'paddle');
  return true;
end;
$$;

-- A completed Paddle transaction: one confirmed payment (receipt, renewal date),
-- then the request moves on: awaiting payment → setting up (→ active for self-serve products).
create or replace function public.svc_paddle_payment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_auto boolean;
  v_status text := coalesce(nullif(p ->> 'status', ''), 'confirmed');
  v_period_end timestamptz := nullif(p ->> 'period_end', '')::timestamptz;
begin
  select * into v_order from public.orders
   where id = nullif(p ->> 'order_id', '')::uuid
      or (paddle_subscription_id is not null and paddle_subscription_id = nullif(p ->> 'subscription_id', ''))
   order by (id = nullif(p ->> 'order_id', '')::uuid) desc nulls last
   limit 1
   for update;
  if not found then
    raise exception 'No request for this Paddle transaction' using errcode = 'P0002';
  end if;

  select * into v_payment from public.payments where method = 'online_gateway' and reference = p ->> 'transaction_id';
  if found then
    return jsonb_build_object('order_id', v_order.id, 'payment_id', v_payment.id, 'duplicate', true);
  end if;

  update public.orders
     set paddle_subscription_id = coalesce(nullif(p ->> 'subscription_id', ''), paddle_subscription_id),
         paddle_customer_id = coalesce(nullif(p ->> 'customer_id', ''), paddle_customer_id),
         paddle_transaction_id = coalesce(paddle_transaction_id, nullif(p ->> 'transaction_id', '')),
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
    coalesce(nullif(p ->> 'note', ''), 'Paddle'),
    null
  )
  returning * into v_payment;

  if v_status = 'confirmed' then
    if v_order.status in ('submitted', 'reviewing') then
      perform public._paddle_move(v_order.id, 'awaiting_payment', null, false);
    end if;
    perform public._paddle_move(v_order.id, 'setting_up', 'Payment received, thank you. We have started setting things up.', true);
    select auto_activate into v_auto from public.products where id = v_order.product_id;
    if coalesce(v_auto, false) then
      perform public._paddle_move(v_order.id, 'active', 'You are live. Open your panel to get started.', true);
    end if;
    -- A renewal paid for a paused request (subscription resumed).
    if v_order.status = 'paused' and p ->> 'origin' = 'subscription_recurring' then
      perform public._paddle_move(v_order.id, 'active', 'Welcome back. Everything is running again.', true);
    end if;
  else
    perform public._notify_staff(
      'payment.review',
      'Check Paddle payment for ' || v_order.ref,
      coalesce(p ->> 'note', 'A Paddle payment needs a look.'),
      v_order.id,
      jsonb_build_object('ref', v_order.ref, 'transaction_id', p ->> 'transaction_id')
    );
  end if;

  return jsonb_build_object('order_id', v_order.id, 'payment_id', v_payment.id, 'receipt_number', v_payment.receipt_number);
end;
$$;

-- Subscription changes from Paddle (the customer's billing portal, or Paddle itself).
create or replace function public.svc_paddle_subscription(p jsonb)
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
  select * into v_order from public.orders
   where (paddle_subscription_id is not null and paddle_subscription_id = p ->> 'subscription_id')
      or id = nullif(p ->> 'order_id', '')::uuid
   order by (paddle_subscription_id = p ->> 'subscription_id') desc nulls last
   limit 1
   for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  update public.orders
     set paddle_subscription_id = coalesce(paddle_subscription_id, nullif(p ->> 'subscription_id', '')),
         paddle_customer_id = coalesce(nullif(p ->> 'customer_id', ''), paddle_customer_id),
         renews_at = coalesce(v_next, renews_at)
   where id = v_order.id;

  if v_status = 'canceled' then
    v_moved := public._paddle_move(v_order.id, 'cancelled', 'Your subscription was cancelled. Thank you for using Retexia.', true);
  elsif v_status = 'paused' then
    v_moved := public._paddle_move(v_order.id, 'paused', 'Your subscription is paused. Resume it any time from Manage billing.', true);
  elsif v_status = 'active' and v_order.status = 'paused' then
    v_moved := public._paddle_move(v_order.id, 'active', 'Welcome back. Everything is running again.', true);
  elsif v_status = 'past_due' and coalesce(p ->> 'previous_status', '') <> 'past_due' then
    perform public._notify_customer(
      'payment.past_due', v_order.id, v_order.user_id,
      'Payment problem for ' || v_order.ref,
      'We couldn''t take your latest payment for ' || v_order.ref || '. Please update your card from your Retexia account (Manage billing) so your service keeps running.',
      jsonb_build_object('ref', v_order.ref)
    );
    perform public._notify_staff(
      'payment.past_due', 'Payment failed: ' || v_order.ref,
      'Paddle could not collect the renewal for ' || v_order.ref || '. Paddle retries automatically.',
      v_order.id, jsonb_build_object('ref', v_order.ref)
    );
  end if;

  return jsonb_build_object('found', true, 'order_id', v_order.id, 'moved', v_moved);
end;
$$;

-- An approved Paddle refund (adjustment).
create or replace function public.svc_paddle_refund(p jsonb)
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
          p ->> 'adjustment_id', 'confirmed', coalesce(nullif(p ->> 'reason', ''), 'Paddle refund'), null)
  returning id into v_refund_id;
  if (p ->> 'amount')::numeric >= v_payment.amount then
    update public.payments set status = 'refunded' where id = v_payment.id;
  end if;
  return jsonb_build_object('found', true, 'refund_id', v_refund_id);
end;
$$;

revoke execute on function public._paddle_move(uuid, text, text, boolean), public.svc_paddle_payment(jsonb),
  public.svc_paddle_subscription(jsonb), public.svc_paddle_refund(jsonb) from public, anon, authenticated;
grant execute on function public.svc_paddle_payment(jsonb), public.svc_paddle_subscription(jsonb), public.svc_paddle_refund(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 4. Website data: USD prices and Paddle wording
-- ---------------------------------------------------------------------
update public.site_settings set currency_code = 'USD', currency_locale = 'en-US' where id = 1;
update public.packages set currency = null where currency = 'LKR';
update public.products set auto_activate = true where slug = 'post';

update public.packages pk
   set price_monthly = v.monthly, price_yearly = v.yearly, setup_fee = v.setup, fine_print = v.fine
  from public.products p,
       (values
         ('lingo', 'core', 25.00, 250.00, 39.00, 'Prices in US dollars. WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('lingo', 'pro', 49.00, 490.00, 69.00, 'Prices in US dollars. WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('lingo', 'supreme', 119.00, 1190.00, 169.00, 'Prices in US dollars. WhatsApp marketing message fees charged by Meta are billed at cost. Yearly plans include 2 months free.'),
         ('post', 'starter', 19.00, 190.00, 0, 'Prices in US dollars. Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.'),
         ('post', 'growth', 49.00, 490.00, 0, 'Prices in US dollars. Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.'),
         ('post', 'pro', 99.00, 990.00, 0, 'Prices in US dollars. Yearly plans include 2 months free. AI allowances reset every month; when one runs out, Post keeps posting with your own photos.')
       ) as v (product, slug, monthly, yearly, setup, fine)
 where p.id = pk.product_id and p.slug = v.product and pk.slug = v.slug;

update public.pages set seo_description = replace(seo_description, 'Plans from LKR 6,900 a month.', 'Plans from US$25 a month.') where slug = 'lingo';
update public.pages set seo_description = replace(seo_description, 'Plans from LKR 5,900 a month.', 'Plans from US$19 a month.') where slug = 'post';

update public.order_statuses
   set description = 'Pay securely to start. Your request is saved; pay any time from your account.'
 where key = 'awaiting_payment';

update public.forms
   set success_title = 'Last step: payment',
       submit_label = 'Continue to payment',
       success_message = 'Pay below to start. We begin setting up your Lingo as soon as your payment goes through.'
 where slug = 'lingo-onboarding';
update public.forms
   set success_title = 'Last step: payment',
       submit_label = 'Continue to payment',
       success_message = 'Pay below to start. Your Post panel opens at post.retexia.com as soon as your payment goes through.'
 where slug = 'post-onboarding';

-- FAQs
update public.faqs set answer = 'Choose a plan, answer a few questions, then pay securely by card, Apple Pay, Google Pay or PayPal through Paddle, our payment partner. We start as soon as the payment goes through.'
 where id = md5('retexia:faq:general:3')::uuid;
update public.faqs set answer = 'Yes. Open the request in your account and press **Manage billing** to cancel. Your service runs until the end of the period you paid for.'
 where id = md5('retexia:faq:lingo:7')::uuid;
update public.faqs set answer = 'Yes. Press **Manage billing** on your request in your account to cancel. Posting stops at the end of the period you paid for; your posts stay on Facebook and Instagram.'
 where id = md5('retexia:faq:post:6')::uuid;
update public.faqs set answer = 'Yes. Message us and we switch your plan from your next billing date. Paddle adjusts the price automatically.'
 where id = md5('retexia:faq:lingo:6')::uuid;

-- Terms: Paddle as Merchant of Record, USD, cancelling through Manage billing.
update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(replace(replace(s.content ->> 'body',
       'When you submit a request, we review it and may ask you questions. We can accept or decline a request. Once accepted, we send you the price and payment details. Setup starts after the first payment is received.',
       'When you order a plan, you answer a few questions about your business and then pay. Setup starts as soon as the first payment goes through. We may contact you with questions, and we can decline a request and refund it in full.'),
       'Prices are shown in Sri Lankan rupees (LKR) unless stated otherwise. Monthly plans are billed every month, yearly plans every year. The setup fee is paid once.',
       'Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders, handles payments and billing questions, and may add sales tax or VAT where it applies. Prices are shown in US dollars. Monthly plans renew every month and yearly plans every year until you cancel. The setup fee is paid once, with the first payment.'),
       'You can cancel a request from your account before setup starts. After that, message us and we will stop the service before your next billing date. Setup fees are not refundable once setup has started. Amounts already paid for the current billing period are not refunded.',
       'You can cancel any time from your account: open the request and press Manage billing. Your plan keeps running until the end of the period you paid for and is not renewed after that. Refunds are covered by our [refund policy](/refund-policy).')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'terms' and s.type = 'rich_text';

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(s.content ->> 'body',
       'WhatsApp messages also pass through Meta''s WhatsApp Business Platform.',
       'WhatsApp messages also pass through Meta''s WhatsApp Business Platform. Payments are handled by Paddle.com, our reseller and Merchant of Record: Paddle processes your card or PayPal details, and we never see or store them.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'privacy' and s.type = 'rich_text'
   and position('Paddle' in s.content ->> 'body') = 0;

-- Refund policy page (Paddle needs one linked from the site).
insert into public.pages (slug, title, seo_title, seo_description, product_id, is_published, show_in_sitemap)
values ('refund-policy', 'Refund policy', null, 'How refunds work for Retexia plans paid through Paddle.', null, true, true)
on conflict (slug) do nothing;
insert into public.page_sections (id, page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order, is_visible)
select md5('retexia:section:refund-policy:1')::uuid, g.id, 'rich_text', null, 'surface', 'Legal', 'Refund policy', null,
  'Last updated: 9 October 2026',
  $json${"body": "We want you to be happy with Retexia. If you are not, this is how refunds work.\n\n## 14-day money-back guarantee\n\nIf you are not satisfied, ask for a refund within **14 days of your first payment** and we will refund it in full, including the setup fee.\n\n## Renewals\n\nYou can ask for a refund of a renewal (monthly or yearly) within 14 days of the renewal date. Cancel first from your account (**Manage billing**) so the plan is not renewed again.\n\n## How to ask\n\nEmail hello@retexia.com with your request reference (for example LNG-2026-0001), or reply to your Paddle receipt. Refunds go back to the card or PayPal account you paid with, through Paddle, usually within 5 to 10 working days.\n\n## Who processes refunds\n\nOur order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders and handles refunds and billing questions.\n\n## Cancelling\n\nYou can cancel any time from your account. Your plan keeps running until the end of the period you paid for."}$json$::jsonb,
  1, true
from public.pages g where g.slug = 'refund-policy'
on conflict (id) do nothing;

insert into public.navigation_items (id, location, label, href, kind, open_in_new_tab, sort_order)
values (md5('retexia:nav:footer_legal:3')::uuid, 'footer_legal', 'Refund policy', '/refund-policy', 'link', false, 3)
on conflict (id) do nothing;

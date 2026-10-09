-- =====================================================================
-- 0012: PayHere (Sri Lanka) for online payments.
--
--   * orders.payhere_subscription_id: the PayHere subscription paying for a request;
--   * payhere_events: every notification PayHere sends to the admin (deduplicated);
--   * service functions for the admin's /api/payhere/notify (same rules as Paddle:
--     receipt, renewal date, awaiting payment → setting up → active for self-serve
--     products, cancellations, failed renewals);
--   * customer_cancelled_subscription: after the customer cancels in their account;
--   * website wording: PayHere instead of Paddle.
-- Safe to run again. Run after 0009–0011.
-- =====================================================================

alter table public.orders add column if not exists payhere_subscription_id text;
create unique index if not exists orders_payhere_subscription_idx on public.orders (payhere_subscription_id) where payhere_subscription_id is not null;
grant select (payhere_subscription_id) on public.orders to authenticated;
comment on column public.orders.payhere_subscription_id is 'PayHere subscription that pays for this request.';

create table if not exists public.payhere_events (
  id          text primary key,
  message     text not null,
  order_id    uuid references public.orders (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error       text,
  payload     jsonb not null default '{}'::jsonb
);
create index if not exists payhere_events_received_idx on public.payhere_events (received_at desc);
alter table public.payhere_events enable row level security;
revoke all on public.payhere_events from anon, authenticated;
grant select on public.payhere_events to authenticated;
drop policy if exists "Staff read PayHere events" on public.payhere_events;
create policy "Staff read PayHere events" on public.payhere_events for select to authenticated using ((select public.is_staff()));
grant all on public.payhere_events to service_role;

-- Request for a PayHere notification: custom_1 carries the request id; renewals also match the subscription.
create or replace function public._payhere_order(p jsonb)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.orders
   where id = (case when p ->> 'order_id' ~ '^[0-9a-f-]{36}$' then (p ->> 'order_id')::uuid end)
      or (payhere_subscription_id is not null and payhere_subscription_id = nullif(p ->> 'subscription_id', ''))
      or ref = nullif(p ->> 'ref', '')
   limit 1;
$$;

-- A successful PayHere payment (first payment or renewal).
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
  -- Same bookkeeping as Paddle (receipt, renewal date, status changes, emails).
  return public.svc_paddle_payment(p || jsonb_build_object('order_id', v_order, 'subscription_id', '', 'customer_id', '', 'note', coalesce(nullif(p ->> 'note', ''), 'PayHere')));
end;
$$;

-- Subscription changes: stopped (cancelled) or a failed renewal.
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
  return public.svc_paddle_subscription(jsonb_build_object('order_id', v_order, 'status', p ->> 'status', 'next_billed_at', coalesce(p ->> 'next_billed_at', '')));
end;
$$;

-- The customer cancelled their PayHere subscription from their account (after PayHere confirmed it).
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
  perform public._paddle_move(p_order_id, 'cancelled', 'You cancelled your subscription. Thank you for using Retexia.', true);
end;
$$;

revoke execute on function public._payhere_order(jsonb), public.svc_payhere_payment(jsonb), public.svc_payhere_subscription(jsonb) from public, anon, authenticated;
grant execute on function public.svc_payhere_payment(jsonb), public.svc_payhere_subscription(jsonb) to service_role;
revoke execute on function public.customer_cancelled_subscription(uuid) from public, anon;
grant execute on function public.customer_cancelled_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Website wording: PayHere
-- ---------------------------------------------------------------------
update public.order_statuses
   set description = 'Pay securely with PayHere to start. Your request is saved; pay any time from your account.'
 where key = 'awaiting_payment';

update public.faqs set answer = 'Choose a plan, answer a few questions, then pay securely by Visa, Mastercard or other cards through PayHere. Your plan renews automatically and we start as soon as the payment goes through.'
 where id = md5('retexia:faq:general:3')::uuid;
update public.faqs set answer = 'Yes. Open the request in your account and press **Cancel subscription**. Your service runs until the end of the period you paid for.'
 where id = md5('retexia:faq:lingo:7')::uuid;
update public.faqs set answer = 'Yes. Press **Cancel subscription** on your request in your account. Posting stops at the end of the period you paid for; your posts stay on Facebook and Instagram.'
 where id = md5('retexia:faq:post:6')::uuid;
update public.faqs set answer = 'Yes. Message us and we switch your plan from your next billing date.'
 where id = md5('retexia:faq:lingo:6')::uuid;

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(replace(s.content ->> 'body',
       'Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders, handles payments and billing questions, and may add sales tax or VAT where it applies. Prices are shown in US dollars.',
       'Payments are processed securely by PayHere (PayHere (Private) Limited, Sri Lanka). Prices are shown in the currency on the pricing page.'),
       'You can cancel any time from your account: open the request and press Manage billing.',
       'You can cancel any time from your account: open the request and press Cancel subscription.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'terms' and s.type = 'rich_text';

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(s.content ->> 'body',
       'Payments are handled by Paddle.com, our reseller and Merchant of Record: Paddle processes your card or PayPal details, and we never see or store them.',
       'Payments are handled by PayHere, a licensed Sri Lankan payment gateway: PayHere processes your card details, and we never see or store them.')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'privacy' and s.type = 'rich_text';

update public.page_sections s
   set content = jsonb_set(s.content, '{body}', to_jsonb(
     replace(replace(replace(s.content ->> 'body',
       'Email hello@retexia.com with your request reference (for example LNG-2026-0001), or reply to your Paddle receipt. Refunds go back to the card or PayPal account you paid with, through Paddle, usually within 5 to 10 working days.',
       'Email hello@retexia.com with your request reference (for example LNG-2026-0001). Refunds go back to the card you paid with, through PayHere, usually within 5 to 10 working days.'),
       E'## Who processes refunds\n\nOur order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders and handles refunds and billing questions.',
       E'## Who processes payments\n\nPayments and refunds are processed securely by PayHere.'),
       'Cancel first from your account (**Manage billing**)',
       'Cancel first from your account (**Cancel subscription**)')))
  from public.pages g
 where g.id = s.page_id and g.slug = 'refund-policy' and s.type = 'rich_text';

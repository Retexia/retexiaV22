-- =====================================================================
-- 0010: Paddle for every payment on the website, without a catalog sync.
--
--   * site_settings.online_payments: customers pay through Paddle (on);
--   * products.pay_online: per product (turn off for anything Paddle doesn't
--     allow, such as human services; those requests are reviewed and paid by hand);
--   * new requests wait for payment whenever online payment is on for the product
--     (no Paddle price ids needed: checkout sends the request's own price);
--   * "Approve" emails point to the Pay now button instead of bank details.
--
-- Safe to run again. Run after 0009.
-- =====================================================================

alter table public.site_settings add column if not exists online_payments boolean not null default false;
comment on column public.site_settings.online_payments is 'Customers pay online through Paddle (checkout on the request page).';
alter table public.products add column if not exists pay_online boolean not null default true;
comment on column public.products.pay_online is 'Paid through Paddle at checkout. Off: the team reviews the request and records the payment by hand.';

update public.site_settings set online_payments = true where id = 1;

create or replace function public.prepare_order_paddle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_online boolean;
begin
  if public.is_privileged() or new.status <> 'submitted' then
    return new;
  end if;
  select coalesce(s.online_payments, false) and coalesce(p.pay_online, true)
    into v_online
    from public.site_settings s, public.products p
   where s.id = 1 and p.id = new.product_id;
  if coalesce(v_online, false) and coalesce(new.price_amount, 0) + coalesce(new.setup_fee, 0) > 0 then
    new.status := 'awaiting_payment';
  end if;
  return new;
end;
$$;

update public.order_status_transitions
   set customer_note_template = 'Good news: your request is approved. Open it in your Retexia account and press Pay now to start.'
 where to_status = 'awaiting_payment';

update public.order_statuses
   set description = 'Pay securely with Paddle to start. Your request is saved; pay any time from your account.'
 where key = 'awaiting_payment';


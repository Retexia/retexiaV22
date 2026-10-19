-- =====================================================================
-- 0023: The "you are live" message (email + timeline) after a confirmed first
-- payment links to the product's panel (e.g. https://post.retexia.com), where the
-- first-time setup starts (daily playlist, WhatsApp messages, Facebook & Instagram).
-- Same as apply_payment() in 0020 otherwise. Safe to run again. Run after 0020.
-- =====================================================================

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
    -- The first payment starts the service: setting up, and live for self-serve products.
    if new.kind in ('setup_fee', 'subscription') and v_order.status in ('submitted', 'reviewing', 'awaiting_payment') then
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

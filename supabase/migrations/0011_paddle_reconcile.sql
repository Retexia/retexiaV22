-- =====================================================================
-- 0011: Remember each request's Paddle checkout, so the admin can look the
-- payment up in Paddle ("Check payment in Paddle") even if a webhook was missed.
-- Safe to run again.
-- =====================================================================
create or replace function public.customer_set_paddle_transaction(p_order_id uuid, p_transaction_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_transaction_id !~ '^txn_[a-z0-9]{10,60}$' then
    raise exception 'Not a Paddle transaction' using errcode = '22023';
  end if;
  update public.orders
     set paddle_transaction_id = p_transaction_id
   where id = p_order_id
     and user_id = auth.uid()
     and status in ('submitted', 'reviewing', 'awaiting_payment');
end;
$$;
revoke execute on function public.customer_set_paddle_transaction(uuid, text) from public, anon;
grant execute on function public.customer_set_paddle_transaction(uuid, text) to authenticated;

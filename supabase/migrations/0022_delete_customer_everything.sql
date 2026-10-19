-- =====================================================================
-- 0022: Delete a customer completely from the admin (owners).
--
-- admin_purge_user() removes everything the customer has in the database:
-- their requests and payments, Post business (posts, accounts, media rows)
-- with its Facebook / Instagram tokens in Vault, contact messages and waitlist
-- entries. Lingo bots are unlinked and switched off (the bot data stays).
-- The admin then deletes the login (auth) and the uploaded files (storage),
-- which the database can't do itself. The audit log keeps a record.
-- (The older "delete customer" keeps requests and payments, anonymised.)
-- Safe to run again.
-- =====================================================================

create or replace function public.admin_purge_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text;
  v_businesses uuid[];
  v_orders int;
  v_payments int;
begin
  if not public.has_role(array['owner']) and public.request_role() in ('anon', 'authenticated') then
    raise exception 'Only an owner can delete customers' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  v_email := coalesce(v_profile.email, (select email from auth.users where id = p_user_id));

  -- Post: tokens in Vault, then the businesses (posts, accounts, media rows go with them).
  select coalesce(array_agg(id), '{}') into v_businesses from post.businesses where owner_id = p_user_id;
  perform post.delete_secret(a.token_secret_id)
     from post.social_accounts a
    where a.business_id = any (v_businesses) and a.token_secret_id is not null;
  perform post.delete_secret(m.token_secret_id)
     from post.meta_connections m
    where m.business_id = any (v_businesses) and m.token_secret_id is not null;
  delete from post.businesses where id = any (v_businesses);

  -- Lingo: unlink and switch off their bots (the bot data stays).
  update lingo.lingo_users set owner_id = null, active = false where owner_id = p_user_id;

  -- Requests and their payments.
  select count(*) into v_payments from public.payments where order_id in (select id from public.orders where user_id = p_user_id);
  select count(*) into v_orders from public.orders where user_id = p_user_id;
  delete from public.payments where order_id in (select id from public.orders where user_id = p_user_id);
  delete from public.orders where user_id = p_user_id;

  -- Messages and waitlist entries.
  delete from public.contact_messages where user_id = p_user_id or (v_email is not null and lower(email) = lower(v_email));
  delete from public.waitlist where user_id = p_user_id or (v_email is not null and lower(email) = lower(v_email));

  perform public._audit(
    'customer.purge', 'profiles', p_user_id::text,
    'Deleted customer ' || coalesce(v_email, p_user_id::text) || ' and everything they had: '
      || v_orders || ' request(s), ' || v_payments || ' payment(s), ' || coalesce(array_length(v_businesses, 1), 0) || ' Post business(es)',
    jsonb_build_object('email', v_email, 'name', v_profile.full_name),
    null
  );
  return jsonb_build_object('email', v_email, 'businesses', to_jsonb(v_businesses), 'orders', v_orders, 'payments', v_payments);
end;
$$;

revoke execute on function public.admin_purge_user(uuid) from public, anon;
grant execute on function public.admin_purge_user(uuid) to authenticated, service_role;

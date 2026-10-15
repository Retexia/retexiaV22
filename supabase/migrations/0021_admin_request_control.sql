-- =====================================================================
-- 0021: Full control of requests for admins and owners.
--
--   * admin_set_order_status(): move a request to ANY status (also out of
--     Cancelled or Rejected), skipping the usual steps, payment and setup
--     checks. A reason is required; it is logged in the timeline, the internal
--     notes and the audit log. Linked services follow (Post / Lingo).
--   * admin_delete_order(): delete a request for good, with its payments,
--     timeline and notes. It is cancelled first, so a Post business or Lingo
--     bot linked to it stops. The audit log keeps a record of the deletion.
-- Support keeps the normal step-by-step changes (admin_change_order_status).
-- Safe to run again.
-- =====================================================================

create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_to_status text,
  p_reason text,
  p_customer_note text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_to public.order_statuses%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_note text := nullif(trim(coalesce(p_customer_note, '')), '');
  v_event_id uuid;
begin
  if not public.is_admin() and public.request_role() in ('anon', 'authenticated') then
    raise exception 'Only an admin or owner can set any status' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Please give a reason' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select * into v_to from public.order_statuses where key = p_to_status;
  if not found then
    raise exception 'Unknown status %', p_to_status using errcode = '22023';
  end if;
  if v_order.status = p_to_status then
    raise exception 'The request is already in this status' using errcode = 'P0001';
  end if;

  update public.orders
     set status = p_to_status,
         status_note = v_note,
         starts_at = case when p_to_status = 'active' then coalesce(starts_at, now()) else starts_at end,
         renews_at = case
           when p_to_status = 'active' and renews_at is null then
             coalesce(starts_at, now()) + case when billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end
           else renews_at end,
         paused_at = case when p_to_status = 'paused' then now() when p_to_status <> 'paused' then null else paused_at end,
         -- Reopening a closed request clears when and why it was closed.
         cancelled_at = case when p_to_status = 'cancelled' then now() when not v_to.is_final then null else cancelled_at end,
         cancel_reason = case
           when p_to_status in ('cancelled', 'rejected') then coalesce(v_note, v_reason)
           when not v_to.is_final then null
           else cancel_reason end
   where id = p_order_id;

  select id into v_event_id from public.order_events
   where order_id = p_order_id and to_status = p_to_status
   order by created_at desc limit 1;
  update public.order_events set note = v_note, created_by = auth.uid() where id = v_event_id;

  insert into public.order_notes (order_id, author_id, body)
  values (p_order_id, auth.uid(), 'Status set by an admin (' || v_order.status || ' → ' || p_to_status || '): ' || v_reason);

  perform public._audit(
    'status_set', 'orders', p_order_id::text,
    v_order.ref || ': ' || v_order.status || ' → ' || p_to_status || ' (set by admin)',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', p_to_status, 'reason', v_reason, 'customer_note', v_note)
  );

  if coalesce(p_notify, false) then
    perform public._notify_customer(
      'order.status_changed', p_order_id, v_order.user_id,
      'Update on your request ' || v_order.ref,
      coalesce(v_to.label, p_to_status) || '. ' || coalesce(v_to.description, '')
        || case when v_note is not null then E'\n\n' || v_note else '' end,
      jsonb_build_object('ref', v_order.ref, 'from_status', v_order.status, 'to_status', p_to_status, 'note', v_note)
    );
  end if;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

create or replace function public.admin_delete_order(p_order_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payments int;
begin
  if not public.is_admin() and public.request_role() in ('anon', 'authenticated') then
    raise exception 'Only an admin or owner can delete requests' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Please give a reason' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  -- Stop what runs for it first (Post business, Lingo bot follow the status).
  if v_order.status not in ('cancelled', 'rejected') then
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason where id = p_order_id;
  end if;

  select count(*) into v_payments from public.payments where order_id = p_order_id;
  perform public._audit(
    'delete', 'orders', p_order_id::text,
    'Deleted request ' || v_order.ref || ' (' || coalesce(v_order.package_name, '') || ', ' || v_payments || ' payment(s)): ' || v_reason,
    to_jsonb(v_order) - 'answers' - 'service_data',
    null
  );
  delete from public.payments where order_id = p_order_id;
  delete from public.orders where id = p_order_id;
  return v_order.ref;
end;
$$;

revoke execute on function public.admin_set_order_status(uuid, text, text, text, boolean), public.admin_delete_order(uuid, text) from public, anon;
grant execute on function public.admin_set_order_status(uuid, text, text, text, boolean), public.admin_delete_order(uuid, text) to authenticated, service_role;
